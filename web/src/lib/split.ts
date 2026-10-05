export const MAX_MEMBERS = 8;

export function equalSplit(amount: bigint, count: number): bigint[] {
  if (!Number.isInteger(count) || count < 2 || count > MAX_MEMBERS || amount < BigInt(count)) {
    throw new Error("Choose 2 to 8 people and at least 0.000001 USDC for each.");
  }
  const base = amount / BigInt(count);
  const remainder = amount % BigInt(count);
  return Array.from({ length: count }, (_, index) => base + (BigInt(index) < remainder ? 1n : 0n));
}

export function netsAfterSplit(payer: string, participants: string[], shares: bigint[], total: bigint): Map<string, bigint> {
  if (participants.length !== shares.length) throw new Error("Each person needs one share.");
  const nets = new Map<string, bigint>();
  participants.forEach((address, index) => {
    const key = address.toLowerCase();
    nets.set(key, (nets.get(key) ?? 0n) - shares[index]);
  });
  const payerKey = payer.toLowerCase();
  nets.set(payerKey, (nets.get(payerKey) ?? 0n) + total);
  return nets;
}
