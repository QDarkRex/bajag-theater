import dotenv from "dotenv";
import { bool, cleanEnv, host, makeValidator, num, port, str } from "envalid";

dotenv.config();

const isValidPath = makeValidator((path) => {
  if (!path || typeof path !== "string") {
    throw new Error("Invalid path!");
  }

  const invalidChars = /[<>:"|?*]/;
  if (invalidChars.test(path)) {
    throw new Error("Invalid path!");
  }

  const reservedNames = /^(con|prn|aux|nul|com\d|lpt\d)$/i;
  if (reservedNames.test(path.split(/[\\/]/).pop() || "")) {
    throw new Error("Invalid path!");
  }

  if (path.length > 260) {
    throw new Error("Too long!");
  }

  if (/[\s.\\/]$/.test(path)) {
    throw new Error("Path ends with an invalid character (space, dot, or slash).");
  }

  return path;
});

export const env = cleanEnv(process.env, {
  NODE_ENV: str({ default: "development", choices: ["development", "production", "test"] }),
  HOST: host({ default: "localhost" }),
  PORT: port({ default: 3000 }),
  CORS_ORIGIN: str({ default: "http://localhost:3000" }),
  COMMON_RATE_LIMIT_MAX_REQUESTS: num({ default: 1000 }),
  COMMON_RATE_LIMIT_WINDOW_MS: num({ default: 1000 }),
  COOKIES: isValidPath({ default: "cookies/cookies" }),
  REPLAY_DIR: str({ default: "replay" }),
  HW_ACCEL: str({ default: "VAAPI", choices: ["NVENC", "VAAPI"] }),
  FFMPEG_PATH: str({ default: "/usr/bin/ffmpeg" }),
  DOWNLOAD_DIR: str({ default: "download" }),
  PROXY_URL: str({ default: "http://localhost:3000/livestream/proxy" }),
  IDN_USERNAME: str({ default: "jkt48-official" }),
});
