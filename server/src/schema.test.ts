import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const schemaPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../supabase/schema.sql");

describe("supabase schema", () => {
  const sql = readFileSync(schemaPath, "utf8");

  it("creates the profiles table and locks it behind RLS", () => {
    expect(sql).toContain("create table if not exists public.profiles");
    expect(sql).toContain("address text primary key");
    expect(sql).toContain("display_name text not null");
    expect(sql).toContain("profiles_address_fmt");
    expect(sql).toContain("enable row level security");
    expect(sql).not.toContain("create policy");
  });
});
