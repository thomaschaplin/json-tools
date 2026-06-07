// Sample data so a first-time visitor can try the tool without hunting for JSON.
// The JSON5 variant uses the same data but leans on JSON5-only syntax (a comment,
// unquoted keys, single quotes, a trailing comma) to show off what the mode allows.

export const EXAMPLE_JSON = `{
    "name": "JSON Tools",
    "version": "1.0.0",
    "private": false,
    "tags": ["json", "json5", "formatter"],
    "author": {
        "name": "Thomas Chaplin",
        "url": "https://json.thomaschaplin.me"
    },
    "features": {
        "prettyPrint": true,
        "minify": true,
        "validate": true,
        "offline": true
    },
    "stars": 42,
    "license": null
}`;

export const EXAMPLE_JSON5 = `{
    // JSON5 allows comments, unquoted keys, single quotes and trailing commas.
    name: 'JSON Tools',
    version: '1.0.0',
    private: false,
    tags: ['json', 'json5', 'formatter'],
    author: {
        name: 'Thomas Chaplin',
        url: 'https://json.thomaschaplin.me',
    },
    features: {
        prettyPrint: true,
        minify: true,
        validate: true,
        offline: true,
    },
    stars: 42,
    license: null,
}`;
