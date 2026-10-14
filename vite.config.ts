import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// Served at https://pavankh84.github.io/voicememo-converter/
export default defineConfig({
  base: "/voicememo-converter/",
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "Voice Memo to MP3",
        short_name: "Memo2MP3",
        description:
          "Convert iPhone Voice Memos to MP3 and get a transcript, entirely in your browser.",
        theme_color: "#180f2e",
        background_color: "#0f1115",
        display: "standalone",
        start_url: "/voicememo-converter/",
        scope: "/voicememo-converter/",
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "pwa-maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // App shell is small; let Workbox pick up the big WASM/model assets via
        // runtimeCaching below instead of trying to precache them.
        globPatterns: ["**/*.{js,css,html,svg,png,ico}"],
        runtimeCaching: [
          {
            // ffmpeg.wasm core + ML model weights, fetched from CDNs at runtime.
            urlPattern: ({ url }: { url: URL }) =>
              url.hostname === "unpkg.com" || url.hostname === "huggingface.co" ||
              url.hostname.endsWith(".hf.co"),
            handler: "CacheFirst",
            options: {
              cacheName: "voicememo-converter-cdn-assets",
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Same-origin onnxruntime-web .wasm bundle (~26MB) — too big for the
            // SW precache list, so cache it on first use instead.
            urlPattern: ({ url, sameOrigin }: { url: URL; sameOrigin: boolean }) =>
              sameOrigin && url.pathname.endsWith(".wasm"),
            handler: "CacheFirst",
            options: {
              cacheName: "voicememo-converter-wasm",
              expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});
