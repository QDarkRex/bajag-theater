# Work log

Dated journal of changes and decisions, **newest first**. Append a short entry after any
meaningful change so the next device/agent has continuity. Suggested format:

```
## YYYY-MM-DD — <short title>
- Who: <human / which AI agent>
- Did: <what changed and why>
- Result: <verified? tests/tsc status? deployed?>
- Next: <follow-ups, if any>
```

---

## 2026-07-18 — Fix public HTTPS HLS playback
- Who: Codex with QDarkRex
- Did: Reproduced the public browser failure during the live `Pajama Drive` show on `x99`.
  The public master manifest returned HTTP 200 but rewrote every child resource to the
  private `http://192.168.60.10:6969` proxy. Changed manifest rewriting to same-origin
  relative proxy URLs and corrected the UI's VLC link to use public/LAN origin plus
  `/livestream/output.m3u8`.
- Result: Unit coverage added for relative playlist, segment, and URI-attribute rewrites.
  Deployment/runtime verification is recorded after the live rebuild below.
- Next: Confirm public VLC and browser playback after deploying to `x99`; recording recovery
  should continue in a new `.ts` part after the container restart.

## 2026-07-12 — Implement IDN Gold Amazon IVS playback authorization
- Who: Codex with QDarkRex
- Did: Re-deployed the service on replacement VPS/Tailscale node `100.84.221.74`; reproduced
  Gold failures end-to-end; traced IDN's current frontend bundle; found the authenticated APT
  endpoint and AES-256-CBC `galaktus` decryption flow; implemented Gold playback authorization;
  hardened Netscape cookie parsing against empty-name rows from the exporter.
- Result: TypeScript clean, Biome clean, 25/25 tests pass. Free-stream resolution remains
  unchanged. Production APT probe with the post-debug cookie snapshot returned 401, so a real
  recording with a newly exported paid session is not yet verified. Browser player status was
  not re-evaluated; direct copied IVS playlist URLs returned 403 by design (session protection).
- Next: Deploy this commit, export cookies fresh during the next purchased Gold live, and
  confirm `Starting stream download` plus file growth twice. If APT still returns 401, capture
  only the APT request-header names and status from DevTools and compare session selection.

## 2026-07-11 — Set up shared multi-agent workspace
- Who: Claude (Claude Code) with QDarkRex
- Did: Added `AGENTS.md`, `CLAUDE.md`, and `docs/` (`DEPLOYMENT.md`, `KNOWN_ISSUES.md`, this
  `WORKLOG.md`) so multiple devices and multiple AI agents can collaborate through Git
  without losing context or repeating mistakes.
- Result: Docs only; no code change. Committed to `main`.
- Next: Each agent should follow the protocol in `AGENTS.md` (read → work → log → push).

## 2026-07-11 — Gold preview URLs + cookie-authed HLS proxy
- Who: Claude (Claude Code)
- Did: Unwrap `/{user}/live/preview/{slug}` paywall URLs to the real live page; attach the
  account cookie when proxying HLS but only to IDN hosts / the current stream host (avoid
  leaking a paid session to an arbitrary proxied URL).
- Result: `tsc` clean, 22/22 tests pass. Commit `77795b0`. Deployed to the VPS and
  redeployed via `--volumes-from`.
- Next: Verify a real Gold show end-to-end once cookies are sorted (see KNOWN_ISSUES → IDN
  cookies). Web player still not playing.

## 2026-07-11 — Security & docs hardening
- Who: Claude (Claude Code)
- Did: Fixed path traversal in `/replay/*`, SSRF in `/livestream/proxy/*`, missing-file 500→
  404, a pino logging misuse, two pre-existing type errors; rewrote the README to document
  the actual IDN re-streaming service.
- Result: `tsc` clean (was 5 baseline errors), 21/21 tests pass (added 2 security tests).
  Commit `f5bc431`. Deployed to VPS on port 6969 (Tailscale-bound), GPU-free `docker run`.
- Next: Deploy verified; stream plays in VLC via `/livestream/raw`.

## Deployment snapshot (as of 2026-07-11)
- Host: Tailscale node `100.103.179.11` ("caddy"), container `theater-container`, image
  `theater:latest`, port 6969 bound to the Tailscale interface.
- Playback: VLC works (`/livestream/output.m3u8` preferred for Gold, `/livestream/raw` for
  free/signed). Web player: not working (deprioritized).
