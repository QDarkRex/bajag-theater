import { getIdnLiveStream, getIdnLiveStreamFromUrl, parseCookieFile } from "@/common/utils/idnLive";

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

  it("sends account cookies when resolving IDN pages", async () => {
    const profileHtml = nextDataHtml({
      profile: {
        username: "jkt48-official",
      },
      livestreams: [
        {
          slug: "gold-room",
          status: "LIVE",
          title: "Gold Room",
        },
      ],
    });
    const detailHtml = nextDataHtml({
      livestream: {
        entity: {
          playback_url: "https://cdn.idn.app/gold/master.m3u8",
        },
        slug: "gold-room",
      },
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(profileHtml))
      .mockResolvedValueOnce(new Response(detailHtml));

    vi.stubGlobal("fetch", fetchMock);

    await expect(getIdnLiveStream("jkt48-official", "session_id=paid; idn_token=gold")).resolves.toMatchObject({
      playbackUrl: "https://cdn.idn.app/gold/master.m3u8",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://www.idn.app/jkt48-official",
      expect.objectContaining({
        headers: expect.objectContaining({
          cookie: "session_id=paid; idn_token=gold",
        }),
      }),
    );
  });

  it("resolves a direct IDN live URL", async () => {
    const detailHtml = nextDataHtml({
      livestream: {
        playback_url: "https://cdn.idn.app/levi/master.m3u8",
        slug: "ayo-ngobrol-bareng-260705220854",
        title: "Ayo Ngobrol Bareng",
      },
    });
    const fetchMock = vi.fn(async () => new Response(detailHtml));

    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getIdnLiveStreamFromUrl("https://www.idn.app/jkt48_levi/live/ayo-ngobrol-bareng-260705220854"),
    ).resolves.toEqual({
      pageUrl: "https://www.idn.app/jkt48_levi/live/ayo-ngobrol-bareng-260705220854",
      playbackUrl: "https://cdn.idn.app/levi/master.m3u8",
      slug: "ayo-ngobrol-bareng-260705220854",
      title: "Ayo Ngobrol Bareng",
    });
  });

  it("parses Netscape cookie exports and raw Cookie headers", () => {
    expect(
      parseCookieFile(
        [
          "# Netscape HTTP Cookie File",
          ".idn.app\tTRUE\t/\tTRUE\t2147483647\tsession_id\tpaid",
          "idn_token=gold; another=value",
        ].join("\n"),
      ),
    ).toBe("session_id=paid; idn_token=gold; another=value");
  });

  it("returns null when the IDN profile has no livestream", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(nextDataHtml({ profile: { username: "jkt48-official" }, livestreams: [] }))),
    );

    await expect(getIdnLiveStream("jkt48-official")).resolves.toBeNull();
  });
});
