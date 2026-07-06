import { readFile } from "node:fs/promises";
import { createApiResponse } from "@/api-docs/openAPIResponseBuilders";
import { env } from "@/common/utils/envConfig";
import { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
// @ts-ignore
import proxy from "@warren-bank/hls-proxy/hls-proxy/proxy";
import express, { type Router } from "express";
import { z } from "zod";

const middleware = proxy({
  is_secure: env.PROXY_URL.startsWith("https://"),
  host: null,
  copy_req_headers: false,
  req_headers: null,
  req_options: null,
  hooks: null,
  cache_segments: true,
  max_segments: 20,
  cache_timeout: 60,
  cache_key: 0,
  cache_storage: null,
  cache_storage_fs_dirpath: null,
  debug_level: 3,
  acl_ip: null,
  acl_pass: null,
  http_proxy: null,
  manifest_extension: null,
  segment_extension: null,
});

import { ServiceResponse } from "@/common/models/serviceResponse";
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

livesreamRouter.get("/proxy/*", middleware.request);

livesreamRouter.get("/output.m3u8", async (_req, res) => {
  const url = await getM3u8();
  try {
    if (url) {
      logger.info(`URL already fetched (${url}). Skipping`);
      const proxy_url = `${env.PROXY_URL}`;
      const video_url = url;
      const file_extension = ".m3u8";

      const hls_proxy_url = `${proxy_url}/${encodeURIComponent(Buffer.from(video_url).toString("base64"))}${file_extension}`;

      const file = await fetch(hls_proxy_url);
      const content = await file.text();
      return res.status(200).type("application/vnd.apple.mpegurl").send(content);
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
