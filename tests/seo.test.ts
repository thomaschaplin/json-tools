import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FAQ, PAGES, SITE_URL, pageBySlug, pageFor, pagePath, pageUrl } from "../src/seo/pages";
import { jsonLd, renderHead, renderPage, renderSitemap } from "../src/seo/render";

const template = readFileSync(new URL("../index.html", import.meta.url), "utf8");

describe("page table", () => {
  it("has unique slugs and exactly one home page", () => {
    const slugs = PAGES.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs.filter((s) => s === "")).toHaveLength(1);
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9-]*$/);
  });

  it("has complete metadata and a social card for every page", () => {
    for (const p of PAGES) {
      expect(p.title.length, p.slug).toBeGreaterThan(10);
      expect(p.description.length, p.slug).toBeGreaterThanOrEqual(100);
      expect(p.description.length, p.slug).toBeLessThanOrEqual(180); // search engines truncate around here
      expect(p.h1 && p.intro, p.slug).toBeTruthy();
      expect(p.card).toHaveLength(2);
      const og = new URL(`../public/og/${p.slug || "home"}.png`, import.meta.url);
      expect(() => readFileSync(og), `missing ${og.pathname}`).not.toThrow();
    }
  });

  it("resolves slugs, URLs and views", () => {
    expect(pageBySlug("/json-diff/")?.view).toBe("diff");
    expect(pageBySlug("nope")).toBeUndefined();
    const home = pageBySlug("")!;
    expect(pageUrl(home)).toBe(`${SITE_URL}/`);
    expect(pagePath(pageBySlug("json-diff")!)).toBe("/json-diff/");
    expect(pageFor("diff").slug).toBe("json-diff");
    expect(pageFor("code", "typescript").slug).toBe("json-to-typescript");
    // Unknown combinations fall back to a sensible page rather than throwing.
    expect(pageFor("code", "cobol")).toBeDefined();
  });
});

describe("rendering", () => {
  it("fills both template placeholders", () => {
    expect(template).toContain("<!--seo:head-->");
    expect(template).toContain("<!--seo:about-->");
    for (const p of PAGES) {
      const html = renderPage(template, p);
      expect(html).not.toContain("<!--seo:");
      expect(html).toContain(`<link rel="canonical" href="${pageUrl(p)}">`);
      expect(html.match(/<title>/g)).toHaveLength(1);
    }
  });

  it("escapes HTML in metadata and keeps JSON-LD parseable", () => {
    const evil = { ...PAGES[1], title: 'A "quoted" <b>title</b> & co', description: "</script><script>alert(1)</script>" };
    const head = renderHead(evil);
    expect(head).toContain("<title>A &quot;quoted&quot; &lt;b&gt;title&lt;/b&gt; &amp; co</title>");
    expect(head).not.toContain("</script><script>");
    const ld = head.match(/<script type="application\/ld\+json">(.*)<\/script>/)![1];
    expect(JSON.parse(ld)).toEqual(jsonLd(evil));
  });

  it("emits a breadcrumb for tool pages and the FAQ on the home page", () => {
    const types = (p: (typeof PAGES)[number]) => (jsonLd(p) as { "@graph": { "@type": string }[] })["@graph"].map((g) => g["@type"]);
    expect(types(pageBySlug("")!)).toContain("FAQPage");
    expect(types(pageBySlug("json-diff")!)).toContain("BreadcrumbList");
    expect(FAQ.length).toBeGreaterThan(0);
  });

  it("lists every page in the sitemap", () => {
    const xml = renderSitemap("2026-01-01");
    expect(xml.match(/<url>/g)).toHaveLength(PAGES.length);
    for (const p of PAGES) expect(xml).toContain(`<loc>${pageUrl(p)}</loc>`);
  });
});
