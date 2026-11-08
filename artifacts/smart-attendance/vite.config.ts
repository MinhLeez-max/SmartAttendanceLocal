import path from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/",
  plugins: [react(), tailwindcss({ optimize: false })],
  root: import.meta.dirname,
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") }, dedupe: ["react", "react-dom"] },
  build: { outDir: "dist/public", emptyOutDir: true },
  server: {
    host: "localhost", port: 5173, strictPort: true,
    // Local edition has no Replit routing proxy: Vite owns this same-origin path.
    proxy: { "/api": { target: "http://127.0.0.1:8080", changeOrigin: false } },
  },
  preview: { host: "localhost", port: 5173, strictPort: true,
    proxy: { "/api": { target: "http://127.0.0.1:8080", changeOrigin: false } },
  },
});
