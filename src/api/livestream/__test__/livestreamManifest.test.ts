import { describe, expect, it } from "vitest";

import { rewriteManifest } from "@/common/utils/hlsManifest";

describe("livestream manifest rewriting", () => {
  it("uses same-origin proxy URLs for playlists, segments, and URI attributes", () => {
    const manifest = [
      "#EXTM3U",
      '#EXT-X-KEY:METHOD=AES-128,URI="keys/key.bin"',
      "variant/index.m3u8",
      "segment.ts",
    ].join("\n");

    const rewritten = rewriteManifest(manifest, "https://playlist.live-video.net/root/master.m3u8");

    expect(rewritten).not.toContain("http://192.168.");
    expect(rewritten).not.toContain("https://playlist.live-video.net");
    expect(rewritten.match(/\/livestream\/proxy\//g)).toHaveLength(3);
    expect(rewritten).toContain(".m3u8");
    expect(rewritten).toContain(".ts");
    expect(rewritten).toContain(".bin");
  });
});
