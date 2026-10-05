import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react()],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  build: {
    emptyOutDir: true,
    outDir: "dist",
    lib: {
      entry: fileURLToPath(new URL("./src/main.jsx", import.meta.url)),
      formats: ["es"],
      fileName: () => "fairshare.js",
    },
    rollupOptions: {
      output: {
        assetFileNames: (asset) => asset.name?.endsWith(".css") ? "fairshare.css" : "[name][extname]",
      },
    },
  },
});
