/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        // Separa las dependencias grandes en chunks propios para que se
        // cacheen entre deploys (cambian poco) y no inflen el bundle inicial.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("@tabler/icons-react")) return "icons";
          if (id.includes("recharts") || id.includes("@mantine/charts"))
            return "charts";
          if (id.includes("@mantine")) return "mantine";
          return undefined;
        },
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    css: false,
  },
});
