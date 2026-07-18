function getProxyExtension(targetUrl: string) {
  const pathname = new URL(targetUrl).pathname;
  const match = pathname.match(/\.[a-z0-9]+$/i);
  return match?.[0] ?? "";
}

function toProxyUrl(targetUrl: string) {
  const encodedUrl = Buffer.from(targetUrl).toString("base64url");
  // Keep rewritten HLS resources on the origin used by the player. An absolute
  // LAN URL works for local clients but breaks public HTTPS playback with an
  // unreachable mixed-content URL. Relative URLs work for both deployments.
  return `/livestream/proxy/${encodedUrl}${getProxyExtension(targetUrl)}`;
}

function resolveProxyUrl(uri: string, baseUrl: string) {
  if (uri.startsWith("data:")) {
    return uri;
  }

  return toProxyUrl(new URL(uri, baseUrl).toString());
}

export function rewriteManifest(manifest: string, baseUrl: string) {
  return manifest
    .split("\n")
    .map((line) => {
      const trimmedLine = line.trim();

      if (!trimmedLine) {
        return line;
      }

      if (trimmedLine.startsWith("#EXT-X-PREFETCH:")) {
        const [prefix, uri] = line.split(/:(.+)/);
        return `${prefix}:${resolveProxyUrl(uri, baseUrl)}`;
      }

      if (trimmedLine.startsWith("#")) {
        return line.replace(/URI="([^"]+)"/g, (_match, uri: string) => `URI="${resolveProxyUrl(uri, baseUrl)}"`);
      }

      return resolveProxyUrl(trimmedLine, baseUrl);
    })
    .join("\n");
}
