export function formatInvite(circleId: bigint, code: `0x${string}`): string {
  return `ribbon:${circleId.toString()}:${code}`;
}

export function parseInvite(raw: string): { circleId: bigint; code: `0x${string}` } | null {
  const match = /^ribbon:([1-9]\d*):0x([0-9a-fA-F]{64})$/.exec(raw.trim());
  if (!match) return null;
  return { circleId: BigInt(match[1]), code: `0x${match[2]}` };
}

export function randomSalt(): `0x${string}` {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `0x${hex}`;
}
