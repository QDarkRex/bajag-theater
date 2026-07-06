import { readFile, writeFile } from "node:fs/promises";
import { createApiResponse } from "@/api-docs/openAPIResponseBuilders";
import { ServiceResponse } from "@/common/models/serviceResponse";
import { env } from "@/common/utils/envConfig";
import { getCookieStatus, getRuntimeConfig, saveCookieFile, saveRuntimeConfig } from "@/common/utils/runtimeConfig";
import { requestStreamRefresh } from "@/common/utils/streamState";
import { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import express, { type Response, type Router } from "express";
import { z } from "zod";

import { handleServiceResponse } from "@/common/utils/httpHandlers";
import { logger } from "@/server";

export const livestreamRegistry = new OpenAPIRegistry();
export const livesreamRouter: Router = express.Router();

livestreamRegistry.registerPath({
  method: "get",
  path: "/livestream",
  tags: ["Livestream"],
  responses: createApiResponse(z.string(), "Success"),
});

async function getM3u8() {
  return (await readFile("url", "utf8").catch(() => "")).trim();
}

async function clearCurrentStream() {
  requestStreamRefresh();
  await writeFile("url", "");
  await writeFile("isDownloading", "false");
}

function getProxyExtension(targetUrl: string) {
  const pathname = new URL(targetUrl).pathname;
  const match = pathname.match(/\.[a-z0-9]+$/i);
  return match?.[0] ?? "";
}

function toProxyUrl(targetUrl: string) {
  const encodedUrl = Buffer.from(targetUrl).toString("base64url");
  return `${env.PROXY_URL}/${encodedUrl}${getProxyExtension(targetUrl)}`;
}

function decodeProxyTarget(proxyPath: string) {
  const lastPathPart = proxyPath.split("/").filter(Boolean).at(-1) ?? "";
  const encodedUrl = decodeURIComponent(lastPathPart).replace(/\.[a-z0-9]+$/i, "");
  const targetUrl = Buffer.from(encodedUrl, "base64url").toString("utf8");

  if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
    throw new Error("Invalid proxied livestream URL.");
  }

  return targetUrl;
}

function resolveProxyUrl(uri: string, baseUrl: string) {
  if (uri.startsWith("data:")) {
    return uri;
  }

  return toProxyUrl(new URL(uri, baseUrl).toString());
}

function rewriteManifest(manifest: string, baseUrl: string) {
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

function isManifestResponse(targetUrl: string, response: globalThis.Response) {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  return targetUrl.includes(".m3u8") || contentType.includes("mpegurl") || contentType.includes("vnd.apple");
}

async function proxyHlsResource(targetUrl: string, res: Response) {
  const response = await fetch(targetUrl, {
    headers: {
      accept: "application/vnd.apple.mpegurl,application/x-mpegurl,video/mp2t,*/*",
      "user-agent": "Mozilla/5.0 (compatible; bajag-theater/1.0)",
    },
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
    const targetUrl = decodeProxyTarget(req.params[0]);
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
      logger.info(`URL already fetched (${url}). Skipping`);
      return await proxyHlsResource(url, res);
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
