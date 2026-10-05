import { shortenAddress } from "../lib/usdc";

export function Identity({ address, names }: { address: string; names: Record<string, string> }) {
  const name = names[address.toLowerCase()];
  return (
    <span className="identity">
      {name ? <strong>{name}</strong> : null} <code>{shortenAddress(address)}</code>
    </span>
  );
}
