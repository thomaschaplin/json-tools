/**
 * Shareable links: the document is deflate-compressed and base64url-encoded
 * into the URL fragment. Fragments never reach a server, so shared JSON stays
 * between the people holding the link.
 */

function toB64url(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export async function encodeShare(text: string): Promise<string> {
  const raw = new TextEncoder().encode(text);
  const packed = await pipe(raw, new CompressionStream("deflate-raw"));
  return toB64url(packed);
}

export async function decodeShare(encoded: string): Promise<string> {
  const bytes = await pipe(fromB64url(encoded), new DecompressionStream("deflate-raw"));
  return new TextDecoder().decode(bytes);
}
