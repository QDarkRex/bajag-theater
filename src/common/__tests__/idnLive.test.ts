import { createCipheriv, randomBytes } from "node:crypto";
import {
  decryptIdnAptPayload,
  getIdnLiveStream,
  getIdnLiveStreamFromUrl,
  parseCookieFile,
} from "@/common/utils/idnLive";

const APT_KEY = "8dDR1neD37MwogoMymJS0ExltZ5vH4SU";

function encryptAptFixture(value: string) {
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", Buffer.from(APT_KEY), iv);
  const encrypted = Buffer.concat([cipher.update(value), cipher.final()]);
  return Buffer.from(JSON.stringify({ iv: iv.toString("base64"), value: encrypted.toString("base64") })).toString(
    "base64",
  );
}

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

  it("unwraps a Gold /live/preview/ URL to the real live page", async () => {
    const detailHtml = nextDataHtml({
      livestream: {
        entity: {
          playback_url: "https://cdn.idn.app/gold/master.m3u8",
        },
        slug: "itadakilove-2026-07-10-260702211317",
        title: "Itadaki Love",
      },
    });
    const fetchMock = vi.fn(async () => new Response(detailHtml));

    vi.stubGlobal("fetch", fetchMock);

    const result = await getIdnLiveStreamFromUrl(
      "https://www.idn.app/jkt48-official/live/preview/itadakilove-2026-07-10-260702211317",
      "session_id=paid",
    );

    // The preview segment must be dropped and the canonical live page fetched.
    expect(fetchMock).toHaveBeenCalledWith(
      "https://www.idn.app/jkt48-official/live/itadakilove-2026-07-10-260702211317",
      expect.objectContaining({
        headers: expect.objectContaining({ cookie: "session_id=paid" }),
      }),
    );
    expect(result).toMatchObject({
      pageUrl: "https://www.idn.app/jkt48-official/live/itadakilove-2026-07-10-260702211317",
      playbackUrl: "https://cdn.idn.app/gold/master.m3u8",
      slug: "itadakilove-2026-07-10-260702211317",
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

  it("ignores malformed Netscape rows with an empty cookie name", () => {
    expect(
      parseCookieFile(
        [
          "# Netscape HTTP Cookie File",
          ".idn.app\tTRUE\t/\tTRUE\t2147483647\tid_token\tpaid",
          'www.idn.app\tFALSE\t/\tTRUE\t2147483647\t\t"USERNAME_WATERMARK_TIME":"10/300"',
          "=invalid; access_token=valid",
        ].join("\n"),
      ),
    ).toBe("id_token=paid; access_token=valid");
  });

  it("decrypts an IDN APT galaktus response", () => {
    const playbackUrl = "https://example.us-east-1.playback.live-video.net/private.m3u8?token=fixture";
    expect(decryptIdnAptPayload(encryptAptFixture(playbackUrl))).toBe(playbackUrl);
  });

  it("requests and decrypts Gold playback authorization", async () => {
    const pageUrl = "https://www.idn.app/jkt48-official/live/gold-room";
    const authorizedUrl = "https://example.us-east-1.playback.live-video.net/api/video/v1/channel.m3u8?token=fixture";
    const detailHtml = nextDataHtml({
      livestream: {
        creator: { uuid: "streamer-uuid", username: "jkt48-official" },
        live_type: "idnliveplus",
        playback_url: "https://example.us-east-1.playback.live-video.net/api/video/v1/channel.m3u8",
        slug: "gold-room",
        title: "Gold Room",
      },
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(detailHtml))
      .mockResolvedValueOnce(Response.json({ galaktus: encryptAptFixture(authorizedUrl) }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getIdnLiveStreamFromUrl(pageUrl, "id_token=id-fixture; access_token=access-fixture; session-id=session-fixture"),
    ).resolves.toMatchObject({ playbackUrl: authorizedUrl });
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        href: expect.stringContaining("/api/v1/apt?streamer_uuid=streamer-uuid&slug=gold-room"),
      }),
      expect.objectContaining({
        body: "{}",
        method: "POST",
        headers: expect.objectContaining({
          "access-token": "access-fixture",
          authorization: "Bearer id-fixture",
          "content-type": "application/json",
          "session-id": "session-fixture",
          "x-request-id": expect.stringMatching(/^session-fixture_\d+$/),
        }),
      }),
    );
  });

  it("returns null when the IDN profile has no livestream", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(nextDataHtml({ profile: { username: "jkt48-official" }, livestreams: [] }))),
    );

    await expect(getIdnLiveStream("jkt48-official")).resolves.toBeNull();
  });
});
