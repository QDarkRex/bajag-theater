# CLAUDE.md

This project uses **`AGENTS.md`** as the shared context and collaboration protocol for all
agents and humans across every device. **Read `AGENTS.md` first**, then
`docs/KNOWN_ISSUES.md`, then the latest entries in `docs/WORKLOG.md`, before doing anything.

Key reminders (full detail in `AGENTS.md`):

- `git pull` before starting; commit + push after a meaningful change so other
  devices/agents stay in sync.
- After any real change: update `docs/WORKLOG.md` and `docs/KNOWN_ISSUES.md`.
- Verify with `npx tsc --noEmit` (0 errors) and `pnpm test` (green) before claiming done.
- Never commit secrets (cookies, tokens, `.env`).
- Deployment runbook is `docs/DEPLOYMENT.md`. Production is the Tailscale node
  `100.103.179.11` ("caddy"), deployed GPU-free via `docker run`.
