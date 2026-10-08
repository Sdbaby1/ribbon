import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // Workspace builds run with cwd web/. The shared .env is the repo root.
  envDir: "..",
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
});
