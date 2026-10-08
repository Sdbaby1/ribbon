import { handle } from "@hono/node-server/vercel";
import { createApp } from "../server/dist/app.js";
import { createSupabaseStore } from "../server/dist/store.js";

const url = process.env.SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !key) throw new Error("Configure Supabase before deploying Ribbon.");

const origins = (process.env.WEB_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
for (const hostname of [process.env.VERCEL_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL]) {
  if (hostname) origins.push(`https://${hostname}`);
}

export default handle(createApp({ store: createSupabaseStore(url, key), origins }));
