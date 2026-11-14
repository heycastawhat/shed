# Deploying forge

Target: `https://forge.example.com` on server (`/opt/stacks/forge`, docker compose), backed by `https://git.example.com` (Forgejo 15.0.5).
Nothing here has been done yet; each step needs the owner's OK because it touches outward-facing systems.

## 1. Register the OAuth app on Forgejo

On git.example.com: **Settings → Applications → OAuth2 applications → Create**.

- Name: `forge`
- Redirect URI: `https://forge.example.com/auth/callback` (exactly this; no trailing slash)
- Confidential client: **on**

Keep the client ID and secret for step 2. Forgejo refresh tokens are single-use and shared per user per app, so don't reuse this app for anything else.

## 2. Check out and configure

```sh
ssh server
sudo mkdir -p /opt/stacks/forge && sudo chown $USER /opt/stacks/forge
git clone https://git.example.com/ada/forge.git /opt/stacks/forge   # or rsync the repo
cd /opt/stacks/forge
cp .env.example .env
```

Edit `.env`:

```sh
FORGEJO_URL=https://git.example.com
FORGEJO_CLIENT_ID=<from step 1>
FORGEJO_CLIENT_SECRET=<from step 1>
# 32+ random bytes. Never change it and never lose it: it encrypts every session's Forgejo grant and every agent key.
FORGE_SECRET=<output of: head -c 32 /dev/urandom | base64>
# So agents can commit.
GIT_AUTHOR_NAME=forge agent
GIT_AUTHOR_EMAIL=<an address Forgejo knows, or a noreply>
GIT_COMMITTER_NAME=forge agent
GIT_COMMITTER_EMAIL=<same>
# Leave T3_URL / T3_TOKEN empty: the container sets them for its bundled T3 Code.
```

Back up `FORGE_SECRET` somewhere outside the server (password manager).

## 3. Build and start

```sh
AGENTS=claude docker compose build      # claude | codex | both
docker compose up -d
docker compose ps                       # wait for "healthy" (GET /healthz)
docker compose logs -f forge
```

The image builds on server itself, so it matches server's CPU architecture. It was build-tested with podman on arm64.
forge listens on host port **3080**.

## 4. Reverse proxy

Point `forge.example.com` at `http://<server>:3080` with TLS terminated at the proxy. The proxy must pass the original `Host` header
(the OAuth redirect URI is built from it) and should set `X-Forwarded-For`. Allow large-ish request bodies (diff comments, file edits): 10 MB is plenty.

forge assumes it is served over **https** (session cookies are `Secure`). Only if it's ever served over plain http, add `PROTOCOL_HEADER=x-forwarded-proto` to `.env` and have the proxy set that header.

Smoke test: open `https://forge.example.com`, log in (you'll see Forgejo's consent screen once), open a repo, a PR and its Files tab.

## 5. Agents (optional)

```sh
docker compose exec -it forge claude                      # then /login
docker compose exec -it forge codex login --device-auth   # if built with codex
# Let T3 clones push: a Forgejo token with write:repository.
docker compose exec forge sh -c 'echo https://ada:<token>@git.example.com > ~/.t3/git-credentials'
```

Then in forge: Settings → Agents shows the bundled T3 as a host. Repos need a T3 project with the same name ("Clone into T3 Code" on a repo's Agents tab does it).
"Open in T3 Code" links point at `127.0.0.1:3773` inside the container and won't open from a browser unless T3 is published (`T3_HOST=0.0.0.0` plus a port mapping, behind auth).

## Updating

```sh
cd /opt/stacks/forge && git pull && docker compose build && docker compose up -d
```

Sessions and keys survive as long as the `data` volume and `FORGE_SECRET` do.

## Backups

Back up the `data` volume (`forge.json`: sessions, agent keys, approvals, hosts) and `FORGE_SECRET`. The `t3`, `projects`, `claude` and `codex` volumes
hold agent state and clones; losing them means logging the agents in again and re-cloning.

## Rollback

`git checkout <previous commit> && docker compose build && docker compose up -d`. `forge.json` has no migrations, so older builds read it as-is.

## Forgejo 15 notes

Tested against a local Forgejo 15.0.5 (`.agents/scripts/seed.sh`, `writes.sh`, `crawl.e2e.ts`): every page and write path works. Differences from 17:

- No `POST /actions/runs/{id}/rerun`: "Re-run failed checks" reports that this Forgejo can't re-run them. Re-run from Forgejo's own run page.
- No job logs in the API (on any version): the Actions tab and the merge card's checks link to Forgejo's run page for logs.
- The markdown API doesn't expand `[[Wiki Links]]`; forge's wiki rewrites them before rendering.
