const SCALE = 1_000_000n;

export function parseUsdc(input: string): bigint {
  const value = input.trim();
  if (!/^\d+(\.\d{1,6})?$/.test(value)) {
    throw new Error("Enter a USDC amount with up to 6 decimal places.");
  }
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * SCALE + BigInt(fraction.padEnd(6, "0"));
}

export function formatUsdc(amount: bigint, digits = 2): string {
  const negative = amount < 0n;
  const value = negative ? -amount : amount;
  const whole = value / SCALE;
  const fraction = (value % SCALE).toString().padStart(6, "0").slice(0, digits);
  const text = digits === 0 ? whole.toString() : `${whole.toString()}.${fraction}`;
  return negative ? `-${text}` : text;
}

export function shortenAddress(address: string): string {
  if (address.length < 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function utf8Size(value: string): number {
  return new TextEncoder().encode(value).length;
}
