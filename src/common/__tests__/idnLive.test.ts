import { getIdnLiveStream } from "@/common/utils/idnLive";

function nextDataHtml(pageProps: unknown) {
  return `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: {
      pageProps,
    },
  })}</script></body></html>`;
}

describe("IDN Live resolver", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves the live detail playback URL from an IDN profile", async () => {
    const profileHtml = nextDataHtml({
      profile: {
        username: "jkt48-official",
      },
      livestreams: [
        {
          creator: {
            username: "jkt48-official",
          },
          slug: "theater-show",
          status: "LIVE",
          title: "JKT48 Theater",
        },
      ],
    });
    const detailHtml = nextDataHtml({
      livestream: {
        playback_url: "https://cdn.idn.app/live/master.m3u8",
        slug: "theater-show",
        title: "JKT48 Theater Detail",
      },
    });
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);

      if (url.endsWith("/jkt48-official")) {
        return new Response(profileHtml);
      }

      if (url.endsWith("/jkt48-official/live/theater-show")) {
        return new Response(detailHtml);
      }

      return new Response("", { status: 404 });
    });

    vi.stubGlobal("fetch", fetchMock);

    await expect(getIdnLiveStream("jkt48-official")).resolves.toEqual({
      pageUrl: "https://www.idn.app/jkt48-official/live/theater-show",
      playbackUrl: "https://cdn.idn.app/live/master.m3u8",
      slug: "theater-show",
      title: "JKT48 Theater Detail",
    });
  });

  it("returns null when the IDN profile has no livestream", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(nextDataHtml({ profile: { username: "jkt48-official" }, livestreams: [] }))),
    );

    await expect(getIdnLiveStream("jkt48-official")).resolves.toBeNull();
  });
});
