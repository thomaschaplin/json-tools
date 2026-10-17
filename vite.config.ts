import { defineConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { PAGES, pageBySlug } from "./src/seo/pages";
import { renderPage, renderSitemap } from "./src/seo/render";

/**
 * Emits one static HTML page per landing page (each with its own title,
 * description, canonical URL, social card and structured data) plus a
 * sitemap. In dev, the page matching the request path is rendered on the fly.
 */
function seoPages(): Plugin {
  return {
    name: "seo-pages",
    enforce: "post",
    transformIndexHtml: {
      order: "pre",
      handler(html, ctx) {
        if (!ctx.server) return html; // build: handled in generateBundle
        const page = pageBySlug((ctx.originalUrl ?? ctx.path).split(/[?#]/)[0]) ?? PAGES[0];
        return renderPage(html, page);
      },
    },
    generateBundle(_options, bundle) {
      const index = bundle["index.html"];
      if (!index || index.type !== "asset") return;
      const template = String(index.source);
      for (const page of PAGES) {
        const html = renderPage(template, page);
        if (!page.slug) index.source = html;
        else this.emitFile({ type: "asset", fileName: `${page.slug}/index.html`, source: html });
      }
      const notFound = renderPage(template, PAGES[0]).replace(
        '<meta name="robots" content="index, follow, max-image-preview:large">',
        '<meta name="robots" content="noindex">',
      );
      this.emitFile({ type: "asset", fileName: "404.html", source: notFound });
      this.emitFile({ type: "asset", fileName: "sitemap.xml", source: renderSitemap(new Date().toISOString().slice(0, 10)) });
    },
  };
}

// The site is served from the root of the custom domain (json.thomaschaplin.me).
export default defineConfig({
  base: "/",
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 900,
  },
  worker: { format: "es" },
  plugins: [
    seoPages(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: ["favicon.ico", "favicon.svg", "apple-touch-icon.png"],
      manifest: {
        id: "/",
        name: "JSON Tools",
        short_name: "JSON Tools",
        description: "The JSON workbench for engineers — format, validate, query, diff, convert and generate types. Private and offline.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        display_override: ["window-controls-overlay", "standalone"],
        theme_color: "#0b0d12",
        background_color: "#0b0d12",
        categories: ["developer", "productivity", "utilities"],
        icons: [
          { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png" },
          { src: "/pwa-maskable-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
        shortcuts: [
          { name: "JSON Formatter", url: "/json-formatter/" },
          { name: "JSONPath Tester", url: "/jsonpath-tester/" },
          { name: "JSON Diff", url: "/json-diff/" },
          { name: "JSON to TypeScript", url: "/json-to-typescript/" },
        ],
        file_handlers: [
          {
            action: "/",
            accept: {
              "application/json": [".json", ".json5", ".jsonc", ".geojson"],
              "application/x-ndjson": [".ndjson", ".jsonl"],
            },
          },
        ],
        launch_handler: { client_mode: "focus-existing" },
      } as Record<string, unknown>,
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        navigateFallback: "/index.html",
        cleanupOutdatedCaches: true,
        globIgnores: ["**/CNAME", "robots.txt", "sitemap.xml", "og/**", "404.html", "**/*cyrillic*", "**/*greek*", "**/*vietnamese*"],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
    }),
  ],
});
