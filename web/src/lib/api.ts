import { apiBase } from "../config";

export type Profile = {
  address: string;
  displayName: string;
};

function url(path: string): string {
  return `${apiBase}${path}`;
}

export async function fetchNames(addresses: string[]): Promise<Record<string, string>> {
  if (addresses.length === 0) return {};
  try {
    const query = addresses.map((address) => address.toLowerCase()).join(",");
    const response = await fetch(url(`/api/profiles?addresses=${query}`));
    if (!response.ok) return {};
    const body = (await response.json()) as { profiles?: Profile[] };
    const names: Record<string, string> = {};
    for (const profile of body.profiles ?? []) names[profile.address] = profile.displayName;
    return names;
  } catch {
    return {};
  }
}

export async function saveName(input: {
  address: string;
  displayName: string;
  issuedAt: number;
  signature: string;
}): Promise<string | null> {
  const response = await fetch(url("/api/profiles"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (response.ok) return null;
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  return body.error || "The name could not be saved.";
}
