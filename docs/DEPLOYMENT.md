# Deployment runbook

Production runs in Docker on the replacement Tailscale node **`100.84.221.74`** (host
`caddy-1`). Access is Tailscale-only. The previous `100.103.179.11` VPS was deleted.

> ⚠️ The bundled `docker-compose.yml` requests an **NVIDIA GPU** (`deploy.resources`). This
> VPS has **no GPU**, so `docker compose up` fails with
> `could not select device driver "nvidia"`. We deploy with a **GPU-free `docker run`**
> instead. The live-recording path uses `streamlink` (no GPU transcode), so nothing is lost.

## First-time / clean deploy

```bash
cd ~/bajag-theater
cp .env.example .env        # then edit if needed (default PORT=6969)
docker build -t theater:latest .

docker run -d --name theater-container --restart always \
  --env-file .env \
  -p 100.84.221.74:6969:6969 \
  -v "$PWD/cookies:/app/cookies" \
  -v "$PWD/video:/app/video" \
  -v "$PWD/replay:/app/replay" \
  theater:latest

docker logs -f theater-container
```

- `-p 100.84.221.74:6969:6969` binds the port to the **Tailscale interface only**, so the
  service is not exposed to the public internet (it has no auth). Access it from any of your
  Tailscale devices at `http://100.84.221.74:6969`.

## Redeploy after pulling new code

Rebuild and swap the container while **inheriting the existing cookies/config/recordings**
(`--volumes-from`) so you don't have to reconfigure:

```bash
cd ~/bajag-theater
git pull
docker build -t theater:latest .

docker rename theater-container theater-old
docker stop theater-old
docker run -d --name theater-container --restart always \
  --env-file .env \
  -p 100.84.221.74:6969:6969 \
  --volumes-from theater-old \
  theater:latest

docker logs -f theater-container
# once healthy:
docker rm theater-old
```

## Rollback

```bash
docker rm -f theater-container
docker start theater-old      # or the previous container name
```

## State & volumes (important)

- **Persisted (survive rebuilds via the volume mounts / `--volumes-from`):**
  `/app/cookies` (cookie file + `runtime-config.json`), `/app/video` (recordings),
  `/app/replay`.
- **Ephemeral (recreated per container, NOT volumes):** `/app/url` and `/app/isDownloading`
  — the current-stream state files. A fresh container starts with these empty, which is
  fine (it re-resolves the stream on boot).

## Verifying a running deploy

```bash
docker ps                                   # theater-container should be Up
docker exec theater-container sh -c 'cat url; echo; ls -lh video/'   # resolved URL + recording size
docker logs --tail 100 theater-container 2>&1 | grep -Ei "found|progress|error|attempt"
```

Healthy signs in the log: `Server (production) running on port ...`, then either
`IDN Live stream found ... / Starting stream download` (recording), or
`No playback URL found` when the target is not live (normal standby).

## Playback

- **VLC (works today):** open network stream
  `http://100.84.221.74:6969/livestream/output.m3u8` (proxied, attaches cookies — best for
  Gold) or `http://100.84.221.74:6969/livestream/raw` (redirect to the raw IDN URL; fine
  for free / signed-URL streams).
- **Browser web player:** currently NOT working — see `docs/KNOWN_ISSUES.md`.

## Configuration

Runtime settings (IDN username / live URL / cookies) can be set from the web UI at `/`, or
via env in `.env`. See `README.md` for the full env-var table. Cookies are the tricky part —
see `docs/KNOWN_ISSUES.md` → "IDN cookies".
