import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { isAddress, verifyMessage, type Hex } from "viem";
import { freshTimestamp, profileMessage, validDisplayName } from "./messages.js";
import type { Profile, ProfileStore } from "./store.js";

const CONTENT_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2",
};

export type RibbonAppOptions = {
  store: ProfileStore;
  now?: () => number;
  origins?: string[];
  staticRoot?: string;
  rpcUrl?: string;
  rpcFetch?: typeof fetch;
};

type ProfileBody = {
  address?: unknown;
  displayName?: unknown;
  issuedAt?: unknown;
  signature?: unknown;
};

type RpcBody = {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
};

const RPC_METHODS = new Set([
  "eth_blockNumber",
  "eth_call",
  "eth_chainId",
  "eth_estimateGas",
  "eth_feeHistory",
  "eth_gasPrice",
  "eth_getBalance",
  "eth_getBlockByHash",
  "eth_getBlockByNumber",
  "eth_getCode",
  "eth_getLogs",
  "eth_getTransactionByHash",
  "eth_getTransactionCount",
  "eth_getTransactionReceipt",
  "eth_maxPriorityFeePerGas",
]);

async function readStatic(root: string, requestPath: string): Promise<{ body: Buffer; type: string } | null> {
  let decoded = requestPath;
  try {
    decoded = decodeURIComponent(requestPath);
  } catch {
    return null;
  }
  const relative = decoded.replace(/^\/+/, "");
  if (relative.includes("\0")) return null;
  const rootPath = path.resolve(root);
  const full = path.resolve(rootPath, relative);
  if (full !== rootPath && !full.startsWith(rootPath + path.sep)) return null;
  try {
    const info = await stat(full);
    if (!info.isFile()) return null;
    const body = await readFile(full);
    const type = CONTENT_TYPES[path.extname(full).toLowerCase()] ?? "application/octet-stream";
    return { body, type };
  } catch {
    return null;
  }
}

function parseAddresses(value: string | undefined): string[] | null {
  if (!value) return [];
  const parts = value.split(",").map((part) => part.trim().toLowerCase()).filter(Boolean);
  if (parts.length > 32) return null;
  if (parts.some((part) => !isAddress(part))) return null;
  return [...new Set(parts)];
}

export function createApp(options: RibbonAppOptions) {
  const now = options.now ?? (() => Date.now());
  const origins = options.origins?.length ? options.origins : ["http://localhost:5173"];
  const app = new Hono();
  const rpcUrl = options.rpcUrl ?? "https://rpc.mainnet.arc.io";
  const rpcFetch = options.rpcFetch ?? fetch;

  app.use(
    "/api/*",
    cors({
      origin: origins,
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type"],
    }),
  );

  app.get("/api/health", (c) => {
    return c.json({
      ok: true,
      service: "ribbon",
      chainId: 5042,
      store: options.store.kind,
    });
  });

  app.post("/api/rpc", async (c) => {
    const contentLength = Number(c.req.header("content-length") || "0");
    if (contentLength > 100_000) return c.json({ ok: false, error: "RPC request is too large." }, 413);

    let body: RpcBody;
    try {
      body = (await c.req.json()) as RpcBody;
    } catch {
      return c.json({ ok: false, error: "Send one JSON-RPC request." }, 400);
    }
    if (
      body.jsonrpc !== "2.0" ||
      typeof body.method !== "string" ||
      !RPC_METHODS.has(body.method) ||
      !Array.isArray(body.params)
    ) {
      return c.json({ ok: false, error: "That RPC method is not available through Ribbon." }, 400);
    }

    try {
      const upstream = await rpcFetch(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const responseBody = await upstream.text();
      if (!upstream.ok) return c.json({ ok: false, error: "Arc RPC did not accept the request." }, 502);
      return new Response(responseBody, {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    } catch {
      return c.json({ ok: false, error: "Arc RPC did not respond." }, 502);
    }
  });

  app.get("/api/profiles", async (c) => {
    const addresses = parseAddresses(c.req.query("addresses"));
    if (addresses === null) return c.json({ ok: false, error: "Provide up to 32 wallet addresses." }, 400);
    try {
      const profiles = await options.store.list(addresses);
      return c.json({ ok: true, profiles });
    } catch {
      return c.json({ ok: false, error: "The profile store did not respond." }, 502);
    }
  });

  app.get("/api/profiles/:address", async (c) => {
    const address = c.req.param("address").toLowerCase();
    if (!isAddress(address)) return c.json({ ok: false, error: "That is not a wallet address." }, 400);
    try {
      const profile = await options.store.get(address);
      if (!profile) return c.json({ ok: false, error: "No profile for that address." }, 404);
      return c.json({ ok: true, profile });
    } catch {
      return c.json({ ok: false, error: "The profile store did not respond." }, 502);
    }
  });

  app.post("/api/profiles", async (c) => {
    let body: ProfileBody;
    try {
      body = (await c.req.json()) as ProfileBody;
    } catch {
      return c.json({ ok: false, error: "Send a JSON body." }, 400);
    }

    if (typeof body.address !== "string" || !isAddress(body.address)) {
      return c.json({ ok: false, error: "address must be a wallet address." }, 400);
    }
    if (typeof body.displayName !== "string" || !validDisplayName(body.displayName)) {
      return c.json(
        { ok: false, error: "displayName must be 1-32 characters and start with a letter or number." },
        400,
      );
    }
    if (typeof body.issuedAt !== "number" || !freshTimestamp(body.issuedAt, now())) {
      return c.json({ ok: false, error: "issuedAt is outside the 10 minute signing window." }, 400);
    }
    if (typeof body.signature !== "string" || !/^0x[0-9a-fA-F]+$/.test(body.signature)) {
      return c.json({ ok: false, error: "signature must be a hex signature." }, 400);
    }

    const address = body.address.toLowerCase();
    const message = profileMessage(address, body.displayName, body.issuedAt);
    let signed = false;
    try {
      signed = await verifyMessage({
        address: body.address,
        message,
        signature: body.signature as Hex,
      });
    } catch {
      signed = false;
    }
    if (!signed) return c.json({ ok: false, error: "The signature does not match this address and name." }, 401);

    const profile: Profile = {
      address,
      displayName: body.displayName,
      updatedAt: new Date(now()).toISOString(),
    };
    try {
      await options.store.upsert(profile);
    } catch {
      return c.json({ ok: false, error: "The profile store rejected the write." }, 502);
    }
    return c.json({ ok: true, profile }, 201);
  });

  if (options.staticRoot) {
    const root = options.staticRoot;
    app.get("*", async (c) => {
      const requestPath = c.req.path === "/" ? "/index.html" : c.req.path;
      const file = await readStatic(root, requestPath);
      if (file) {
        c.header("Content-Type", file.type);
        return c.body(new Uint8Array(file.body));
      }
      if (path.extname(c.req.path)) return c.notFound();
      const index = await readStatic(root, "/index.html");
      if (!index) return c.notFound();
      c.header("Content-Type", index.type);
      return c.body(new Uint8Array(index.body));
    });
  }

  return app;
}
