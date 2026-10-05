function seenKey(chainId: number): string {
  return `ribbon.seen.${chainId}`;
}

function inviteKey(chainId: number, circleId: string): string {
  return `ribbon.invite.${chainId}.${circleId}`;
}

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function readSeenCircles(chainId: number): string[] {
  const parsed = readJson(seenKey(chainId));
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((id): id is string => typeof id === "string" && /^[1-9]\d*$/.test(id));
}

export function rememberCircle(chainId: number, circleId: bigint): void {
  const id = circleId.toString();
  const current = readSeenCircles(chainId);
  if (current.includes(id)) return;
  try {
    localStorage.setItem(seenKey(chainId), JSON.stringify([...current, id]));
  } catch {
    // Private mode can reject storage. The circle still exists on Arc.
  }
}

export function saveInvite(chainId: number, circleId: bigint, code: string): void {
  try {
    localStorage.setItem(inviteKey(chainId, circleId.toString()), code);
  } catch {
    // The caller still shows the code on screen.
  }
}

export function readInvite(chainId: number, circleId: bigint): string | null {
  try {
    return localStorage.getItem(inviteKey(chainId, circleId.toString()));
  } catch {
    return null;
  }
}
