# Known issues, gotchas & dead ends

Living list so no device/agent re-hits a solved problem. Update the status when things
change. Newest/most important first.

---

## Open

### Gold runtime verification needed after APT resolver fix
- **2026-07-12 finding:** IDN Gold uses an Amazon IVS private channel. The `playback_url`
  embedded in `__NEXT_DATA__` is the bare IVS channel URL and returns 403 without a playback
  JWT. Browser `/v1/playlist/...` URLs are session-bound and also return 403 when copied to
  Streamlink/FFmpeg; copying them is a dead end.
- **Implemented:** Gold streams now call IDN's authenticated
  `POST /api/v1/apt?streamer_uuid=...&slug=...` endpoint and decrypt its `galaktus` response
  using the same AES-256-CBC flow as IDN's public frontend bundle. Unit tests cover the APT
  request, decryption, and trusted IVS URL validation.
- **Still needed:** verify with a newly exported, still-valid paid session during the next
  live Gold show. The cookies available after the 2026-07-12 debugging session returned 401
  from APT even though their JWT `exp` had not passed, consistent with Cognito session
  invalidation/rotation.

### IDN cookies rotate constantly (auth is the hard part)
- **Symptom:** Gold streams need the account cookie, but exported cookies go stale fast; a
  friend observed the token rotating roughly every ~2 seconds while a browser session is
  active.
- **Cause:** IDN auth is **AWS Cognito OAuth**. Access tokens are short-lived (~1h) and the
  web app silently refreshes/rotates them, tied to the active browser session. A static
  cookie export is a frozen snapshot and falls behind.
- **Nuance:** From the VLC test, the IDN **playback URL appears to be a signed URL** (VLC
  played `/livestream/raw` with no cookies). So cookies are needed mainly at **resolve time**
  (to unlock the Gold playback URL for a purchased account), not for every segment.
- **Manual workaround (ok for a single show):** export cookies **fresh right before the
  show**, Save in the UI, then **close/logout that browser** and don't use the account
  elsewhere at the same time (one session = one owner, or they invalidate each other).
- **Export gotcha found 2026-07-12:** the cookies.txt exporter split the JSON-valued
  `toggleState` cookie across malformed Netscape rows with an empty cookie name. This made
  Streamlink fail on `--http-cookie =...`. The parser now rejects invalid/empty cookie names;
  the important `id_token`, `access_token`, and `session-id` rows remain intact.
- **Robust fix (not yet built):** auto-refresh. Reuse `idn_auth.py` from the sibling project
  `idn-live-logger` (keeps a persistent logged-in browser, grabs a fresh token/cookies
  headless) on a schedule to overwrite `~/bajag-theater/cookies/cookies` every few minutes.
  The app re-reads the cookie file each 15s cycle, so it always has a live cookie. Requires a
  dedicated single-owner IDN account.

### Browser web player doesn't play
- **Symptom:** `/livestream/raw` and `/livestream/output.m3u8` work in VLC, but the built-in
  web player at `/` does not play.
- **Status:** Deprioritized (VLC is the working path). Likely a front-end issue in
  `public/view.html` / video.js or CSP, not the stream itself (the manifest/segments are
  fine — VLC proves it). Not yet diagnosed.

---

## Resolved

### `docker compose up` fails: `could not select device driver "nvidia"`
- **Cause:** `docker-compose.yml` reserves an NVIDIA GPU; the VPS has none.
- **Fix:** Deploy with a GPU-free `docker run` (see `docs/DEPLOYMENT.md`). The compose file
  is left as-is because other environments may have a GPU.

### Port 6969 "already allocated" on deploy
- **Cause:** an older container (`bajag-theater-test`) was still publishing 6969.
- **Fix:** stop/replace the old container; use `--volumes-from` to carry state to the new
  one. Two containers with `--restart always` on the same port will fight after a daemon
  restart — keep only one.

### Path traversal in `/replay/*` (LFI)
- Fixed: paths are confined to the `replay/` dir. Missing files now return 404 (was a
  crash-500). Commit `f5bc431`.

### SSRF / open proxy in `/livestream/proxy/*`
- Fixed: proxy refuses loopback/private/link-local targets; cookies are attached **only** to
  IDN hosts or the current stream host (so a paid session can't be leaked to an arbitrary
  proxied URL). Commits `f5bc431`, `77795b0`.

### Gold `/live/preview/{slug}` URLs didn't resolve
- Fixed: preview URLs are unwrapped to the canonical `/{user}/live/{slug}` page. Using the
  **IDN Username** instead of a URL is still the most reliable path. Commit `77795b0`.

---

## Dead ends (tried, doesn't work — don't retry)

- **Deploying via `docker compose up` on the VPS** — fails on the GPU reservation. Use
  `docker run`.
- **Relying on a one-time static cookie export for long/continuous recording** — dies mid-way
  due to IDN token rotation. Needs the auto-refresh approach instead.
- **Copying Amazon IVS `/v1/playlist/` or `/v1/segment/` URLs from DevTools** — these are
  session-bound URLs created after IVS accepts the playback JWT. They return 403 in another
  client, even on the same Windows device with the same User-Agent. Acquire a fresh JWT from
  IDN's APT endpoint and use the original channel playback URL instead.
