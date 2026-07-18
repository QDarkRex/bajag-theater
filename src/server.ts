import path from "node:path";
import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import { pino } from "pino";

import { healthCheckRouter } from "@/api/healthCheck/healthCheckRouter";
import { livesreamRouter } from "@/api/livestream/livesreamRouter";
import { replayRouter } from "@/api/replay/replayRoute";
import { scheduleRouter } from "@/api/schedule/scheduleRoute";
import { watchRouter } from "@/api/watch/watchRouter";

import errorHandler from "@/common/middleware/errorHandler";
import rateLimiter from "@/common/middleware/rateLimiter";
import requestLogger from "@/common/middleware/requestLogger";
import { createWebAuth } from "@/common/middleware/webAuth";
import { env } from "@/common/utils/envConfig";

const logger = pino({ name: "server start" });
const app: Express = express();
const webAuth = createWebAuth({
  username: env.AUTH_USERNAME,
  password: env.AUTH_PASSWORD,
  sessionSecret: env.AUTH_SESSION_SECRET,
  sessionTtlSeconds: env.AUTH_SESSION_TTL_SECONDS,
});

// Trust only the directly connected reverse proxy, not arbitrary forwarded headers.
app.set("trust proxy", 1);

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(
  helmet({
    contentSecurityPolicy: false,
  }),
);

if (env.isProd) {
  app.use(rateLimiter);
}

// Request logging
app.use(requestLogger);

// Routes
app.use("/health-check", healthCheckRouter);
app.use(webAuth.router);
app.use(webAuth.middleware);
app.use("/schedule", scheduleRouter);
app.use("/livestream", livesreamRouter);
app.use("/replay", replayRouter);
app.use("/watch", watchRouter);

app.use(express.static(path.resolve("public")));

app.get("/", async (_req, res) => {
  return res.sendFile(`${path.resolve("public")}/view.html`);
});

// Swagger UI
// app.use(openAPIRouter);

// Error handlers
app.use(errorHandler());

export { app, logger };
