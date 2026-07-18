import { describe, expect, it } from "vitest";

import { rewriteManifest, selectManifestVariant } from "@/common/utils/hlsManifest";

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

  it("keeps only the requested quality in an IVS master playlist", () => {
    const manifest = [
      "#EXTM3U",
      "#EXT-X-INDEPENDENT-SEGMENTS",
      "#EXT-X-STREAM-INF:BANDWIDTH=9744727,RESOLUTION=1920x1080,FRAME-RATE=60.000",
      "1080p60.m3u8",
      "#EXT-X-STREAM-INF:BANDWIDTH=3422999,RESOLUTION=1280x720,FRAME-RATE=60.000",
      "720p60.m3u8",
      "#EXT-X-STREAM-INF:BANDWIDTH=1427999,RESOLUTION=852x480,FRAME-RATE=30.000",
      "480p30.m3u8",
    ].join("\n");

    const selected = selectManifestVariant(manifest, 720);

    expect(selected).toContain("#EXTM3U");
    expect(selected).toContain("#EXT-X-INDEPENDENT-SEGMENTS");
    expect(selected).toContain("RESOLUTION=1280x720");
    expect(selected).toContain("720p60.m3u8");
    expect(selected).not.toContain("1080p60.m3u8");
    expect(selected).not.toContain("480p30.m3u8");
  });

  it("returns null when the requested quality is unavailable", () => {
    const manifest = ["#EXTM3U", "#EXT-X-STREAM-INF:RESOLUTION=1280x720", "720p.m3u8"].join("\n");

    expect(selectManifestVariant(manifest, 1080)).toBeNull();
  });
});
