// Sanity-checks the production build in dist/ before it is deployed:
// every landing page, the service worker, manifest, sitemap and 404 page must
// exist and look right. Run after `npm run build`: npm run check:dist
import { existsSync, readFileSync, readdirSync } from "node:fs";

const dist = new URL("../dist/", import.meta.url);
const read = (p) => readFileSync(new URL(p, dist), "utf8");
const problems = [];
const check = (ok, msg) => ok || problems.push(msg);

if (!existsSync(dist)) {
  console.error("dist/ not found — run `npm run build` first.");
  process.exit(1);
}

const sitemap = read("sitemap.xml");
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
check(urls.length > 1, "sitemap.xml lists no pages");

for (const path of urls) {
  const file = `${path.slice(1)}index.html`;
  if (!existsSync(new URL(file, dist))) {
    check(false, `missing ${file} (listed in sitemap)`);
    continue;
  }
  const html = read(file);
  check(!html.includes("<!--seo:"), `${file}: unrendered SEO placeholder`);
  check(html.includes(`rel="canonical" href="https://json.thomaschaplin.me${path}"`), `${file}: wrong or missing canonical URL`);
  check(/<script type="module"[^>]+src="\/assets\/index-[^"]+\.js"/.test(html), `${file}: app entry script missing`);
  for (const [, src] of html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)) {
    check(existsSync(new URL(src.slice(1), dist)), `${file}: references missing asset ${src}`);
  }
}

const notFound = read("404.html");
check(notFound.includes('content="noindex"'), "404.html is not marked noindex");

const manifest = JSON.parse(read("manifest.webmanifest"));
check(manifest.name === "JSON Tools", "manifest name changed");
for (const icon of manifest.icons ?? []) check(existsSync(new URL(icon.src.slice(1), dist)), `manifest icon missing: ${icon.src}`);

const sw = read("sw.js");
check(sw.includes("index.html"), "service worker does not precache index.html");
check(readdirSync(dist).some((f) => /^workbox-.*\.js$/.test(f)), "workbox runtime missing");
check(existsSync(new URL("CNAME", dist)), "CNAME missing (custom domain would break)");

if (problems.length) {
  console.error(`Build check failed:\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}
console.log(`Build check passed: ${urls.length} pages, manifest, service worker, 404 and CNAME look good.`);
