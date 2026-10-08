import { isAddress, type Address } from "viem";

const configured = import.meta.env.VITE_RIBBON_ADDRESS?.trim();

export const ribbonAddress: Address | null = configured && isAddress(configured) ? configured : null;

export const arcRpcUrl = import.meta.env.VITE_ARC_RPC_URL?.trim() || "https://rpc.mainnet.arc.io";

// Browser reads use the same origin so privacy tools and extension policies do not block Arc RPC calls.
// Wallets still receive Arc's official absolute RPC URL from the chain definition.
export const rpcUrl = "/api/rpc";

export const apiBase = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
