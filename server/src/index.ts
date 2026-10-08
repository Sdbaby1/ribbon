import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { createMemoryStore, createSupabaseStore } from "./store.js";

const here = path.dirname(fileURLToPath(import.meta.url));
// src/ during dev and dist/ in production are both two levels under the repo root.
dotenv.config({ path: path.resolve(here, "../../.env") });
const port = Number(process.env.PORT || 8787);
const origins = (process.env.WEB_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const staticRoot = process.env.WEB_DIST || path.resolve(here, "../../web/dist");

const supabaseUrl = process.env.SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const store =
  supabaseUrl && serviceRoleKey ? createSupabaseStore(supabaseUrl, serviceRoleKey) : createMemoryStore();

if (store.kind === "memory") {
  console.log("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is unset. Display names stay in memory for this process.");
}

const app = createApp({ store, origins, staticRoot, rpcUrl: process.env.ARC_RPC_URL?.trim() });

serve({ fetch: app.fetch, port }, () => {
  console.log(`Ribbon API on http://localhost:${port} (profile store: ${store.kind})`);
});
