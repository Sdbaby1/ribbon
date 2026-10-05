import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type Profile = {
  address: string;
  displayName: string;
  updatedAt: string;
};

export interface ProfileStore {
  readonly kind: "memory" | "supabase";
  upsert(profile: Profile): Promise<void>;
  get(address: string): Promise<Profile | null>;
  list(addresses: string[]): Promise<Profile[]>;
}

type ProfileRow = {
  address: string;
  display_name: string;
  updated_at: string;
};

function fromRow(row: ProfileRow): Profile {
  return {
    address: row.address,
    displayName: row.display_name,
    updatedAt: row.updated_at,
  };
}

export function createMemoryStore(): ProfileStore {
  const rows = new Map<string, Profile>();
  return {
    kind: "memory",
    async upsert(profile) {
      rows.set(profile.address, profile);
    },
    async get(address) {
      return rows.get(address) ?? null;
    },
    async list(addresses) {
      return addresses.flatMap((address) => {
        const profile = rows.get(address);
        return profile ? [profile] : [];
      });
    },
  };
}

export function createSupabaseStore(url: string, serviceRoleKey: string): ProfileStore {
  const client: SupabaseClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return {
    kind: "supabase",
    async upsert(profile) {
      const { error } = await client.from("profiles").upsert({
        address: profile.address,
        display_name: profile.displayName,
        updated_at: profile.updatedAt,
      });
      if (error) throw new Error(error.message);
    },
    async get(address) {
      const { data, error } = await client
        .from("profiles")
        .select("address, display_name, updated_at")
        .eq("address", address)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? fromRow(data as ProfileRow) : null;
    },
    async list(addresses) {
      if (addresses.length === 0) return [];
      const { data, error } = await client
        .from("profiles")
        .select("address, display_name, updated_at")
        .in("address", addresses);
      if (error) throw new Error(error.message);
      return (data as ProfileRow[] | null)?.map(fromRow) ?? [];
    },
  };
}
