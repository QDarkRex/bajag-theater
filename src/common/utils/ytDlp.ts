import { execFile, spawn } from "node:child_process";
import { access, chmod, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const MAX_BUFFER = 1024 * 1024 * 20;
const DOWNLOAD_TIMEOUT_MS = 120000;

async function getYtDlpCommand(): Promise<string> {
  const managedBinary = getManagedYtDlpPath();
  try {
    await access(managedBinary);
    return managedBinary;
  } catch {
    // Fall through to the bundled binary or PATH.
  }

  if (process.platform === "win32") {
    return "yt-dlp";
  }

  const bundledBinary = path.resolve("yt-dlp");
  try {
    await access(bundledBinary);
    await chmod(bundledBinary, 0o755).catch(() => undefined);
    return bundledBinary;
  } catch {
    return "yt-dlp";
  }
}

export function getManagedYtDlpPath(): string {
  return path.resolve(".cache", process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp");
}

export async function downloadYtDlp(): Promise<string> {
  const assetName = process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
  const url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${assetName}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });

  if (!response.ok) {
    throw new Error(`Failed to download yt-dlp from ${url}: ${response.status} ${response.statusText}`);
  }

  const binaryPath = getManagedYtDlpPath();
  const bytes = Buffer.from(await response.arrayBuffer());
  await mkdir(path.dirname(binaryPath), { recursive: true });
  await writeFile(binaryPath, bytes);
  if (process.platform !== "win32") {
    await chmod(binaryPath, 0o755);
  }

  return binaryPath;
}

export async function runYtDlp(args: string[]): Promise<string> {
  const command = await getYtDlpCommand();
  const { stdout } = await execFileAsync(command, args, { maxBuffer: MAX_BUFFER });
  return stdout;
}

export async function spawnYtDlp(args: string[]) {
  const command = await getYtDlpCommand();
  return spawn(command, args);
}
