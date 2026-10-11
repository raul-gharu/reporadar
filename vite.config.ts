import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base so the same build works on Vercel and in sub-path previews.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: { outDir: "dist", sourcemap: false },
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
} as any);
