import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

import { getFormattedDate } from "@/common/utils/date";
import { env } from "@/common/utils/envConfig";
import { getIdnLiveStream, parseCookieFile } from "@/common/utils/idnLive";
import { app, logger } from "@/server";

const HLS_CHECK_TIMEOUT_MS = 10000;

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

async function downloadStream(url: string, quality: string, outputFile: string, maxRetries = 3): Promise<void> {
  let attempts = 0;
  const cookieHeader = await readCookieHeader();

  while (attempts < maxRetries) {
    attempts++;
    logger.info(`Starting stream download attempt ${attempts}`);
    // Mark as downloading (for your service logic)
    await writeFile("isDownloading", "true");

    // Build the Streamlink arguments.
    // Using --hls-live-restart to start the stream from the beginning.
    // The --player= option forces Streamlink to not launch any external player.
    const args: string[] = [
      "--hls-live-restart",
      url,
      quality,
      "--no-config",
      "--player=",
      "-o",
      outputFile,
      ...streamlinkCookieArgs(cookieHeader),
    ];

    // Log the complete command for debugging.
    const commandStr = `streamlink ${args.map((arg) => (arg.includes("=") ? '"[redacted]"' : `"${arg}"`)).join(" ")}`;
    logger.info(`Executing command:${commandStr}`);

    // Spawn the Streamlink process.
    const proc = spawn("streamlink", args);

    // Optionally listen to stdout for progress information.
    proc.stdout.on("data", (data: Buffer) => {
      logger.info(`Progress: ${data.toString()}`);
    });
    // Log any error output.
    proc.stderr.on("data", (data: Buffer) => {
      logger.error(`Streamlink error output: ${data.toString()}`);
    });

    // Wait for the process to complete.
    const exitCode: number = await new Promise((resolve) => {
      proc.on("close", resolve);
    });

    if (exitCode === 0) {
      logger.info("Stream download completed successfully.");
      await writeFile("isDownloading", "false");
      // Clear URL or perform any post-download cleanup.
      await writeFile("url", "");
      break;
    } else {
      logger.error(`Download failed with exit code ${exitCode}. Retrying in 10 seconds...`);
      await writeFile("isDownloading", "false");
      // Wait before retrying.
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }

  if (attempts >= maxRetries) {
    logger.error("Exceeded maximum retry attempts. Download failed.");
    await writeFile("url", "");
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
    logger.info(`Fetching IDN Live stream for ${env.IDN_USERNAME}`);
    try {
      const stream = await getIdnLiveStream(env.IDN_USERNAME, cookieHeader);

      if (!stream) {
        logger.info(`No IDN Live stream found for ${env.IDN_USERNAME}`);
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
    await downloadStream(url, "best", output, 20);
  }
}

setInterval(() => {
  checkAndDownloadLivestream().catch((error) => {
    logger.error("Livestream watcher failed:");
    logger.error(error);
  });
}, 60 * 1000);

checkAndDownloadLivestream().catch((error) => {
  logger.error("Initial livestream check failed:");
  logger.error(error);
});

process.on("SIGINT", onCloseSignal);
process.on("SIGTERM", onCloseSignal);
