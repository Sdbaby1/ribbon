import { defineChain } from "viem";
import { rpcUrl } from "./config";

export const arc = defineChain({
  id: 5042,
  name: "Arc",
  nativeCurrency: {
    name: "USDC",
    symbol: "USDC",
    decimals: 18,
  },
  rpcUrls: {
    default: { http: [rpcUrl] },
  },
  blockExplorers: {
    default: { name: "Arc Explorer", url: "https://explorer.arc.io" },
  },
});

export const ARC_CHAIN_ID = arc.id;

export function explorerAddress(address: string): string {
  return `https://explorer.arc.io/address/${address}`;
}

export function explorerTx(hash: string): string {
  return `https://explorer.arc.io/tx/${hash}`;
}
