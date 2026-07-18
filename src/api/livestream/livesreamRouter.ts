import { readFile, writeFile } from "node:fs/promises";
import { createApiResponse } from "@/api-docs/openAPIResponseBuilders";
import { ServiceResponse } from "@/common/models/serviceResponse";
import { env } from "@/common/utils/envConfig";
import { getIdnLiveStream, getIdnLiveStreamFromUrl, parseCookieFile } from "@/common/utils/idnLive";
import { getCookieStatus, getRuntimeConfig, saveCookieFile, saveRuntimeConfig } from "@/common/utils/runtimeConfig";
import { requestStreamRefresh } from "@/common/utils/streamState";
import { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import express, { type Response, type Router } from "express";
import { z } from "zod";

import { rewriteManifest } from "@/common/utils/hlsManifest";
import { handleServiceResponse } from "@/common/utils/httpHandlers";
import { logger } from "@/server";

export const livestreamRegistry = new OpenAPIRegistry();
export const livesreamRouter: Router = express.Router();
const IDN_ORIGIN = "https://www.idn.app";

livestreamRegistry.registerPath({
  method: "get",
  path: "/livestream",
  tags: ["Livestream"],
  responses: createApiResponse(z.string(), "Success"),
});

async function getM3u8() {
  return (await readFile("url", "utf8").catch(() => "")).trim();
}

async function readCookieHeader() {
  const content = await readFile(env.COOKIES, "utf8").catch(() => "");
  return parseCookieFile(content);
}

async function getPlayerPlaybackUrl(fallbackUrl: string) {
  const runtimeConfig = await getRuntimeConfig();
  const cookieHeader = await readCookieHeader();
  const directLiveUrl = runtimeConfig.idnLiveUrl.trim();
  const idnUsername = runtimeConfig.idnUsername.trim();
  const stream = directLiveUrl
    ? await getIdnLiveStreamFromUrl(directLiveUrl, cookieHeader)
    : await getIdnLiveStream(idnUsername, cookieHeader);

  return stream?.playbackUrl || fallbackUrl;
}

function isIdnHost(hostname: string) {
  return hostname === "idn.app" || hostname.endsWith(".idn.app");
}

function isIvsHost(hostname: string) {
  return hostname === "live-video.net" || hostname.endsWith(".live-video.net");
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

// The /proxy endpoint accepts any public URL, so blindly forwarding IDN cookies
// would leak the account session. Cookies stay on IDN hosts; IVS authorization
// uses signed URLs plus the IDN Origin header across its playlist/CDN hosts.
async function buildProxyRequestHeaders(targetUrl: string): Promise<HeadersInit> {
  const headers: HeadersInit = {
    accept: "application/vnd.apple.mpegurl,application/x-mpegurl,video/mp2t,*/*",
    "user-agent": "Mozilla/5.0 (compatible; bajag-theater/1.0)",
  };

  const targetHost = hostnameOf(targetUrl);
  const streamHost = hostnameOf(await getM3u8());
  const ivsPlayback = !!targetHost && !!streamHost && isIvsHost(targetHost) && isIvsHost(streamHost);
  const trusted = !!targetHost && (isIdnHost(targetHost) || targetHost === streamHost || ivsPlayback);

  if (trusted) {
    if (ivsPlayback) {
      headers.origin = IDN_ORIGIN;
      headers.referer = `${IDN_ORIGIN}/`;
    }
    if (isIdnHost(targetHost)) {
      const cookieHeader = await readCookieHeader();
      if (cookieHeader) {
        headers.cookie = cookieHeader;
      }
    }
  }

  return headers;
}

async function clearCurrentStream() {
  requestStreamRefresh();
  await writeFile("url", "");
  await writeFile("isDownloading", "false");
}

// Reject hosts that point back at the machine running this service or at a
// private network. Without this the /proxy endpoint is an open relay: a client
// could ask the server to fetch internal services or the cloud metadata
// endpoint (169.254.169.254) and read the response through us (SSRF).
function isBlockedProxyHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, ""); // strip IPv6 brackets

  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return true;
  }

  // IPv6 loopback (::1), link-local (fe80::/10) and unique-local (fc00::/7).
  if (host === "::1" || host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) {
    return true;
  }

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (a === 0 || a === 127) return true; // this host / loopback
    if (a === 10) return true; // private
    if (a === 169 && b === 254) return true; // link-local incl. metadata endpoint
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  }

  return false;
}

function decodeProxyTarget(proxyPath: string) {
  const lastPathPart = proxyPath.split("/").filter(Boolean).at(-1) ?? "";
  const encodedUrl = decodeURIComponent(lastPathPart).replace(/\.[a-z0-9]+$/i, "");
  const targetUrl = Buffer.from(encodedUrl, "base64url").toString("utf8");

  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    throw new Error("Invalid proxied livestream URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Invalid proxied livestream URL.");
  }

  if (isBlockedProxyHost(parsed.hostname)) {
    throw new Error("Refusing to proxy a private or loopback address.");
  }

  return targetUrl;
}

function isManifestResponse(targetUrl: string, response: globalThis.Response) {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  return targetUrl.includes(".m3u8") || contentType.includes("mpegurl") || contentType.includes("vnd.apple");
}

async function proxyHlsResource(targetUrl: string, res: Response) {
  const response = await fetch(targetUrl, {
    headers: await buildProxyRequestHeaders(targetUrl),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    logger.warn({ status: response.status, targetUrl, body }, "HLS proxy target returned an error.");
    return res.status(response.status).send(body || response.statusText);
  }

  if (isManifestResponse(targetUrl, response)) {
    const manifest = await response.text();
    const rewrittenManifest = rewriteManifest(manifest, targetUrl);
    return res
      .status(200)
      .setHeader("Cache-Control", "no-cache, no-store, private")
      .type("application/vnd.apple.mpegurl")
      .send(rewrittenManifest);
  }

  const contentType = response.headers.get("content-type") ?? "application/octet-stream";
  const buffer = Buffer.from(await response.arrayBuffer());
  return res.status(200).setHeader("Cache-Control", "public, max-age=60").type(contentType).send(buffer);
}

livesreamRouter.get("/proxy/*", async (req, res) => {
  try {
    const proxyPath = (req.params as Record<string, string>)[0] ?? "";
    const targetUrl = decodeProxyTarget(proxyPath);
    return await proxyHlsResource(targetUrl, res);
  } catch (error) {
    logger.error(error);
    return res.status(400).send("Invalid livestream proxy URL.");
  }
});

livesreamRouter.get("/settings", async (_req, res) => {
  const [runtimeConfig, cookieStatus] = await Promise.all([getRuntimeConfig(), getCookieStatus()]);

  const serviceResponse = ServiceResponse.success("Success!", {
    idnLiveUrl: runtimeConfig.idnLiveUrl,
    idnUsername: runtimeConfig.idnUsername,
    updatedAt: runtimeConfig.updatedAt,
    cookiesConfigured: cookieStatus.configured,
  });

  return handleServiceResponse(serviceResponse, res);
});

livesreamRouter.post("/settings", async (req, res) => {
  const schema = z.object({
    idnLiveUrl: z.string().optional().default(""),
    idnUsername: z.string().optional().default(""),
  });
  const body = schema.parse(req.body);
  const config = await saveRuntimeConfig(body);
  await clearCurrentStream();

  const serviceResponse = ServiceResponse.success("Settings saved.", {
    idnLiveUrl: config.idnLiveUrl,
    idnUsername: config.idnUsername,
    updatedAt: config.updatedAt,
  });

  return handleServiceResponse(serviceResponse, res);
});

livesreamRouter.post("/cookies", async (req, res) => {
  const schema = z.object({
    cookies: z.string().default(""),
  });
  const body = schema.parse(req.body);
  await saveCookieFile(body.cookies);
  await clearCurrentStream();

  const serviceResponse = ServiceResponse.success("Cookies saved.", {
    cookiesConfigured: body.cookies.trim().length > 0,
  });

  return handleServiceResponse(serviceResponse, res);
});

livesreamRouter.post("/refresh", async (_req, res) => {
  await clearCurrentStream();

  const serviceResponse = ServiceResponse.success("Stream refresh requested.", null);
  return handleServiceResponse(serviceResponse, res);
});

livesreamRouter.get("/output.m3u8", async (_req, res) => {
  const url = await getM3u8();
  try {
    if (url) {
      // Amazon IVS playback tokens are single-use. The recorder consumes its
      // token when it starts, so each player session must receive a newly
      // authorized URL instead of reusing the recorder's stored URL.
      const playerUrl = await getPlayerPlaybackUrl(url);
      logger.info("Fresh IDN playback URL acquired for player.");
      return await proxyHlsResource(playerUrl, res);
    }

    const serviceResponse = ServiceResponse.failure("Something went wrong", "No livestream URL!");
    return handleServiceResponse(serviceResponse, res);
  } catch (error) {
    logger.error(error);
    const serviceResponse = ServiceResponse.failure("Something went wrong", null);
    return handleServiceResponse(serviceResponse, res);
  }
});

livesreamRouter.get("/raw", async (_req, res) => {
  const url = await getM3u8();
  if (!url) {
    const serviceResponse = ServiceResponse.failure("Something went wrong", "No URL Found!");
    return handleServiceResponse(serviceResponse, res);
  }

  return res.redirect(url);
});

livesreamRouter.get("/index.m3u8", async (_req, res) => {
  const url = await getM3u8();
  if (!url) {
    const serviceResponse = ServiceResponse.failure("Something went wrong", "No URL Found!");
    return handleServiceResponse(serviceResponse, res);
  }

  return res.redirect(url);
});
