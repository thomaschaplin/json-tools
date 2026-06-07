# JSON Tools

[JSON Tools Website](http://json.thomaschaplin.me)

A fast, free, browser-based tool to work with JSON files.

Accepts [JSON](https://www.json.org/) or [JSON5](https://json5.org/) format.

## Features

- Pretty print
- Minify
- Validate
- Copy to clipboard
- Download (choose your own file name)
- Load example (mode-aware sample data)
- Clear
- Drag 'n' drop files
- Light & dark theme (remembers your choice, follows your system by default)

Everything runs entirely in your browser &mdash; your data never leaves your machine.

## Tech

A zero-build static site: plain HTML, CSS and vanilla JavaScript (ES modules).
The only dependency is [JSON5](https://json5.org/), loaded on demand from a CDN.
No jQuery, no Bootstrap, no build step.

For discoverability the site ships static SEO assets &mdash; Open Graph /
Twitter Card meta tags and a social preview image (`og-image.png`), JSON-LD
structured data, `robots.txt` and `sitemap.xml` &mdash; all served directly by
GitHub Pages with no build step.

## Development

Because the site uses ES modules, open it through a local server rather than the
`file://` protocol:

```sh
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Ideas / Todo

- JSON to CSV
- Search within input
- Scrape URL
- Syntax highlighting / code editor
- Compare two JSON inputs
