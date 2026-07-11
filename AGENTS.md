# AGENTS.md — shared workspace for humans & AI agents

This file is the **single entry point** for anyone working on this project: a human on
any device, or an AI agent (Claude Code, ChatGPT/Codex, Cursor, etc.). Its purpose is to
let work continue **seamlessly across devices and across agents without repeating past
mistakes**. Git is the sync layer — everything durable lives here in the repo.

> If you are an AI agent: read this file first, then `docs/KNOWN_ISSUES.md`, then the
> recent entries in `docs/WORKLOG.md`, before doing anything.

## What this project is

`bajag-theater` is an Express + TypeScript service that watches an **IDN Live** channel
(built for JKT48 theater / member streams), records it to disk with `streamlink` while it
is live, and re-streams it through a small web player. It also lists past recordings and
can show the JKT48 theater schedule. See `README.md` for the user-facing overview and
`docs/DEPLOYMENT.md` for how it runs in production.

- Language/stack: Node 22, TypeScript, Express, pnpm 8, Docker.
- External binaries at runtime: `streamlink`, `ffmpeg`, optional `yt-dlp`.
- Repo: `QDarkRex/bajag-theater` (public). Fork of `vader-pepe/bajag-theater`.

## The collaboration protocol (read this)

1. **Before starting:** `git pull` on `main`. Read `docs/KNOWN_ISSUES.md` and the latest
   `docs/WORKLOG.md` entries so you don't re-hit a solved problem.
2. **While working:**
   - Keep changes small and focused. Match the existing code style (Biome, 2-space, 120 col).
   - Verify before you claim done: `npx tsc --noEmit` (must be 0 errors) and `pnpm test`
     (must stay green). Add/adjust tests for behavior you change.
   - Never commit secrets: no cookies, tokens, `.env`, or account data. Those are
     `.gitignore`d for a reason.
3. **After a meaningful change:**
   - Append a dated entry to `docs/WORKLOG.md` (what you did, why, result).
   - Update `docs/KNOWN_ISSUES.md` (mark fixed, add new gotchas, record dead ends).
   - Commit with a clear message and **push to `main`** so other devices/agents get it.
4. **Don't repeat known-bad approaches.** `docs/KNOWN_ISSUES.md` has a "Dead ends" section —
   things already tried that don't work. Check it before proposing a fix.

## Where things live

| File | Purpose |
| --- | --- |
| `AGENTS.md` (this) | Entry point + collaboration rules for all agents/humans. |
| `CLAUDE.md` | Pointer so Claude Code loads this context automatically. |
| `README.md` | User-facing overview, config, endpoints. |
| `docs/DEPLOYMENT.md` | Production runbook: VPS, Docker commands, rebuild/rollback. |
| `docs/KNOWN_ISSUES.md` | Living list of bugs, gotchas, workarounds, and dead ends. |
| `docs/WORKLOG.md` | Dated journal of changes and decisions, newest first. |

## Verifying a change actually works

- **Code**: `npx tsc --noEmit` + `pnpm test`.
- **Runtime/deploy**: follow `docs/DEPLOYMENT.md`; watch `docker logs -f theater-container`
  and confirm the live is found + recording grows in `video/`.
- Report outcomes honestly in the WORKLOG — if something is unverified or partially working
  (e.g. the web player), say so, so the next agent doesn't assume it's done.

## Quick facts an agent usually needs

- Runs on port **6969**, **no built-in auth** → keep it behind Tailscale, never public.
- Production host is the Tailscale node **`100.103.179.11`** ("caddy"), Docker-based.
- The bundled `docker-compose.yml` **requires an NVIDIA GPU**; the VPS has none, so we
  deploy with a GPU-free `docker run` (details in `docs/DEPLOYMENT.md`).
- IDN auth (cookies) is the trickiest part — see `docs/KNOWN_ISSUES.md` → "IDN cookies".
