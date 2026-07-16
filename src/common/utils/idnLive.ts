import { createDecipheriv } from "node:crypto";

const IDN_BASE_URL = "https://www.idn.app";
const IDN_API_BASE_URL = "https://api.idn.app";
const IDN_WEB_API_KEY = "123f4c4e-6ce1-404d-8786-d17e46d65b5c";
const REQUEST_TIMEOUT_MS = 15000;
const IDN_APT_DECRYPTION_KEY = "8dDR1neD37MwogoMymJS0ExltZ5vH4SU";
const COOKIE_NAME_PATTERN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

type IdnProfile = {
  username?: string;
};

type IdnLivestream = {
  live_type?: string;
  slug?: string;
  status?: string;
  title?: string;
  playback_url?: string;
  entity?: {
    playback_url?: string;
  };
  creator?: {
    uuid?: string;
    username?: string;
  };
};

type IdnPageProps = {
  profile?: IdnProfile;
  livestreams?: IdnLivestream[];
  livestream?: IdnLivestream;
};

type NextData = {
  props?: {
    pageProps?: IdnPageProps;
  };
};

export type IdnLiveStream = {
  playbackUrl: string;
  pageUrl: string;
  slug: string;
  title?: string;
};

export function parseCookieFile(fileContent: string) {
  const cookies: string[] = [];

  for (const line of fileContent.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const tokens = trimmed.split("\t");
    if (tokens.length >= 7) {
      const name = tokens[5]?.trim() ?? "";
      if (COOKIE_NAME_PATTERN.test(name)) {
        cookies.push(`${name}=${tokens[6]}`);
      }
      continue;
    }

    for (const cookie of trimmed.split(";")) {
      const pair = cookie.trim();
      const separator = pair.indexOf("=");
      const name = separator >= 0 ? pair.slice(0, separator).trim() : "";
      if (COOKIE_NAME_PATTERN.test(name)) {
        cookies.push(pair);
      }
    }
  }

  return cookies.join("; ");
}

function cookieValue(cookieHeader: string, name: string) {
  for (const pair of cookieHeader.split(";")) {
    const separator = pair.indexOf("=");
    if (separator < 0) continue;
    if (pair.slice(0, separator).trim() === name) {
      return pair.slice(separator + 1).trim();
    }
  }
  return "";
}

type AptEnvelope = {
  iv?: string;
  value?: string;
};

export function decryptIdnAptPayload(payload: string) {
  let envelope: AptEnvelope;
  try {
    envelope = JSON.parse(Buffer.from(payload, "base64").toString("utf8")) as AptEnvelope;
  } catch {
    throw new Error("Unable to parse the IDN playback authorization response.");
  }

  if (!envelope.iv || !envelope.value) {
    throw new Error("IDN playback authorization response is incomplete.");
  }

  try {
    const decipher = createDecipheriv(
      "aes-256-cbc",
      Buffer.from(IDN_APT_DECRYPTION_KEY, "utf8"),
      Buffer.from(envelope.iv, "base64"),
    );
    return Buffer.concat([decipher.update(Buffer.from(envelope.value, "base64")), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("Unable to decrypt the IDN playback authorization response.");
  }
}

function validateAuthorizedPlaybackUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("IDN playback authorization returned an invalid URL.");
  }

  if (url.protocol !== "https:" || !url.hostname.endsWith(".live-video.net")) {
    throw new Error("IDN playback authorization returned an untrusted URL.");
  }
  return url.toString();
}

async function fetchGoldPlaybackUrl(stream: IdnLivestream, pageUrl: string, cookieHeader: string) {
  const slug = stream.slug;
  const streamerUuid = stream.creator?.uuid;
  const idToken = cookieValue(cookieHeader, "id_token");
  const accessToken = cookieValue(cookieHeader, "access_token");
  const sessionId = cookieValue(cookieHeader, "session-id");

  if (!slug || !streamerUuid) {
    throw new Error("IDN Gold stream metadata is incomplete.");
  }
  if (!idToken || !accessToken || !sessionId) {
    throw new Error("IDN Gold requires fresh id_token, access_token, and session-id cookies.");
  }

  const url = new URL("/api/v1/apt", IDN_API_BASE_URL);
  url.searchParams.set("streamer_uuid", streamerUuid);
  url.searchParams.set("slug", slug);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      body: "{}",
      method: "POST",
      headers: {
        accept: "application/json, text/plain, */*",
        "access-token": accessToken,
        authorization: `Bearer ${idToken}`,
        "content-type": "application/json",
        cookie: cookieHeader,
        origin: IDN_BASE_URL,
        referer: pageUrl,
        "session-id": sessionId,
        "user-agent": "Mozilla/5.0 (compatible; bajag-theater/1.0)",
        "x-api-key": IDN_WEB_API_KEY,
        "x-request-id": `${sessionId}_${Date.now()}`,
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`IDN playback authorization failed with status ${response.status}.`);
    }
    const body = (await response.json()) as { data?: { galaktus?: string }; galaktus?: string };
    const galaktus = body.data?.galaktus ?? body.galaktus;
    if (!galaktus) {
      throw new Error("IDN playback authorization did not return galaktus.");
    }
    return validateAuthorizedPlaybackUrl(decryptIdnAptPayload(galaktus));
  } finally {
    clearTimeout(timeout);
  }
}

async function resolvePlaybackUrl(stream: IdnLivestream, pageUrl: string, cookieHeader?: string) {
  if (stream.live_type === "idnliveplus") {
    return fetchGoldPlaybackUrl(stream, pageUrl, cookieHeader ?? "");
  }
  return getPlaybackUrl(stream);
}

function buildIdnUrl(...segments: string[]) {
  const encodedSegments = segments.map((segment) => encodeURIComponent(segment));
  return `${IDN_BASE_URL}/${encodedSegments.join("/")}`;
}

function extractNextData(html: string): NextData {
  const match = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);

  if (!match?.[1]) {
    throw new Error("Unable to find IDN page data.");
  }

  return JSON.parse(match[1]) as NextData;
}

async function fetchHtml(url: string, cookieHeader?: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const headers: HeadersInit = {
    accept: "text/html,application/xhtml+xml",
    "user-agent": "Mozilla/5.0 (compatible; bajag-theater/1.0)",
  };

  if (cookieHeader) {
    headers.cookie = cookieHeader;
  }

  try {
    const response = await fetch(url, {
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`IDN request failed with status ${response.status} for ${url}`);
    }

    return response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function isLiveStream(stream: IdnLivestream) {
  return stream.status?.toLowerCase() === "live";
}

function getPlaybackUrl(stream?: IdnLivestream) {
  return stream?.entity?.playback_url || stream?.playback_url || "";
}

function isIdnHost(hostname: string) {
  return hostname === "idn.app" || hostname.endsWith(".idn.app");
}

function parseIdnLiveUrl(liveUrl: string) {
  const url = new URL(liveUrl);
  const segments = url.pathname.split("/").filter(Boolean);

  if (!isIdnHost(url.hostname) || segments.length < 3 || segments[1] !== "live") {
    throw new Error("IDN live URL must look like https://www.idn.app/{username}/live/{slug}");
  }

  const username = decodeURIComponent(segments[0]);
  // IDN shows a pre-purchase paywall page at /{username}/live/preview/{slug};
  // the actual live (with the playback URL) is at /{username}/live/{slug}, so
  // unwrap the "preview" segment to reach the real stream.
  const isPreview = segments[2] === "preview" && segments.length >= 4;
  const slug = decodeURIComponent(isPreview ? segments[3] : segments[2]);

  return { slug, username };
}

export async function getIdnLiveStreamFromUrl(liveUrl: string, cookieHeader?: string): Promise<IdnLiveStream | null> {
  const { slug, username } = parseIdnLiveUrl(liveUrl);
  // Always fetch the canonical live page so a pasted "preview" URL still works.
  const pageUrl = buildIdnUrl(username, "live", slug);
  const liveData = extractNextData(await fetchHtml(pageUrl, cookieHeader));
  const stream = liveData.props?.pageProps?.livestream;
  const playbackUrl = stream ? await resolvePlaybackUrl(stream, pageUrl, cookieHeader) : "";

  if (!playbackUrl) {
    return null;
  }

  return {
    pageUrl,
    playbackUrl,
    slug: stream?.slug || slug,
    title: stream?.title,
  };
}

export async function getIdnLiveStream(username: string, cookieHeader?: string): Promise<IdnLiveStream | null> {
  const profileUrl = buildIdnUrl(username);
  const profileData = extractNextData(await fetchHtml(profileUrl, cookieHeader));
  const pageProps = profileData.props?.pageProps;
  const livestreams = pageProps?.livestreams ?? [];
  const stream = livestreams.find(isLiveStream) ?? livestreams.find(getPlaybackUrl);

  if (!stream?.slug) {
    return null;
  }

  const liveUsername = stream.creator?.username || pageProps?.profile?.username || username;
  const pageUrl = buildIdnUrl(liveUsername, "live", stream.slug);
  const liveData = extractNextData(await fetchHtml(pageUrl, cookieHeader));
  const detailStream = liveData.props?.pageProps?.livestream ?? stream;
  const playbackUrl = await resolvePlaybackUrl(detailStream, pageUrl, cookieHeader);

  if (!playbackUrl) {
    return null;
  }

  return {
    pageUrl,
    playbackUrl,
    slug: detailStream.slug || stream.slug,
    title: detailStream.title || stream.title,
  };
}
