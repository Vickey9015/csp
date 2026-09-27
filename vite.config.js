import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? "/csp/" : "/",
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
});
