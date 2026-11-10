/**
 * Build-time HTML for each landing page: head tags, structured data and the
 * crawlable "about" section. Pure string functions so the Vite config can use
 * them without a DOM.
 */
import { FAQ, PAGES, SITE_NAME, SITE_URL, pagePath, pageUrl, type Page } from "./pages";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function ogImageFor(page: Page): string {
  return `${SITE_URL}/og/${page.slug || "home"}.png`;
}

export function renderHead(page: Page): string {
  const url = pageUrl(page);
  const img = ogImageFor(page);
  const alt = `${page.card[0]} — ${page.card[1]}`;
  return [
    `<title>${esc(page.title)}</title>`,
    `<meta name="description" content="${esc(page.description)}">`,
    `<link rel="canonical" href="${url}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${SITE_NAME}">`,
    `<meta property="og:locale" content="en_US">`,
    `<meta property="og:title" content="${esc(page.title)}">`,
    `<meta property="og:description" content="${esc(page.description)}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:image" content="${img}">`,
    `<meta property="og:image:type" content="image/png">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:image:alt" content="${esc(alt)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(page.title)}">`,
    `<meta name="twitter:description" content="${esc(page.description)}">`,
    `<meta name="twitter:image" content="${img}">`,
    `<meta name="twitter:image:alt" content="${esc(alt)}">`,
    `<script type="application/ld+json">${JSON.stringify(jsonLd(page)).replace(/</g, "\\u003c")}</script>`,
  ].join("\n    ");
}

export function jsonLd(page: Page): unknown {
  const url = pageUrl(page);
  const graph: unknown[] = [
    {
      "@type": "WebApplication",
      "@id": `${url}#app`,
      name: page.slug ? `${page.h1} — ${SITE_NAME}` : SITE_NAME,
      url,
      description: page.description,
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Any",
      browserRequirements: "Requires JavaScript and a modern browser.",
      inLanguage: "en",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      author: { "@type": "Person", name: "Thomas Chaplin", url: "https://thomaschaplin.me" },
      image: ogImageFor(page),
      featureList: [
        "Format and beautify JSON",
        "Validate JSON with precise errors",
        "Repair broken JSON",
        "JSON5 support",
        "Interactive tree and table views",
        "JSONPath and JavaScript queries",
        "Semantic JSON diff",
        "JSON Schema validation and generation",
        "Convert JSON to YAML, CSV, XML, TOML",
        "Generate TypeScript, Zod, Go, Rust, Python and Kotlin types",
        "Works offline as a PWA",
      ],
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: SITE_NAME,
      url: `${SITE_URL}/`,
    },
  ];
  if (page.slug) {
    graph.push({
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: SITE_NAME, item: `${SITE_URL}/` },
        { "@type": "ListItem", position: 2, name: page.h1, item: url },
      ],
    });
  } else {
    graph.push({
      "@type": "FAQPage",
      mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    });
  }
  return { "@context": "https://schema.org", "@graph": graph };
}

const FEATURES: [string, string][] = [
  ["Format, minify & repair", "Lossless pretty printing that never rounds big numbers, minify with byte savings, and one-click repair for comments, trailing commas, quotes and Python literals."],
  ["Validate as you type", "Human-readable errors with exact line and column, inline squiggles, and warnings for duplicate keys and numbers beyond the safe integer range."],
  ["Tree & table views", "Explore huge documents as a searchable tree with path copying, or view arrays of objects as a sortable, filterable grid."],
  ["Query with JSONPath or JS", "Filters, slices, recursive descent and regex — or arbitrary JavaScript transforms in a sandboxed worker."],
  ["Semantic diff", "Compare two documents ignoring key order, match array items by id, and see every added, removed and changed path."],
  ["JSON Schema", "Validate against draft 2020-12, 2019-09 or draft-07 with clickable errors, or infer a schema from your data."],
  ["Convert anything", "JSON to and from YAML, CSV, TSV, XML, TOML, NDJSON, query strings and JWTs."],
  ["Generate types", "TypeScript, Zod, Go, Rust, Python (Pydantic) and Kotlin from sample data, with optional and nullable fields inferred."],
  ["Private & offline", "Nothing is uploaded. Documents stay in your browser, share links live in the URL fragment, and the app works offline once installed."],
];

export function renderAbout(page: Page): string {
  const tools = PAGES.filter((p) => p.slug)
    .map((p) => `<li><a href="${pagePath(p)}"${p === page ? ' aria-current="page"' : ""}>${esc(p.h1)}</a></li>`)
    .join("");
  const faq = FAQ.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("");
  const features = FEATURES.map(([t, d]) => `<div class="feature"><h3>${esc(t)}</h3><p>${esc(d)}</p></div>`).join("");
  return `<section id="about" class="about" aria-labelledby="about-title">
      <div class="about-inner">
        <p class="eyebrow">${page.slug ? `<a href="/">${SITE_NAME}</a> / ${esc(page.card[0])}` : "Free · Private · Offline-ready"}</p>
        <h1 id="about-title">${esc(page.h1)}</h1>
        <p class="lede">${esc(page.intro)}</p>
        <p><a class="btn btn-primary" href="#workspace">Open the editor</a></p>
        <h2>Everything you need to work with JSON</h2>
        <div class="features">${features}</div>
        <h2>All tools</h2>
        <ul class="tool-links">${tools}</ul>
        <h2>Frequently asked questions</h2>
        <div class="faq">${faq}</div>
        <footer class="site-footer">
          <span>Made by <a href="https://thomaschaplin.me" rel="author">Thomas Chaplin</a></span>
          <span>·</span>
          <a href="https://github.com/thomaschaplin/json-tools">Source on GitHub</a>
          <span>·</span>
          <span>Your data never leaves your device.</span>
        </footer>
      </div>
    </section>`;
}

export function renderSitemap(lastmod: string): string {
  const urls = PAGES.map(
    (p) => `  <url>\n    <loc>${pageUrl(p)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>${p.slug ? "0.8" : "1.0"}</priority>\n  </url>`,
  ).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

/** Apply a page to the HTML template. */
export function renderPage(template: string, page: Page): string {
  return template.replace("<!--seo:head-->", () => renderHead(page)).replace("<!--seo:about-->", () => renderAbout(page));
}
