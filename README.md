# JSON Tools

**[json.thomaschaplin.me](https://json.thomaschaplin.me)**: the JSON workbench for engineers.

Format, validate and repair JSON. Explore it as a tree or a table, query it with JSONPath or
JavaScript, diff two documents, validate against JSON Schema, convert to and from
YAML/CSV/XML/TOML, and generate types for TypeScript, Zod, Go, Rust, Python and Kotlin.
Everything runs in your browser, works offline and never uploads your data.

## Features

**Editor**
- CodeMirror 6 editor with syntax highlighting, folding, bracket matching, multi-cursor, find & replace
- Live validation with human-readable errors (exact line and column), inline squiggles, and a
  code frame that points to the problem
- Warnings for duplicate keys and integers beyond `Number.MAX_SAFE_INTEGER`
- **Lossless formatting**: numbers keep their exact source digits, so 64-bit IDs and precise
  decimals are never rounded
- Format (2/4 spaces or tabs, optional compact one-line containers), minify, sort keys (deep),
  remove nulls and empties, flatten and unflatten, escape and unescape as a JSON string
- **Repair** comments, trailing commas, single quotes, unquoted keys, Python `True/False/None`,
  `NaN`/`Infinity`, missing commas, unclosed brackets and NDJSON. Every fix is reported.
- Strict JSON and relaxed JSON5 modes
- Multiple documents in tabs (rename, reorder, close with undo), autosaved locally
- Path-at-cursor in the status bar

**Tools**
| Tool | What it does |
| --- | --- |
| Tree | Lazy, searchable, keyboard-navigable tree. Copy any path as JSONPath, JS, jq or JSON Pointer; colour swatches, link and date hints; click to reveal in the editor |
| Table | Arrays of objects as a sortable, filterable grid; pick any nested array; export CSV |
| Query | JSONPath (filters, slices, recursive descent, regex, functions) or JavaScript transforms in a sandboxed, time-limited Web Worker |
| Types | TypeScript, Zod, JSON Schema, Go, Rust (serde), Python (Pydantic), Kotlin. Array items are merged so optional and nullable fields are inferred |
| Convert | JSON → YAML, CSV, TSV, XML, TOML, Markdown table, NDJSON, query string, JSON string. YAML, CSV, XML, NDJSON, JWT and URL → JSON |
| Diff | Semantic diff (ignores key order, can match array items by key) or a line-based text diff |
| Schema | Validate against JSON Schema 2020-12, 2019-09 or draft-07 (via Ajv), or generate a schema from data |
| Stats | Size, minified and gzipped size, depth, value-type breakdown and most frequent keys |

**Everywhere**
- Command palette (`Ctrl/⌘ K`) and keyboard shortcuts (`?` lists them)
- Open files (or drop them anywhere), load from a URL, paste, or try a sample
- Share links: the document is deflate-compressed into the URL fragment, so it's never sent to a server
- Light, dark and system themes
- Responsive layout with an editor/tools switcher on phones
- Installable PWA with offline support and "Open with" file handling

## SEO

Each tool has its own landing page (`/json-formatter/`, `/json-to-yaml/`, `/jsonpath-tester/`
and so on). Every page is a static HTML file with its own title, description, canonical URL,
Open Graph/Twitter card image, JSON-LD (WebApplication, Breadcrumb/FAQ) and crawlable content.
All of it comes from one table in [`src/seo/pages.ts`](src/seo/pages.ts). The build also emits
`sitemap.xml` and a `404.html`.

## Development

```sh
npm install
npm run dev        # dev server at http://localhost:5173
npm test           # unit tests (Vitest)
npm run build      # type-check and build to dist/
npm run preview    # serve the production build
npm run images     # regenerate icons, favicon and social cards into public/
```

### Project layout

```
src/
  lib/        framework-free engine: parser, formatter, JSONPath, diff, converters, codegen
  views/      the tool panels (tree, table, query, code, convert, diff, schema, stats)
  ui/         editor wrapper, DOM helpers, menus, dialogs, command palette, toasts, icons
  seo/        landing page table and build-time HTML/structured-data rendering
  app.ts      the shell: layout, documents, commands, shortcuts, routing
  state.ts    documents, settings and analysis store
tests/        unit tests for the engine
scripts/      icon and social card generator
```

The app uses Vite and TypeScript with no UI framework. Tool views, syntax modes and Ajv are
code-split and load on demand.

## Deployment

Pushing to `master` runs `.github/workflows/deploy.yml`, which tests, builds and deploys
`dist/` to GitHub Pages. The `CNAME` lives in `public/`, so the custom domain is kept in every
build.
