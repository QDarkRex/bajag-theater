import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { Router } from "express";
import rateLimit from "express-rate-limit";

const SESSION_COOKIE = "bajag_session";

export interface WebAuthConfig {
  username: string;
  password: string;
  sessionSecret: string;
  sessionTtlSeconds: number;
}

function safeEqual(left: string, right: string): boolean {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

function safeNext(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }
  return value;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[character];
  });
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};

  return Object.fromEntries(
    header.split(";").flatMap((part) => {
      const separator = part.indexOf("=");
      if (separator < 1) return [];
      const name = part.slice(0, separator).trim();
      const rawValue = part.slice(separator + 1).trim();
      try {
        return [[name, decodeURIComponent(rawValue)]];
      } catch {
        return [];
      }
    }),
  );
}

function signSession(config: WebAuthConfig, expiresAt: number): string {
  const payload = `${config.username}:${expiresAt}`;
  const signature = createHmac("sha256", config.sessionSecret).update(payload).digest("base64url");
  return `${expiresAt}.${signature}`;
}

function validSession(config: WebAuthConfig, token: string | undefined): boolean {
  if (!token) return false;
  const separator = token.indexOf(".");
  if (separator < 1) return false;

  const expiresAt = Number(token.slice(0, separator));
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return false;

  return safeEqual(token, signSession(config, expiresAt));
}

function basicCredentials(req: Request): { username: string; password: string } | undefined {
  const authorization = req.get("authorization");
  if (!authorization?.startsWith("Basic ")) return undefined;

  try {
    const decoded = Buffer.from(authorization.slice(6), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator < 0) return undefined;
    return { username: decoded.slice(0, separator), password: decoded.slice(separator + 1) };
  } catch {
    return undefined;
  }
}

function validBasicAuth(config: WebAuthConfig, req: Request): boolean {
  const credentials = basicCredentials(req);
  return Boolean(
    credentials && safeEqual(credentials.username, config.username) && safeEqual(credentials.password, config.password),
  );
}

function cookieHeader(req: Request, value: string, maxAge: number): string {
  const secure = req.secure ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function loginPage(next: string, failed = false): string {
  const error = failed ? '<p class="error" role="alert">Username atau password salah.</p>' : "";
  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Login | Bajag Theater</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; --bg: #0b1020; --surface: #131a2c; --line: #2a3650; --text: #f4f7ff; --muted: #a8b3ca; --accent: #9d8cff; --accent-strong: #7865f5; }
    * { box-sizing: border-box; }
    body { min-height: 100vh; margin: 0; display: grid; place-items: center; padding: 24px; background: var(--bg); background-image: radial-gradient(circle at 82% -10%, rgba(120, 101, 245, .23), transparent 32rem), radial-gradient(circle at -10% 24%, rgba(67, 214, 154, .08), transparent 26rem); color: var(--text); }
    main { width: min(100%, 420px); padding: 34px; border: 1px solid var(--line); border-radius: 20px; background: rgba(19, 26, 44, .94); box-shadow: 0 24px 70px rgba(0, 0, 0, .3); }
    .brand { display: inline-flex; align-items: center; gap: 11px; margin-bottom: 26px; color: var(--text); font-weight: 750; letter-spacing: -.02em; }
    .brand-mark { display: grid; place-items: center; width: 38px; height: 38px; border-radius: 12px; background: linear-gradient(135deg, var(--accent), #c69bff); color: #17132d; font-size: 1.15rem; font-weight: 900; }
    .brand small { display: block; margin-top: 3px; color: var(--muted); font-size: .72rem; font-weight: 500; }
    h1 { margin: 0 0 8px; font-size: 1.8rem; letter-spacing: -.035em; }
    .intro { margin: 0 0 24px; color: var(--muted); line-height: 1.5; }
    label { display: block; margin: 17px 0 7px; color: var(--text); font-size: .84rem; font-weight: 700; }
    input { width: 100%; padding: 12px 13px; border: 1px solid var(--line); border-radius: 10px; background: #10172a; color: var(--text); font: inherit; transition: border-color .18s, box-shadow .18s; }
    input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(157, 140, 255, .14); outline: none; }
    button { width: 100%; margin-top: 24px; padding: 12px; border: 1px solid transparent; border-radius: 10px; background: var(--accent-strong); color: #fff; font: inherit; font-weight: 750; cursor: pointer; }
    button:hover { background: #8a76ff; }
    button:focus-visible { outline: 3px solid rgba(157, 140, 255, .75); outline-offset: 3px; }
    .error { margin: 0 0 15px; padding: 11px 12px; border: 1px solid rgba(255, 132, 149, .3); border-radius: 10px; background: rgba(255, 132, 149, .1); color: #ffb7c1; font-size: .86rem; }
    .note { margin: 22px 0 0; color: var(--muted); font-size: .76rem; text-align: center; }
    @media (max-width: 430px) { body { padding: 14px; } main { padding: 26px 20px; } }
  </style>
</head>
<body>
  <main>
    <div class="brand"><span class="brand-mark" aria-hidden="true">B</span><span>Bajag Theater<small>Pendamping live JKT48</small></span></div>
    <h1>Selamat datang kembali</h1>
    <p class="intro">Masuk untuk membuka player, pengaturan, dan rekaman.</p>
    ${error}
    <form method="post" action="/login">
      <input type="hidden" name="next" value="${escapeHtml(next)}">
      <label for="username">Username</label>
      <input id="username" name="username" autocomplete="username" required autofocus>
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required>
      <button type="submit">Masuk</button>
    </form>
    <p class="note">Koneksi HTTPS disarankan untuk akses dari internet.</p>
  </main>
</body>
</html>`;
}

export function validateWebAuthConfig(config: WebAuthConfig): void {
  const fields = [config.username, config.password, config.sessionSecret];
  if (fields.some(Boolean) && !fields.every(Boolean)) {
    throw new Error("AUTH_USERNAME, AUTH_PASSWORD, and AUTH_SESSION_SECRET must all be configured");
  }
  if (fields.every(Boolean) && config.sessionSecret.length < 32) {
    throw new Error("AUTH_SESSION_SECRET must contain at least 32 characters");
  }
  if (!Number.isSafeInteger(config.sessionTtlSeconds) || config.sessionTtlSeconds < 60) {
    throw new Error("AUTH_SESSION_TTL_SECONDS must be an integer of at least 60 seconds");
  }
}

export function createWebAuth(config: WebAuthConfig): {
  enabled: boolean;
  router: Router;
  middleware: RequestHandler;
} {
  validateWebAuthConfig(config);
  const enabled = Boolean(config.username && config.password && config.sessionSecret);
  const router = Router();

  router.get("/login", (req, res) => {
    if (!enabled) return res.redirect("/");
    if (validSession(config, parseCookies(req.get("cookie"))[SESSION_COOKIE]) || validBasicAuth(config, req)) {
      return res.redirect(safeNext(req.query.next));
    }
    return res
      .status(200)
      .type("html")
      .send(loginPage(safeNext(req.query.next)));
  });

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  });

  router.post("/login", loginLimiter, (req, res) => {
    if (!enabled) return res.redirect("/");
    const next = safeNext(req.body.next);
    const username = typeof req.body.username === "string" ? req.body.username : "";
    const password = typeof req.body.password === "string" ? req.body.password : "";

    if (!safeEqual(username, config.username) || !safeEqual(password, config.password)) {
      return res.status(401).type("html").send(loginPage(next, true));
    }

    const expiresAt = Math.floor(Date.now() / 1000) + config.sessionTtlSeconds;
    res.setHeader("Set-Cookie", cookieHeader(req, signSession(config, expiresAt), config.sessionTtlSeconds));
    return res.redirect(303, next);
  });

  router.post("/logout", (req, res) => {
    res.setHeader("Set-Cookie", cookieHeader(req, "", 0));
    return res.redirect(303, "/login");
  });

  const middleware: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
    if (!enabled) return next();
    const session = parseCookies(req.get("cookie"))[SESSION_COOKIE];
    if (validSession(config, session) || validBasicAuth(config, req)) return next();

    const acceptsHtml = (req.get("accept") ?? "").includes("text/html");
    if (acceptsHtml && req.method === "GET") {
      return res.redirect(`/login?next=${encodeURIComponent(safeNext(req.originalUrl))}`);
    }

    res.setHeader("WWW-Authenticate", 'Basic realm="Bajag Theater", charset="UTF-8"');
    return res.status(401).json({ message: "Authentication required" });
  };

  return { enabled, router, middleware };
}
