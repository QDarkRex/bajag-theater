import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

import { getFormattedDate } from "@/common/utils/date";
import { env } from "@/common/utils/envConfig";
import { getIdnLiveStream, getIdnLiveStreamFromUrl, parseCookieFile } from "@/common/utils/idnLive";
import { getRuntimeConfig } from "@/common/utils/runtimeConfig";
import { clearActiveStreamProcess, getStreamGeneration, setActiveStreamProcess } from "@/common/utils/streamState";
import { app, logger } from "@/server";

const HLS_CHECK_TIMEOUT_MS = 10000;
const LIVESTREAM_CHECK_INTERVAL_MS = 15 * 1000;
const STREAMLINK_RETRY_DELAY_MS = 1500;

const { NODE_ENV, HOST, PORT } = env;
const server = app.listen(env.PORT, () => {
  logger.info(`Server (${NODE_ENV}) running on port http://${HOST}:${PORT}`);
});

const onCloseSignal = () => {
  logger.info("sigint received, shutting down");
  server.close(() => {
    logger.info("server closed");
    process.exit();
  });
  setTimeout(() => process.exit(1), 10000).unref(); // Force shutdown after 10s
};

async function readCookieHeader() {
  const content = await readFile(env.COOKIES, "utf8").catch(() => "");
  return parseCookieFile(content);
}

function streamlinkCookieArgs(cookieHeader: string) {
  if (!cookieHeader) {
    return [];
  }

  return cookieHeader
    .split(";")
    .map((cookie) => cookie.trim())
    .filter(Boolean)
    .flatMap((cookie) => ["--http-cookie", cookie]);
}

async function isPlaybackUrlReachable(url: string, cookieHeader: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HLS_CHECK_TIMEOUT_MS);
  const headers: HeadersInit = {
    accept: "application/vnd.apple.mpegurl,application/x-mpegurl,*/*",
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
      return false;
    }

    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    const manifest = await response.text();

    return contentType.includes("mpegurl") || manifest.includes("#EXTM3U");
  } catch (error) {
    logger.warn({ error }, "Stored IDN playback URL is not reachable.");
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function downloadStream(
  url: string,
  quality: string,
  outputFile: string,
  generation: number,
  maxRetries = 3,
): Promise<void> {
  let attempts = 0;
  const cookieHeader = await readCookieHeader();

  await writeFile("isDownloading", "true");

  try {
    while (attempts < maxRetries && generation === getStreamGeneration()) {
      attempts++;
      logger.info(`Starting stream download attempt ${attempts}`);

      const args: string[] = [
        "--hls-live-restart",
        "-o",
        outputFile,
        ...streamlinkCookieArgs(cookieHeader),
        url,
        quality,
      ];

      const commandStr = `streamlink ${args.map((arg) => (arg.includes("=") ? '"[redacted]"' : `"${arg}"`)).join(" ")}`;
      logger.info(`Executing command:${commandStr}`);

      const proc = spawn("streamlink", args);
      setActiveStreamProcess(proc);

      proc.stdout.on("data", (data: Buffer) => {
        logger.info(`Progress: ${data.toString()}`);
      });

      proc.stderr.on("data", (data: Buffer) => {
        logger.error(`Streamlink error output: ${data.toString()}`);
      });

      const exitCode: number = await new Promise((resolve) => {
        let settled = false;
        const settle = (code: number) => {
          if (!settled) {
            settled = true;
            resolve(code);
          }
        };

        proc.on("error", (error) => {
          logger.error({ error }, "Failed to start Streamlink.");
          settle(1);
        });

        proc.on("close", (code) => {
          settle(code ?? 1);
        });
      });
      clearActiveStreamProcess(proc);

      if (generation !== getStreamGeneration()) {
        logger.info("Stream refresh requested. Stopping current download attempt.");
        break;
      }

      if (exitCode === 0) {
        logger.info("Stream download completed successfully.");
        await writeFile("url", "");
        break;
      }

      logger.error(`Download failed with exit code ${exitCode}. Retrying in ${STREAMLINK_RETRY_DELAY_MS}ms...`);
      if (attempts < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, STREAMLINK_RETRY_DELAY_MS));
      }
    }

    if (attempts >= maxRetries && generation === getStreamGeneration()) {
      logger.error("Exceeded maximum retry attempts. Recording failed; keeping the playback URL available.");
    }
  } finally {
    if (generation === getStreamGeneration()) {
      await writeFile("isDownloading", "false");
    }
  }
}

async function checkAndDownloadLivestream() {
  const date = getFormattedDate();
  const output = `video/${date}.ts`;

  const isDownloading = (await readFile("isDownloading", "utf8").catch(() => "")) === "true";
  const cookieHeader = await readCookieHeader();
  let url = (await readFile("url", "utf8").catch(() => "")).trim();

  if (url && !isDownloading && !(await isPlaybackUrlReachable(url, cookieHeader))) {
    logger.info("Stored IDN playback URL is stale. Fetching a fresh stream URL.");
    await writeFile("url", "");
    url = "";
  }

  // Fetch URL if not present
  if (!url) {
    const runtimeConfig = await getRuntimeConfig();
    const directLiveUrl = runtimeConfig.idnLiveUrl.trim();
    const idnUsername = runtimeConfig.idnUsername.trim();
    logger.info(
      directLiveUrl ? `Fetching IDN Live stream from ${directLiveUrl}` : `Fetching IDN Live stream for ${idnUsername}`,
    );
    try {
      const stream = directLiveUrl
        ? await getIdnLiveStreamFromUrl(directLiveUrl, cookieHeader)
        : await getIdnLiveStream(idnUsername, cookieHeader);

      if (!stream) {
        logger.info(
          directLiveUrl ? `No playback URL found for ${directLiveUrl}` : `No IDN Live stream found for ${idnUsername}`,
        );
        return;
      }

      logger.info(`IDN Live stream found: ${stream.title || stream.slug} (${stream.pageUrl})`);
      await writeFile("url", stream.playbackUrl);
      url = stream.playbackUrl;
    } catch (error) {
      logger.error("Error fetching IDN Live stream:", error);
      logger.error(error);
      return;
    }
  }

  logger.info(`Livestream found. ${isDownloading ? "Download process already started" : "Downloading"}`);

  // Start download if not already downloading
  if (!isDownloading) {
    await downloadStream(url, "best", output, getStreamGeneration(), 20);
  }
}

setInterval(() => {
  checkAndDownloadLivestream().catch((error) => {
    logger.error("Livestream watcher failed:");
    logger.error(error);
  });
}, LIVESTREAM_CHECK_INTERVAL_MS);

checkAndDownloadLivestream().catch((error) => {
  logger.error("Initial livestream check failed:");
  logger.error(error);
});

process.on("SIGINT", onCloseSignal);
process.on("SIGTERM", onCloseSignal);
