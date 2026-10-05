import "dotenv/config";
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const rawKey = process.env.DEPLOYER_PRIVATE_KEY?.trim();
const accounts = rawKey ? [rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`] : [];

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
    },
  },
  networks: {
    hardhat: {
      accounts: { count: 12 },
    },
    arc: {
      url: process.env.ARC_RPC_URL || "https://rpc.mainnet.arc.io",
      chainId: 5042,
      accounts,
    },
    arcTestnet: {
      url: process.env.ARC_TESTNET_RPC_URL || "https://rpc.testnet.arc.io",
      chainId: 5042002,
      accounts,
    },
  },
};

export default config;
