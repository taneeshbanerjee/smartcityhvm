// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    plugins: [
      VitePWA({
        registerType: "autoUpdate",
        injectRegister: null,
        manifest: false,
        filename: "sw.js",
        // TanStack Start / Nitro deploy the client from .output/public, not vite's default dist,
        // so the service worker must be written there and precache the files found there.
        outDir: ".output/public",
        devOptions: { enabled: false },
        workbox: {
          globDirectory: ".output/public",
          globPatterns: ["**/*.{js,css,png,svg,webmanifest,woff2}"],
          // Standalone 3D model, game and heading-board pages load their own large scripts on demand.
          globIgnores: ["smart-city-model/**", "smart-city-game/**", "heading-boards/**"],
          navigateFallback: null,
          cleanupOutdatedCaches: true,
          runtimeCaching: [
            {
              urlPattern: ({ request, url }) =>
                request.mode === "navigate" && !url.pathname.startsWith("/~oauth"),
              handler: "NetworkFirst",
              options: { cacheName: "pages", networkTimeoutSeconds: 3 },
            },
          ],
        },
      }),
    ],
  },
});
