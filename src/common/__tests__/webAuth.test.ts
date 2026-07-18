import express from "express";
import request from "supertest";

import { type WebAuthConfig, createWebAuth, validateWebAuthConfig } from "@/common/middleware/webAuth";

const config: WebAuthConfig = {
  username: "test-user",
  password: "test-password",
  sessionSecret: "a-test-session-secret-with-at-least-32-characters",
  sessionTtlSeconds: 3600,
};

function testApp() {
  const app = express();
  app.set("trust proxy", 1);
  const auth = createWebAuth(config);
  app.use(express.urlencoded({ extended: true }));
  app.use(auth.router);
  app.use(auth.middleware);
  app.get("/", (_req, res) => res.type("html").send("protected"));
  app.get("/livestream/output.m3u8", (_req, res) => res.type("application/vnd.apple.mpegurl").send("manifest"));
  return app;
}

describe("web authentication", () => {
  it("redirects browser navigation to the login page", async () => {
    const response = await request(testApp()).get("/").set("Accept", "text/html");
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe("/login?next=%2F");
  });

  it("challenges HLS clients with HTTP Basic authentication", async () => {
    const response = await request(testApp()).get("/livestream/output.m3u8");
    expect(response.status).toBe(401);
    expect(response.headers["www-authenticate"]).toContain("Basic");
  });

  it("creates a browser session after a valid login", async () => {
    const app = testApp();
    const login = await request(app)
      .post("/login")
      .set("X-Forwarded-For", "203.0.113.5")
      .set("X-Forwarded-Proto", "https")
      .type("form")
      .send({ username: config.username, password: config.password, next: "/" });

    expect(login.status).toBe(303);
    expect(login.headers["set-cookie"][0]).toContain("HttpOnly");
    expect(login.headers["set-cookie"][0]).toContain("Secure");

    const response = await request(app).get("/").set("Cookie", login.headers["set-cookie"]);
    expect(response.status).toBe(200);
    expect(response.text).toBe("protected");
  });

  it("rejects an invalid login", async () => {
    const response = await request(testApp())
      .post("/login")
      .type("form")
      .send({ username: config.username, password: "wrong", next: "/" });
    expect(response.status).toBe(401);
    expect(response.text).toContain("Username atau password salah");
  });

  it("accepts HTTP Basic credentials for VLC", async () => {
    const response = await request(testApp()).get("/livestream/output.m3u8").auth(config.username, config.password);
    expect(response.status).toBe(200);
    expect(response.text).toBe("manifest");
  });

  it("rejects partial or weak authentication configuration", () => {
    expect(() => validateWebAuthConfig({ ...config, password: "" })).toThrow(/must all be configured/);
    expect(() => validateWebAuthConfig({ ...config, sessionSecret: "short" })).toThrow(/at least 32/);
    expect(() => validateWebAuthConfig({ ...config, sessionTtlSeconds: 0 })).toThrow(/at least 60/);
  });
});
