import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { profileMessage } from "./messages.js";
import { createMemoryStore, type ProfileStore } from "./store.js";

const account = privateKeyToAccount("0x1111111111111111111111111111111111111111111111111111111111111111");
const NOW = 1_700_000_000_000;

function appFor(store: ProfileStore = createMemoryStore(), staticRoot?: string) {
  return createApp({ store, now: () => NOW, staticRoot });
}

async function signedProfile(displayName: string, issuedAt = NOW) {
  const address = account.address.toLowerCase();
  const message = profileMessage(address, displayName, issuedAt);
  const signature = await account.signMessage({ message });
  return { address: account.address, displayName, issuedAt, signature };
}

describe("profile API", () => {
  it("proxies read-only Arc RPC calls and rejects transaction submission", async () => {
    const rpcFetch = async (_input: string | URL | Request, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as { id: number; method: string };
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: "0x13b2" }), {
        headers: { "content-type": "application/json" },
      });
    };
    const app = createApp({ store: createMemoryStore(), rpcFetch });
    const allowed = await app.request("/api/rpc", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
    });
    expect(allowed.status).toBe(200);
    expect(await allowed.json()).toEqual({ jsonrpc: "2.0", id: 1, result: "0x13b2" });

    const rejected = await app.request("/api/rpc", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "eth_sendRawTransaction", params: ["0x00"] }),
    });
    expect(rejected.status).toBe(400);
  });

  it("stores a name only when the wallet signature matches", async () => {
    const app = appFor();
    const body = await signedProfile("Ada Lovelace");
    const created = await app.request("/api/profiles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(created.status).toBe(201);
    const saved = (await created.json()) as { profile: { address: string; displayName: string } };
    expect(saved.profile.address).toBe(account.address.toLowerCase());
    expect(saved.profile.displayName).toBe("Ada Lovelace");

    const listed = await app.request(`/api/profiles?addresses=${account.address}`);
    expect(listed.status).toBe(200);
    const page = (await listed.json()) as { profiles: { displayName: string }[] };
    expect(page.profiles.map((profile) => profile.displayName)).toEqual(["Ada Lovelace"]);
  });

  it("rejects a bad signature, a stale timestamp, and a bad name", async () => {
    const app = appFor();
    const body = await signedProfile("Ada");
    const forged = await app.request("/api/profiles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, displayName: "Grace" }),
    });
    expect(forged.status).toBe(401);

    const stale = await signedProfile("Ada", NOW - 11 * 60 * 1000);
    const expired = await app.request("/api/profiles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(stale),
    });
    expect(expired.status).toBe(400);

    const unnamed = await app.request("/api/profiles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, displayName: "  " }),
    });
    expect(unnamed.status).toBe(400);
  });

  it("reports a store failure without writing through", async () => {
    const broken: ProfileStore = {
      kind: "memory",
      async upsert() {
        throw new Error("down");
      },
      async get() {
        return null;
      },
      async list() {
        throw new Error("down");
      },
    };
    const app = appFor(broken);
    const body = await signedProfile("Ada");
    const response = await app.request("/api/profiles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(response.status).toBe(502);
  });

  it("serves the built web app and refuses to leave the static root", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ribbon-web-"));
    await mkdir(path.join(root, "assets"));
    await writeFile(path.join(root, "index.html"), "<!doctype html><title>Ribbon</title>", "utf8");
    await writeFile(path.join(root, "assets", "app.js"), "console.log(1)", "utf8");
    const app = appFor(createMemoryStore(), root);

    const home = await app.request("/");
    expect(home.status).toBe(200);
    expect(await home.text()).toContain("Ribbon");

    const circle = await app.request("/c/12");
    expect(circle.status).toBe(200);
    expect(await circle.text()).toContain("Ribbon");

    const asset = await app.request("/assets/app.js");
    expect(asset.status).toBe(200);
    expect(asset.headers.get("content-type")).toContain("javascript");

    const escape = await app.request("/../package.json");
    expect(escape.status).toBe(404);

    const health = await app.request("/api/health");
    expect(health.status).toBe(200);
    const body = (await health.json()) as { chainId: number; store: string };
    expect(body.chainId).toBe(5042);
    expect(body.store).toBe("memory");
  });
});
