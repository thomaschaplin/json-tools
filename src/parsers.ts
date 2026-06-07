import JSON5 from "json5";

// JSON5 is now bundled as a real dependency (previously lazy-loaded from a CDN),
// so both codecs are synchronous and work fully offline.

export type Mode = "json" | "json5";

export interface Codec {
  parse(text: string): unknown;
  stringify(value: unknown, indent?: number): string;
}

export interface Parser {
  label: string;
  codec: Codec;
}

export const parsers: Record<Mode, Parser> = {
  json: {
    label: "JSON",
    codec: {
      parse: (text) => JSON.parse(text),
      stringify: (value, indent) => JSON.stringify(value, undefined, indent),
    },
  },
  json5: {
    label: "JSON5",
    codec: {
      parse: (text) => JSON5.parse(text),
      stringify: (value, indent) => JSON5.stringify(value, undefined, indent),
    },
  },
};

export function currentMode(): Mode {
  const checked = document.querySelector<HTMLInputElement>(
    'input[name="mode"]:checked',
  );
  const value = checked?.value;
  return value === "json5" ? "json5" : "json";
}
