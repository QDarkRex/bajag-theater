const IDN_BASE_URL = "https://www.idn.app";
const REQUEST_TIMEOUT_MS = 15000;

type IdnProfile = {
  username?: string;
};

type IdnLivestream = {
  slug?: string;
  status?: string;
  title?: string;
  playback_url?: string;
  entity?: {
    playback_url?: string;
  };
  creator?: {
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

async function fetchHtml(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "Mozilla/5.0 (compatible; bajag-theater/1.0)",
      },
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

export async function getIdnLiveStream(username: string): Promise<IdnLiveStream | null> {
  const profileUrl = buildIdnUrl(username);
  const profileData = extractNextData(await fetchHtml(profileUrl));
  const pageProps = profileData.props?.pageProps;
  const livestreams = pageProps?.livestreams ?? [];
  const stream = livestreams.find(isLiveStream) ?? livestreams.find(getPlaybackUrl);

  if (!stream?.slug) {
    return null;
  }

  const liveUsername = stream.creator?.username || pageProps?.profile?.username || username;
  const pageUrl = buildIdnUrl(liveUsername, "live", stream.slug);
  const liveData = extractNextData(await fetchHtml(pageUrl));
  const detailStream = liveData.props?.pageProps?.livestream ?? stream;
  const playbackUrl = getPlaybackUrl(detailStream) || getPlaybackUrl(stream);

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
