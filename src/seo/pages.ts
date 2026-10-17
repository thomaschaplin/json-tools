/**
 * Every landing page the site publishes. The build emits one static HTML file
 * per entry (with its own title, description, canonical URL, social card and
 * structured data), and the app uses the same table to pick the initial tool
 * and keep the address bar in sync as you switch tools.
 */

export const SITE_URL = "https://json.thomaschaplin.me";
export const SITE_NAME = "JSON Tools";

export type PageView = "tree" | "table" | "query" | "code" | "convert" | "diff" | "schema" | "stats";

export interface Page {
  slug: string;
  view: PageView;
  /** View-specific option, e.g. the code language or conversion target. */
  sub?: string;
  /** <title> */
  title: string;
  /** meta description, 140–160 chars */
  description: string;
  /** Visible heading in the about section */
  h1: string;
  /** Short intro paragraph under the heading */
  intro: string;
  /** Two-line text drawn on the social card */
  card: [string, string];
  /** Hint shown in the editor placeholder */
  placeholder?: string;
}

export const PAGES: Page[] = [
  {
    slug: "",
    view: "tree",
    title: "JSON Tools — Format, Validate, View, Query, Diff & Convert JSON",
    description:
      "The JSON workbench for engineers: format, validate, repair, explore, query with JSONPath, diff, convert to YAML/CSV and generate types. Free, fast and 100% private.",
    h1: "The JSON workbench for engineers",
    intro:
      "Format, validate and repair JSON, explore it as a tree or table, query it with JSONPath or JavaScript, diff two documents, validate against JSON Schema, convert to YAML, CSV, XML or TOML and generate TypeScript, Zod, Go, Rust, Python or Kotlin types — all in your browser.",
    card: ["The JSON workbench", "Format · Query · Diff · Convert · Types"],
  },
  {
    slug: "json-formatter",
    view: "tree",
    title: "JSON Formatter & Beautifier — Pretty Print JSON Online",
    description:
      "Format and beautify JSON instantly with 2/4-space or tab indentation, key sorting and compact mode. Lossless for big numbers. Runs entirely in your browser.",
    h1: "JSON Formatter & Beautifier",
    intro:
      "Paste messy or minified JSON and pretty print it in one keystroke. Choose your indentation, sort keys, keep short arrays on one line — big numbers and decimals are preserved exactly.",
    card: ["JSON Formatter", "Beautify · Sort keys · Lossless numbers"],
  },
  {
    slug: "json-validator",
    view: "tree",
    title: "JSON Validator — Check & Lint JSON with Precise Errors",
    description:
      "Validate JSON as you type with clear error messages, exact line and column, duplicate key and unsafe number warnings, plus one-click repair for broken JSON.",
    h1: "JSON Validator & Linter",
    intro:
      "Every keystroke is validated with human-readable errors that point to the exact line and column. Duplicate keys and numbers that lose precision are flagged, and broken JSON can be repaired in one click.",
    card: ["JSON Validator", "Precise errors · Lint · One-click repair"],
  },
  {
    slug: "json-repair",
    view: "tree",
    title: "Repair Broken JSON — Fix Trailing Commas, Quotes & Comments",
    description:
      "Fix invalid JSON automatically: trailing commas, single quotes, unquoted keys, comments, Python True/None, missing commas and unclosed brackets.",
    h1: "Repair broken JSON",
    intro:
      "Pasted something that is almost JSON? Repair removes comments and trailing commas, quotes keys, converts single quotes, Python literals and NaN, inserts missing commas and closes unclosed brackets — and tells you every fix it made.",
    card: ["JSON Repair", "Fix commas, quotes, comments & more"],
  },
  {
    slug: "json-minifier",
    view: "stats",
    title: "JSON Minifier — Compress & Minify JSON Online",
    description:
      "Minify JSON to the smallest valid output and see the exact byte savings, gzip size and structure stats. Fast, lossless and private.",
    h1: "JSON Minifier",
    intro: "Strip every unnecessary byte from your JSON and see exactly how much you saved, including the gzipped size.",
    card: ["JSON Minifier", "Compress · Measure · Lossless"],
  },
  {
    slug: "json-viewer",
    view: "tree",
    title: "JSON Viewer — Explore JSON as an Interactive Tree",
    description:
      "View JSON as a fast, searchable, collapsible tree. Copy any value or path as JSONPath, JS accessor, jq or JSON Pointer and jump straight to it in the editor.",
    h1: "JSON Viewer",
    intro:
      "Explore large documents as a collapsible tree with search, type badges, color and date previews. Click any node to copy its path as JSONPath, JavaScript, jq or JSON Pointer.",
    card: ["JSON Viewer", "Tree · Search · Copy paths"],
  },
  {
    slug: "json-table-viewer",
    view: "table",
    title: "JSON to Table Viewer — View JSON Arrays as a Sortable Grid",
    description:
      "Turn arrays of JSON objects into a sortable, filterable table. Pick any nested array, sort columns, filter rows and export to CSV.",
    h1: "JSON Table Viewer",
    intro: "See arrays of objects the way they were meant to be seen: as a sortable, filterable grid you can export to CSV.",
    card: ["JSON Table Viewer", "Sort · Filter · Export CSV"],
  },
  {
    slug: "jsonpath-tester",
    view: "query",
    title: "JSONPath Tester & Online Evaluator — Query JSON",
    description:
      "Test JSONPath expressions live with filters, slices, recursive descent and regex, or transform JSON with JavaScript. See matches and their paths instantly.",
    h1: "JSONPath Tester",
    intro:
      "Query JSON live with JSONPath — filters, slices, recursive descent, regex and functions — or switch to JavaScript for arbitrary transforms that run safely in a sandboxed worker.",
    card: ["JSONPath Tester", "Filters · Slices · JavaScript transforms"],
  },
  {
    slug: "json-diff",
    view: "diff",
    title: "JSON Diff — Compare Two JSON Documents Online",
    description:
      "Compare two JSON documents semantically. Ignore key order, match array items by id and see every added, removed and changed path, or a line-by-line text diff.",
    h1: "JSON Diff & Compare",
    intro:
      "Compare JSON semantically rather than as text: key order is ignored, arrays can be matched by an id field, and every added, removed and changed value is listed with its path.",
    card: ["JSON Diff", "Semantic compare · Text diff"],
  },
  {
    slug: "json-schema-validator",
    view: "schema",
    title: "JSON Schema Validator — Draft 2020-12, 2019-09 & Draft-07",
    description:
      "Validate JSON against a JSON Schema (draft 2020-12, 2019-09, draft-07) with clear, clickable errors — or generate a schema from your data in one click.",
    h1: "JSON Schema Validator",
    intro:
      "Validate documents against JSON Schema draft 2020-12, 2019-09 or draft-07 with formats. Errors link straight to the offending value, and a schema can be generated from your data.",
    card: ["JSON Schema Validator", "2020-12 · 2019-09 · Draft-07"],
  },
  {
    slug: "json-schema-generator",
    view: "code",
    sub: "jsonschema",
    title: "JSON Schema Generator — Infer a Schema from JSON",
    description:
      "Generate a JSON Schema (draft 2020-12) from sample JSON. Detects required and optional fields, nullable values, integers and string formats like email, uuid and date-time.",
    h1: "JSON Schema Generator",
    intro: "Infer a draft 2020-12 JSON Schema from sample data, with required fields, nullable values and string formats detected automatically.",
    card: ["JSON Schema Generator", "Infer schemas from sample JSON"],
  },
  {
    slug: "json-to-typescript",
    view: "code",
    sub: "typescript",
    title: "JSON to TypeScript — Generate Interfaces from JSON",
    description:
      "Convert JSON to TypeScript interfaces instantly. Merges array items, detects optional and nullable fields and names nested types for you.",
    h1: "JSON to TypeScript",
    intro: "Generate clean TypeScript interfaces from any JSON. Array items are merged so optional and nullable fields are typed correctly.",
    card: ["JSON to TypeScript", "Interfaces from sample JSON"],
  },
  {
    slug: "json-to-zod",
    view: "code",
    sub: "zod",
    title: "JSON to Zod — Generate Zod Schemas from JSON",
    description:
      "Turn JSON into a Zod schema with inferred types, optional and nullable fields and string formats like email, url, uuid and datetime.",
    h1: "JSON to Zod",
    intro: "Generate Zod schemas — with z.infer types — from example JSON, including email, url, uuid and datetime string checks.",
    card: ["JSON to Zod", "Runtime-safe schemas from JSON"],
  },
  {
    slug: "json-to-go",
    view: "code",
    sub: "go",
    title: "JSON to Go Struct — Convert JSON to Go Types",
    description:
      "Convert JSON to Go structs with json tags, omitempty for optional fields, pointer types for nullable values and idiomatic Go field names.",
    h1: "JSON to Go struct",
    intro: "Generate idiomatic Go structs with json tags, omitempty and proper initialisms (ID, URL, API) from any JSON sample.",
    card: ["JSON to Go", "Structs with json tags"],
  },
  {
    slug: "json-to-rust",
    view: "code",
    sub: "rust",
    title: "JSON to Rust — Generate Serde Structs from JSON",
    description:
      "Convert JSON to Rust structs with serde Serialize/Deserialize derives, snake_case fields with renames, Option for optional values and Vec for arrays.",
    h1: "JSON to Rust (serde)",
    intro: "Generate Rust structs ready for serde, with snake_case fields, rename attributes and Option types where values may be missing.",
    card: ["JSON to Rust", "Serde structs from JSON"],
  },
  {
    slug: "json-to-python",
    view: "code",
    sub: "python",
    title: "JSON to Python — Generate Pydantic Models from JSON",
    description:
      "Convert JSON into Pydantic models with type hints, optional fields, aliases for invalid identifiers and datetime detection.",
    h1: "JSON to Python (Pydantic)",
    intro: "Generate Pydantic models with modern type hints from sample JSON, including aliases for keys that aren't valid Python identifiers.",
    card: ["JSON to Python", "Pydantic models from JSON"],
  },
  {
    slug: "json-to-kotlin",
    view: "code",
    sub: "kotlin",
    title: "JSON to Kotlin — Generate Data Classes from JSON",
    description: "Convert JSON to Kotlin data classes with kotlinx.serialization annotations, nullable types and camelCase properties.",
    h1: "JSON to Kotlin",
    intro: "Generate Kotlin data classes annotated for kotlinx.serialization from any JSON sample.",
    card: ["JSON to Kotlin", "Data classes from JSON"],
  },
  {
    slug: "json-to-yaml",
    view: "convert",
    sub: "yaml",
    title: "JSON to YAML Converter — Convert JSON to YAML Online",
    description: "Convert JSON to clean, readable YAML instantly. Handles nested objects, arrays and multi-line strings. Free, private, works offline.",
    h1: "JSON to YAML",
    intro: "Convert JSON into clean, human-friendly YAML — perfect for Kubernetes manifests, CI pipelines and config files.",
    card: ["JSON to YAML", "Clean, readable YAML instantly"],
  },
  {
    slug: "json-to-csv",
    view: "convert",
    sub: "csv",
    title: "JSON to CSV Converter — Export JSON Arrays to CSV",
    description: "Convert JSON arrays to CSV or TSV with nested objects flattened into dotted columns. Download for Excel, Google Sheets or Numbers.",
    h1: "JSON to CSV",
    intro: "Turn arrays of objects into CSV or TSV with nested fields flattened into dotted columns, ready for Excel or Google Sheets.",
    card: ["JSON to CSV", "Flatten · Export · Spreadsheet-ready"],
  },
  {
    slug: "json-to-xml",
    view: "convert",
    sub: "xml",
    title: "JSON to XML Converter — Convert JSON to XML Online",
    description: "Convert JSON to well-formed XML with attributes (@key), text nodes (#text) and repeated elements for arrays.",
    h1: "JSON to XML",
    intro: "Convert JSON into well-formed XML. Keys starting with @ become attributes, #text becomes text content, and arrays become repeated elements.",
    card: ["JSON to XML", "Attributes · Text nodes · Arrays"],
  },
  {
    slug: "json-to-toml",
    view: "convert",
    sub: "toml",
    title: "JSON to TOML Converter — Convert JSON to TOML Online",
    description: "Convert JSON objects into TOML with tables and arrays of tables, ready for Cargo.toml, pyproject.toml and other config files.",
    h1: "JSON to TOML",
    intro: "Convert JSON into TOML tables and arrays of tables for Cargo, Poetry and other TOML-based configs.",
    card: ["JSON to TOML", "Tables · Arrays of tables"],
  },
  {
    slug: "yaml-to-json",
    view: "convert",
    sub: "from-yaml",
    title: "YAML to JSON Converter — Convert YAML to JSON Online",
    description: "Convert YAML (including multi-document files and anchors) to JSON instantly. Free, private and works offline.",
    h1: "YAML to JSON",
    intro: "Paste YAML — multi-document files, anchors and aliases included — and get clean JSON you can format, query and validate.",
    card: ["YAML to JSON", "Multi-document · Anchors · Aliases"],
  },
  {
    slug: "csv-to-json",
    view: "convert",
    sub: "from-csv",
    title: "CSV to JSON Converter — Convert CSV/TSV to JSON Online",
    description: "Convert CSV or TSV to an array of JSON objects. Auto-detects the delimiter, infers numbers and booleans and rebuilds nested objects from dotted headers.",
    h1: "CSV to JSON",
    intro: "Convert CSV or TSV into JSON objects with automatic delimiter detection, type inference and nested objects from dotted column names.",
    card: ["CSV to JSON", "Auto-detect · Type inference"],
  },
  {
    slug: "xml-to-json",
    view: "convert",
    sub: "from-xml",
    title: "XML to JSON Converter — Convert XML to JSON Online",
    description: "Convert XML to JSON with attributes, text nodes and repeated elements mapped predictably. Runs entirely in your browser.",
    h1: "XML to JSON",
    intro: "Convert XML into JSON with attributes mapped to @keys, text to #text and repeated elements to arrays.",
    card: ["XML to JSON", "Attributes · Text · Arrays"],
  },
  {
    slug: "jwt-decoder",
    view: "convert",
    sub: "from-jwt",
    title: "JWT Decoder — Decode JSON Web Tokens Online",
    description: "Decode a JWT to inspect its header and payload as JSON, with readable issued-at and expiry times. Tokens never leave your browser.",
    h1: "JWT Decoder",
    intro: "Paste a JSON Web Token to inspect its header and claims as formatted JSON. Decoding happens locally — your token is never sent anywhere.",
    card: ["JWT Decoder", "Header · Payload · Private"],
  },
];

export function pageBySlug(slug: string): Page | undefined {
  const s = slug.replace(/^\/+|\/+$/g, "");
  return PAGES.find((p) => p.slug === s);
}

export function pageUrl(page: Page): string {
  return `${SITE_URL}/${page.slug ? page.slug + "/" : ""}`;
}

export function pagePath(page: Page): string {
  return `/${page.slug ? page.slug + "/" : ""}`;
}

/** The best landing page for a view/sub combination. */
export function pageFor(view: PageView, sub?: string): Page {
  return (
    PAGES.find((p) => p.view === view && p.sub === sub) ??
    PAGES.find((p) => p.view === view && !p.sub && p.slug !== "json-formatter" && p.slug !== "json-validator" && p.slug !== "json-repair") ??
    PAGES[0]
  );
}

export const FAQ: { q: string; a: string }[] = [
  {
    q: "Is my JSON sent to a server?",
    a: "No. Every tool runs entirely in your browser. Documents are saved only to your device's local storage, and share links keep the data in the URL fragment, which browsers never send to a server.",
  },
  {
    q: "Does it work offline?",
    a: "Yes. JSON Tools is an installable Progressive Web App. After your first visit it works fully offline, and you can add it to your home screen or dock like a native app.",
  },
  {
    q: "Will formatting change my numbers?",
    a: "No. The formatter is lossless: it keeps the exact digits you wrote, so large integers such as 64-bit IDs and precise decimals are never rounded the way JSON.parse would round them.",
  },
  {
    q: "Can it fix invalid JSON?",
    a: "Yes. Repair handles comments, trailing commas, single quotes, unquoted keys, Python True/False/None, NaN and Infinity, missing commas, unclosed brackets and newline-delimited JSON, and lists every change it made.",
  },
  {
    q: "Which JSONPath syntax is supported?",
    a: "Dot and bracket notation, wildcards, recursive descent (..), index lists, negative indices, slices with steps, and filters with comparisons, &&, ||, !, regex matching (=~), 'in' and functions like length(). JavaScript expressions are also supported for arbitrary transforms.",
  },
  {
    q: "How large a file can it handle?",
    a: "Multi-megabyte documents work well. The editor, validator and tree view are all designed for large inputs: the tree renders lazily and long arrays are paged.",
  },
];
