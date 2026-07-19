import type { Request } from "express";
import { rateLimit } from "express-rate-limit";

import { env } from "@/common/utils/envConfig";

const rateLimiter = rateLimit({
  legacyHeaders: true,
  limit: env.COMMON_RATE_LIMIT_MAX_REQUESTS,
  message: "Too many requests, please try again later.",
  standardHeaders: true,
  // COMMON_RATE_LIMIT_WINDOW_MS is already expressed in milliseconds.
  // Multiplying it here turned the documented 1,000 ms default into a
  // 15-minute window, which made normal web navigation hit the limit.
  windowMs: env.COMMON_RATE_LIMIT_WINDOW_MS,
  keyGenerator: (req: Request) => req.ip as string,
  skip: (req) => {
    const path = req.url;
    if (path.includes("livestream") || path.includes("css") || path.includes("js") || path.includes("img")) {
      return true;
    }
    return false;
  },
});

export default rateLimiter;
