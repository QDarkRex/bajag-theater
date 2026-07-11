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
