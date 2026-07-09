# Bajag Theater

A self-hosted service that watches an [IDN Live](https://www.idn.app) channel (built for
JKT48 theater / member streams), records it to disk while it is live, and re-streams it
through a small web player. It also lists past recordings ("replays") and can show the
JKT48 theater schedule.

Under the hood it is an Express + TypeScript app that:

- Polls IDN Live for a live playback URL (by username **or** by a direct live URL).
- Records the live stream to `video/<date>.ts` using [Streamlink](https://streamlink.github.io/).
- Proxies and rewrites the HLS manifest so the browser player can play it back
  (`/livestream/output.m3u8`).
- Serves saved recordings with HTTP range requests at `/replay` and `/watch`.

> **Note:** IDN Gold / paid streams require you to supply the cookies of a logged-in IDN
> account that owns the subscription. See [Cookies](#cookies).

## Quick start

### Option 1 — Docker (recommended)

```bash
cp .env.example .env      # then edit values as needed
docker build -t theater .
docker run --name theater-container \
  -v "${PWD}/cookies:/app/cookies" \
  -v "${PWD}/video:/app/video" \
  -v "${PWD}/replay:/app/replay" \
  --env-file .env \
  -p 6969:6969 \
  theater
```

Or with Compose (note: `docker-compose.yml` requests an **NVIDIA GPU** for hardware
transcoding — remove the `deploy.resources` block if you do not have one):

```bash
docker compose up --build
```

Then open <http://localhost:6969>.

### Option 2 — Run locally

Requires **Node.js 22+**, [pnpm](https://pnpm.io/) 8, and the following on your `PATH`:
`streamlink`, `ffmpeg`, and (optionally) `yt-dlp`.

```bash
pnpm install
cp .env.example .env
pnpm dev        # watch mode with pretty logs
# or
pnpm build && pnpm start
```

## Configuration

All configuration is via environment variables (see `.env.example`). The most important ones:

| Variable       | Default                                    | Description                                                                 |
| -------------- | ------------------------------------------ | --------------------------------------------------------------------------- |
| `PORT`         | `6969`                                     | Port the server listens on.                                                 |
| `HOST`         | `localhost`                                | Hostname used in logs.                                                       |
| `CORS_ORIGIN`  | `http://localhost:6969`                    | Allowed CORS origin.                                                         |
| `IDN_USERNAME` | `jkt48-official`                           | IDN channel username to watch (used when no direct live URL is set).        |
| `IDN_LIVE_URL` | *(empty)*                                  | Optional direct `https://www.idn.app/{user}/live/{slug}` URL to record.     |
| `COOKIES`      | `cookies/cookies`                          | Path to the cookies file for authenticated (Gold) streams.                  |
| `PROXY_URL`    | `http://localhost:6969/livestream/proxy`   | Public base URL of this server's HLS proxy (must be reachable by players).  |
| `REPLAY_DIR`   | `${PWD}/replay`                            | Where recordings are stored / served from.                                  |
| `HW_ACCEL`     | `VAAPI`                                     | Hardware transcode backend (`VAAPI` or `NVENC`).                            |
| `FFMPEG_PATH`  | `/usr/bin/ffmpeg`                          | Path to the ffmpeg binary.                                                   |

`IDN_USERNAME`, `IDN_LIVE_URL`, and the cookies can also be changed at runtime from the
web UI at `/` — those overrides are persisted to `runtime-config.json` next to the cookies
file and take precedence over the environment defaults.

## Cookies

For Gold / subscriber-only streams, export the cookies of a logged-in IDN account that
holds the subscription. Both formats are accepted:

- A **Netscape cookies.txt** file (e.g. from a browser extension), or
- A raw **`Cookie:` header** string.

Point `COOKIES` at that file, or paste the contents into the **Cookies** box in the web UI
and click **Save Cookies**.

## HTTP endpoints

| Method   | Path                      | Purpose                                                        |
| -------- | ------------------------- | ------------------------------------------------------------- |
| GET      | `/`                       | Web player + settings UI.                                      |
| GET      | `/health-check`           | Liveness probe.                                                |
| GET      | `/livestream/output.m3u8` | Proxied, browser-playable HLS manifest of the current stream. |
| GET      | `/livestream/proxy/*`     | Internal HLS segment/manifest proxy (see security note below).|
| GET/POST | `/livestream/settings`    | Read / update the IDN URL and username.                       |
| POST     | `/livestream/cookies`     | Save the cookies used for authenticated streams.              |
| POST     | `/livestream/refresh`     | Drop the current stream and re-fetch a fresh URL.             |
| GET      | `/replay`                 | List recordings (optional `?date=` filter).                   |
| GET      | `/replay/play/*`          | Stream a recording (HTTP range requests).                     |
| GET      | `/watch/*`                | HTML player page for a recording.                             |
| GET      | `/schedule`               | JKT48 theater schedule (scraped from jkt48.com).              |

## Security notes

- The `/livestream/proxy/*` endpoint only proxies public `http(s)` targets; requests to
  loopback, link-local, and private network addresses (including the cloud metadata
  endpoint `169.254.169.254`) are refused so it cannot be used as an SSRF relay.
- The `/replay` file endpoints confine every path to the `replay/` directory, so they
  cannot be used to read arbitrary files on the host.
- Keep the service behind a trusted reverse proxy / on a private network — it exposes your
  IDN account's stream and has no authentication of its own.

## Development

```bash
pnpm dev          # run in watch mode
pnpm test         # run the vitest suite
pnpm lint         # biome check
pnpm lint:fix     # biome check --fix
pnpm build        # bundle with tsup
```

## License

MIT
