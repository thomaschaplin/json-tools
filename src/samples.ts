import type { Mode } from "./state";

export interface Sample {
  id: string;
  name: string;
  description: string;
  mode: Mode;
  text: string;
}

const api = {
  data: {
    users: [
      {
        id: 9007199254740993,
        username: "ada",
        name: "Ada Lovelace",
        email: "ada@example.com",
        role: "admin",
        active: true,
        score: 98.6,
        createdAt: "2024-03-14T09:26:53Z",
        avatar: "https://avatars.example.com/ada.png",
        theme: { accent: "#6366f1", mode: "dark" },
        tags: ["math", "engines"],
        address: { city: "London", country: "GB", geo: { lat: 51.5072, lng: -0.1276 } },
      },
      {
        id: 2,
        username: "grace",
        name: "Grace Hopper",
        email: "grace@example.com",
        role: "editor",
        active: true,
        score: 91.2,
        createdAt: "2024-05-01T15:02:11Z",
        avatar: null,
        theme: { accent: "#10b981", mode: "light" },
        tags: ["compilers", "cobol", "navy"],
        address: { city: "New York", country: "US", geo: { lat: 40.7128, lng: -74.006 } },
      },
      {
        id: 3,
        username: "linus",
        name: "Linus Torvalds",
        email: "linus@example.com",
        role: "viewer",
        active: false,
        score: 87,
        createdAt: "2023-11-20T08:45:00Z",
        avatar: "https://avatars.example.com/linus.png",
        theme: { accent: "#f59e0b", mode: "system" },
        tags: [],
        address: { city: "Portland", country: "US", geo: { lat: 45.5152, lng: -122.6784 } },
        manager: 1,
      },
    ],
  },
  meta: { page: 1, perPage: 25, total: 3, requestId: "6f1c2a9e-8d4b-4f3a-9c1e-2b7d5a0f8e31", durationMs: 42 },
};

const store = {
  store: {
    book: [
      { category: "reference", author: "Nigel Rees", title: "Sayings of the Century", price: 8.95 },
      { category: "fiction", author: "Evelyn Waugh", title: "Sword of Honour", price: 12.99 },
      { category: "fiction", author: "Herman Melville", title: "Moby Dick", isbn: "0-553-21311-3", price: 8.99 },
      { category: "fiction", author: "J. R. R. Tolkien", title: "The Lord of the Rings", isbn: "0-395-19395-8", price: 22.99 },
    ],
    bicycle: { color: "red", price: 19.95 },
  },
  expensive: 10,
};

const geo = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { name: "Golden Gate Bridge", category: "landmark", opened: 1937 },
      geometry: { type: "Point", coordinates: [-122.4783, 37.8199] },
    },
    {
      type: "Feature",
      properties: { name: "Alcatraz Island", category: "park", opened: 1973 },
      geometry: { type: "Point", coordinates: [-122.423, 37.8267] },
    },
    {
      type: "Feature",
      properties: { name: "Embarcadero", category: "route" },
      geometry: {
        type: "LineString",
        coordinates: [
          [-122.3936, 37.7955],
          [-122.3881, 37.7891],
          [-122.3874, 37.7786],
        ],
      },
    },
  ],
};

const pkg = {
  name: "@acme/web",
  version: "3.2.0",
  private: true,
  type: "module",
  scripts: { dev: "vite", build: "tsc && vite build", test: "vitest run", lint: "eslint ." },
  dependencies: { react: "^19.1.0", "react-dom": "^19.1.0", zod: "^3.25.0" },
  devDependencies: { typescript: "^5.8.3", vite: "^6.3.5", vitest: "^3.2.0" },
  engines: { node: ">=20" },
};

const broken = `// Pasted from a Python REPL and a config file 🙃
{
  name: 'json-tools',
  "version": "2.0.0",
  "features": ["format", "repair", "query",],   /* trailing comma */
  "enabled": True,
  "owner": None,
  "retries": 3
  "ratio": NaN,
  "nested": {
    'deep': [1, 2, 3
`;

const json5 = `// JSON5 — comments, unquoted keys, trailing commas and more
{
  name: 'json-tools',
  version: '2.0.0',
  features: [
    'format',
    'validate',
    'query', // trailing commas are fine
  ],
  limits: {
    maxSize: 0x100000, // hex numbers
    timeout: .5,
    retries: +3,
  },
}
`;

export const SAMPLES: Sample[] = [
  { id: "api", name: "API response", description: "Users with nested objects, dates and a 64-bit id", mode: "json", text: JSON.stringify(api, null, 2).replace('"id": 9007199254740992', '"id": 9007199254740993') },
  { id: "store", name: "Book store", description: "The classic JSONPath example", mode: "json", text: JSON.stringify(store, null, 2) },
  { id: "geo", name: "GeoJSON", description: "A FeatureCollection with points and a line", mode: "json", text: JSON.stringify(geo, null, 2) },
  { id: "pkg", name: "package.json", description: "A typical Node.js manifest", mode: "json", text: JSON.stringify(pkg, null, 2) },
  { id: "broken", name: "Broken JSON", description: "Comments, single quotes, Python literals — try Repair", mode: "json", text: broken },
  { id: "json5", name: "JSON5 config", description: "Relaxed syntax with comments", mode: "json5", text: json5 },
];

/** A second document for the diff view's example. */
export function diffSample(): string {
  const next = structuredClone(api) as typeof api & { data: { users: Record<string, unknown>[] } };
  const users = next.data.users;
  users[0].role = "owner";
  users[0].score = 99.1;
  (users[1].tags as string[]).push("debugging");
  delete users[2].manager;
  users[2].active = true;
  users.push({ id: 4, username: "margaret", name: "Margaret Hamilton", email: "margaret@example.com", role: "editor", active: true });
  next.meta.total = 4;
  (next.meta as Record<string, unknown>).durationMs = "38ms";
  return JSON.stringify(next, null, 2);
}

export const IMPORT_SAMPLES: Record<string, string> = {
  yaml: `# Kubernetes-style deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels: &labels
    app: web
    tier: frontend
spec:
  replicas: 3
  selector:
    matchLabels: *labels
  template:
    spec:
      containers:
        - name: web
          image: nginx:1.27
          ports:
            - containerPort: 80
          env:
            - { name: LOG_LEVEL, value: info }
`,
  csv: `id,name,email,address.city,address.country,active,score
1,Ada Lovelace,ada@example.com,London,GB,true,98.6
2,Grace Hopper,grace@example.com,New York,US,true,91.2
3,"Torvalds, Linus",linus@example.com,Portland,US,false,87
`,
  xml: `<?xml version="1.0" encoding="UTF-8"?>
<catalog>
  <book id="bk101" available="true">
    <author>Gambardella, Matthew</author>
    <title>XML Developer's Guide</title>
    <price currency="USD">44.95</price>
  </book>
  <book id="bk102" available="false">
    <author>Ralls, Kim</author>
    <title>Midnight Rain</title>
    <price currency="USD">5.95</price>
  </book>
</catalog>
`,
  ndjson: `{"ts":"2025-01-01T10:00:00Z","level":"info","msg":"server started","port":8080}
{"ts":"2025-01-01T10:00:02Z","level":"warn","msg":"slow query","ms":1250}
{"ts":"2025-01-01T10:00:05Z","level":"error","msg":"connection reset","retry":true}
`,
  jwt: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkFkYSBMb3ZlbGFjZSIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTcwMDAwMDAwMCwiZXhwIjoxOTAwMDAwMDAwfQ.pjejbn2YfApZspCOfQH_lJQ-cIjPcyEszMmjJkGB8J4",
  query: "https://api.example.com/search?q=json+tools&page=2&sort=stars&tag=cli&tag=web&debug=true",
};
