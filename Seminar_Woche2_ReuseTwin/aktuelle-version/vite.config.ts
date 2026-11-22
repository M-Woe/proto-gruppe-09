import { defineConfig, loadEnv } from "vite";

// The pages (Inventory, Import, Studio). /api goes to the core (`npm start` or `npm run core`), /ollama to the local
// Ollama for the chat. The core's port can be changed with REUSE_TWIN_CORE_PORT (default 8765).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "REUSE_TWIN_");
  return {
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        "/api": `http://127.0.0.1:${env.REUSE_TWIN_CORE_PORT || "8765"}`,
        "/ollama": { target: "http://127.0.0.1:11434", changeOrigin: true, rewrite: (p) => p.replace(/^\/ollama/, "") },
      },
    },
    build: {
      outDir: "dist",
      emptyOutDir: true,
      rollupOptions: { input: { inventory: "index.html", import: "import.html", studio: "studio.html" } },
    },
  };
});
