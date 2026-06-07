import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// The site is served from the root of the custom domain (json.thomaschaplin.me),
// so assets must resolve from "/" — never a project subpath.
export default defineConfig({
  base: "/",
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      // Static assets that live in public/ and should also be available to the
      // service worker / referenced by Apple devices.
      includeAssets: ["favicon.ico", "apple-touch-icon.png"],
      manifest: {
        name: "JSON Tools",
        short_name: "JSON Tools",
        description:
          "Format, minify and validate JSON and JSON5 — runs entirely in your browser.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        theme_color: "#eef1f6",
        background_color: "#eef1f6",
        icons: [
          { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        navigateFallback: "/index.html",
        cleanupOutdatedCaches: true,
        // Keep raw SEO assets and the large social image out of the precache —
        // they are still copied to dist/ from public/ and served normally.
        globIgnores: ["**/CNAME", "robots.txt", "sitemap.xml", "og-image.png"],
      },
    }),
  ],
});
