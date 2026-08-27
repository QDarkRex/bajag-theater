import request from "supertest";
import { describe, expect, it } from "vitest";

import { deriveLivestreamStatus } from "@/common/utils/streamStatus";
import { app } from "@/server";

describe("livestream status", () => {
  it("reports an unconfigured service without exposing runtime details", () => {
    const result = deriveLivestreamStatus(false, false, "2026-08-27T00:00:00.000Z");

    expect(result).toEqual({
      state: "unconfigured",
      recording: false,
      checkedAt: "2026-08-27T00:00:00.000Z",
      detail: "IDN Live belum dikonfigurasi.",
    });
  });

  it("reports live only while the recorder is active", () => {
    const result = deriveLivestreamStatus(true, true, "2026-08-27T00:00:00.000Z");

    expect(result.state).toBe("live");
    expect(result.recording).toBe(true);
    expect(result.detail).toContain("perekaman");
  });

  it("reports offline when configured but not recording", () => {
    const result = deriveLivestreamStatus(true, false, "2026-08-27T00:00:00.000Z");

    expect(result.state).toBe("offline");
    expect(result.recording).toBe(false);
  });

  it("serves the status endpoint without exposing a playback URL", async () => {
    const response = await request(app).get("/livestream/status");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(["offline", "unconfigured"]).toContain(response.body.responseObject.state);
    expect(response.body.responseObject).not.toHaveProperty("playbackUrl");
  });
});
