import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "@/common/utils/envConfig";

export type RuntimeConfig = {
  idnLiveUrl: string;
  idnUsername: string;
  updatedAt?: string;
};

const configPath = path.join(path.dirname(env.COOKIES), "runtime-config.json");

async function readRuntimeConfigFile(): Promise<Partial<RuntimeConfig>> {
  const content = await readFile(configPath, "utf8").catch(() => "");

  if (!content.trim()) {
    return {};
  }

  return JSON.parse(content) as Partial<RuntimeConfig>;
}

export async function getRuntimeConfig(): Promise<RuntimeConfig> {
  const saved = await readRuntimeConfigFile().catch(() => ({}));

  return {
    idnLiveUrl: saved.idnLiveUrl?.trim() ?? env.IDN_LIVE_URL.trim(),
    idnUsername: saved.idnUsername?.trim() || env.IDN_USERNAME,
    updatedAt: saved.updatedAt,
  };
}

export async function saveRuntimeConfig(config: Partial<RuntimeConfig>) {
  const current = await getRuntimeConfig();
  const next: RuntimeConfig = {
    idnLiveUrl: config.idnLiveUrl?.trim() ?? current.idnLiveUrl,
    idnUsername: config.idnUsername?.trim() || current.idnUsername,
    updatedAt: new Date().toISOString(),
  };

  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(next, null, 2)}\n`);

  return next;
}

export async function getCookieStatus() {
  const content = await readFile(env.COOKIES, "utf8").catch(() => "");

  return {
    configured: content.trim().length > 0,
    path: env.COOKIES,
  };
}

export async function saveCookieFile(content: string) {
  await mkdir(path.dirname(env.COOKIES), { recursive: true });
  await writeFile(env.COOKIES, content.trim() ? `${content.trim()}\n` : "");
}
