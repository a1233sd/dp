import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || "http://127.0.0.1:8000";
const apiProxy = [
  "/archive",
  "/auth",
  "/checks",
  "/documents",
  "/health",
  "/me",
  "/openapi.json",
  "/profiles",
  "/rules",
  "/settings",
  "/users",
].reduce((proxy, path) => {
  proxy[path] = {
    target: apiProxyTarget,
    changeOrigin: true,
  };
  return proxy;
}, {});

export default defineConfig({
  base: "/static/",
  plugins: [react()],
  server: {
    proxy: apiProxy,
  },
  build: {
    outDir: resolve(__dirname, "../app/static"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          antd: ["antd", "@ant-design/icons"],
        },
      },
    },
    chunkSizeWarningLimit: 1400,
  },
});
