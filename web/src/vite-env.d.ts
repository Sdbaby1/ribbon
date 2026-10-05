/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_RIBBON_ADDRESS?: string;
  readonly VITE_ARC_RPC_URL?: string;
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
