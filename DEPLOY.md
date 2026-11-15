# Deploying Shed

Target: `https://shed.example.com` on server (`/opt/stacks/shed`, docker compose), signing in with Pocket ID (`https://auth.example.com`),
replacing Forgejo at `git.example.com` once it's been used for a while. Nothing here has been done yet; each step needs the owner's OK
because it touches outward-facing systems.

## 1. Sign-in (done)

Pocket ID already has an OIDC client called **Shed** with callback URLs `https://shed.example.com/auth/callback` (and
`http://localhost:5173/auth/callback` for local testing). Its client ID and secret are in the dev machine's `.env`
(`SHED_OIDC_CLIENT_ID`, `SHED_OIDC_CLIENT_SECRET`). Pocket ID gives client secrets an expiry date: check it on the client's page.

## 2. Check out and configure

```sh
ssh server
sudo mkdir -p /opt/stacks/shed && sudo chown $USER /opt/stacks/shed
git clone -b shed https://git.example.com/ada/forge.git /opt/stacks/shed   # or rsync the checkout
cd /opt/stacks/shed
cp .env.example .env
```

Edit `.env`:

```sh
SHED_OIDC_ISSUER=https://auth.example.com
SHED_OIDC_CLIENT_ID=<from step 1>
SHED_OIDC_CLIENT_SECRET=<from step 1>
SHED_ALLOWED_USERS=user:ada
# 32+ random bytes. Never change it, never lose it: it encrypts CI secrets and T3 host tokens.
FORGE_SECRET=<head -c 32 /dev/urandom | base64>
# A fixed runner registration token (or make one in Settings later).
SHED_RUNNER_TOKEN=<head -c 24 /dev/urandom | base64 | tr -d '/+='>
# How SSH clone URLs look from outside (server's port 2222 is Forgejo's, so Shed's SSH is on 2223).
SHED_SSH_URL=ssh://git@server:2223
# So agents can commit.
GIT_AUTHOR_NAME=shed agent
GIT_AUTHOR_EMAIL=<an address, or a noreply>
GIT_COMMITTER_NAME=shed agent
GIT_COMMITTER_EMAIL=<same>
```

Optionally `SHED_SMTP_URL=smtps://user:pass@mail.example.com:465` and `SHED_MAIL_FROM` for notification emails.

Back up `FORGE_SECRET` outside the server (password manager).

## 3. Build and start

```sh
AGENTS=claude docker compose build      # claude | codex | both
docker compose up -d
docker compose ps                       # wait for "healthy" (GET /healthz)
docker compose logs -f shed
```

The image builds on server, so it matches its CPU (x86_64; it has only been built on arm64 so far). Web on host port **3080**,
git over SSH on **2223** (`SHED_HTTP_PORT` / `SHED_SSH_HOST_PORT` change them).

## 4. Public hostname

server publishes sites through Cloudflare Tunnel (`cloudflared` service). In the Cloudflare dashboard add a public hostname
`shed.example.com` → `http://localhost:3080`. Cloudflare passes `Host` and terminates TLS, which is what Shed expects
(cookies are `Secure`, the OAuth callback is built from the host).

- Cloudflare caps request bodies at 100 MB on the free plan, so a push bigger than that over HTTPS fails; push big repos over SSH
  (LAN or Tailscale, port 2223), or the first time with `shed import`.
- SSH doesn't go through the tunnel.
- The container registry is at the same host (`docker login shed.example.com`); image layers over 100 MB hit the same Cloudflare cap,
  so push big images over the LAN/Tailscale address on port 3080 (add it to the Docker daemon's insecure registries) or keep layers small.

Smoke test: open `https://shed.example.com`, sign in with Pocket ID, open a repo, a PR and its Files tab.

## 5. Move repos over from Forgejo

Make a Forgejo token that can read everything (Forgejo → Settings → Applications, scopes read:repository, read:user,
read:organization, read:issue), then:

```sh
docker compose exec -e FORGEJO_TOKEN=<token> shed shed import https://git.example.com            # every repo the token can see
docker compose exec -e FORGEJO_TOKEN=<token> shed shed import https://git.example.com ada/forge  # or just some
```

It copies owners (users, orgs and members), repos with all branches and tags, issues, PRs (with reviews and line comments),
labels, milestones, releases with their files, wikis and collaborators. It's safe to run again: it fetches new commits and only
adds issues and PRs it doesn't have. Your Forgejo account becomes yours in Shed when you first sign in (same email, else same
username).

Then point remotes at Shed: `git remote set-url origin https://shed.example.com/<owner>/<repo>.git` (password: a token from
Settings → Tokens) or `ssh://git@server:2223/<owner>/<repo>.git` (add a key in Settings → SSH keys).

## 6. CI

Shed speaks forgejo-runner's protocol, so the usual runner works and `.forgejo/workflows/*.yml` run unchanged:

```sh
forgejo-runner register --no-interactive --instance https://shed.example.com --token <SHED_RUNNER_TOKEN> --name server --labels docker:docker://node:20-bookworm,ubuntu-latest:docker://node:20-bookworm
forgejo-runner daemon
```

(Run it in its own compose stack with the Docker socket, as Forgejo's docs describe.) Actions like `actions/checkout@v4` come
from `https://data.forgejo.org` unless `SHED_ACTIONS_URL` says otherwise. Secrets and variables are per repo (API for now:
`PUT /api/v1/repos/<o>/<r>/actions/secrets/<NAME>`).

## 7. Agents (optional)

```sh
docker compose exec -it shed claude                      # then /login
docker compose exec -it shed codex login --device-auth   # if built with codex
# Let T3 clones push: a Shed token with push access.
docker compose exec shed sh -c 'echo https://ada:<token>@shed.example.com > ~/.t3/git-credentials'
```

## Updating, backups, rollback

- Update: `git pull && docker compose build && docker compose up -d`.
- Back up the `data` volume (`shed.db`, `repos/`, wikis, release files, CI logs and artifacts, `lfs/`, `packages/`, `avatars/`,
  `ssh/host_ed25519`) and `FORGE_SECRET`.
  For a consistent copy of the database: `docker compose exec shed bun -e "require('bun:sqlite').Database.open('/data/shed.db').run(\"vacuum into '/data/backup.db'\")"`.
- Rollback: check out the previous commit and rebuild. Migrations only add, but an older build refuses a database a newer one
  has migrated, so restore the matching backup to go back across a migration.

## Turning Forgejo off

Once everything has lived in Shed for a few weeks: re-run the import one last time, stop Forgejo's stack, and keep its volume for a while.
