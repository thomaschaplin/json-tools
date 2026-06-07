# JSON Tools

[JSON Tools Website](https://json.thomaschaplin.me)

A fast, free, browser-based tool to work with JSON files.

Accepts [JSON](https://www.json.org/) or [JSON5](https://json5.org/) format.

## Features

- Syntax-highlighted editor with line numbers and inline error highlighting ([CodeMirror 6](https://codemirror.net/))
- Pretty print
- Minify
- Validate
- Copy to clipboard
- Download (choose your own file name)
- Load example (mode-aware sample data)
- Clear
- Drag 'n' drop files
- Light & dark theme (remembers your choice, follows your system by default)
- Installable PWA &mdash; add to your home screen and use it offline like a native app

Everything runs entirely in your browser &mdash; your data never leaves your machine.

## Tech

Built with [Vite](https://vite.dev/) and TypeScript. The editor is
[CodeMirror 6](https://codemirror.net/); [JSON5](https://json5.org/) is bundled
as a dependency (so it works fully offline). The app is a Progressive Web App
&mdash; [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) generates the web
app manifest and a Workbox service worker for offline use and home-screen
installability. No framework (no React/Vue), no jQuery, no Bootstrap.

For discoverability the site ships static SEO assets &mdash; Open Graph /
Twitter Card meta tags and a social preview image (`og-image.png`), JSON-LD
structured data, `robots.txt` and `sitemap.xml` &mdash; served verbatim from
`public/`.

## Development

```sh
npm install
npm run dev      # start the dev server (http://localhost:5173)
npm run build    # type-check and build to dist/
npm run preview  # serve the production build locally
```

App icons are generated from `src/icon.svg` into `public/` (pwa-192/512 and
apple-touch-icon); regenerate them with `sharp` if the source changes.

## Deployment

Pushing to `master` triggers `.github/workflows/deploy.yml`, which builds with
Vite and deploys `dist/` to GitHub Pages. The `CNAME` lives in `public/` so the
custom domain is preserved in every build.

> One-time setup: in the repository's **Settings → Pages**, set
> **Build and deployment → Source** to **GitHub Actions**.

## Ideas / Todo

- JSON to CSV
- Search within input
- Scrape URL
- Compare two JSON inputs
