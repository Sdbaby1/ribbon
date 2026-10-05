import { injected } from "@wagmi/core";
import { createConfig, http } from "wagmi";
import { arc } from "./chain";
import { rpcUrl } from "./config";

export const wagmiConfig = createConfig({
  chains: [arc],
  connectors: [injected({ shimDisconnect: true })],
  transports: {
    [arc.id]: http(rpcUrl),
  },
  ssr: false,
});
