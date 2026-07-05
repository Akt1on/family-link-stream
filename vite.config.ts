import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { nitro } from "nitro/vite";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";

export default defineConfig({
  vite: {
    plugins: [
      nitro({
        preset: "vercel",
      }),
      mcpPlugin(),
    ],
  },
});