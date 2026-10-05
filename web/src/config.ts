import { isAddress, type Address } from "viem";

const configured = import.meta.env.VITE_RIBBON_ADDRESS?.trim();

export const ribbonAddress: Address | null = configured && isAddress(configured) ? configured : null;

export const rpcUrl = import.meta.env.VITE_ARC_RPC_URL?.trim() || "https://rpc.mainnet.arc.io";

export const apiBase = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
