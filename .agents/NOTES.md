# Shed — notes for agents

Shed is a self-hosted git host for one person (the owner) and their coding agents: SvelteKit app + its own backend (bare git repos on disk,
SQLite for everything else). It began as "forge", a UI over Forgejo's API; on 2026-11-15 the owner decided to own the backend instead.
`PLAN.md` is the design (and a "Later" list, starting with the UI redesign). The git branch is `shed`; `main` is the old Forgejo UI.

## Decisions (don't re-litigate)

- **Own backend, not a Forgejo fork or frontend.** Forgejo is only an import source now (`bin/shed-admin.ts import`).
- **A Forgejo-compatible REST API is the backbone** (`src/lib/server/api/`). Pages call it in-process through `forgejo.ts`
  (`api`/`apiPage`/`request` with `locals.token`, an internal token for the signed-in person), so the UI written against Forgejo kept working.
  Over HTTP it's `/api/v1` with a Shed token. Where Forgejo's API fell short, Shed adds endpoints (revisions, PR comments, resolve, reviewers, …).
- Stack: **Bun + SvelteKit 3 + Svelte 5 runes + TypeScript**, Shiki, no CSS framework. git is the `git` binary, never libgit2.
- Sign-in is any OIDC provider (the owner uses Pocket ID) with an allowlist; no passwords.
- CI speaks **forgejo-runner's protocol**, so the stock runner and `.forgejo/workflows` work unchanged.
- Theme: purple accent (`--accent`), primary actions and the Open badge use it; green/red only for diff lines and closed state.
- UI: Sink's visual language (Material 3 from a seed, Roboto Flex, tinted shell, pills, grouped settings cards); Classic, Tabs and Split layouts. Code views stay dense.

## Layout

Backend (`src/lib/server/`):
- `db.ts`: SQLite, append-only migrations (`user_version`; refuses a newer database). `shed.ts`: the process's db, data dir, OIDC provider,
  current origin, and the SSH server start. `SHED_DATA` holds `shed.db`, `repos/<id>.git` (+ `<id>.wiki.git`), `attachments/`, `actions/logs/`, `ssh/`, `trash/`.
- `repos.ts` (create/delete, names, stored by id), `git.ts` (spawn with ignored user/system config), `browse.ts` (read: refs, tree, blobs, log,
  blame, diffs), `write.ts` (`commitFiles`: commits without a checkout, compare-and-swap ref update), `files.ts`/`edit.ts`/`fork.ts`.
- `accounts.ts`: users (first sign-in is admin; imported accounts are claimed by email, else username), sessions, personal tokens (`shed_…`),
  CI task tokens (`shedt_…`, valid while the task runs). `access.ts`: owner/site admin/org owner → admin, org member → write, collaborators,
  public read; tokens are capped by scopes and repo list. `oidc.ts`: code flow + PKCE.
- `githttp.ts`: smart HTTP (v0/v2); `ssh.ts`: own SSH server (ssh2). Both run receive-pack with `pushcheck.ts`'s pre-receive hook (branch protection)
  and call `afterPush` (`push.ts`), whose listeners update PRs (revisions, merged-by-push), start CI, send webhooks and record activity.
- `api/`: `router.ts` (routes, most-literal match wins, `Paged` → `x-total-count`), `common.ts` (`repoOf(c, need)`), `shapes.ts` (Forgejo JSON),
  `repos.ts`, `issues.ts`, `pulls.ts` (merge styles, reviews, auto-merge, revisions), `statuses.ts`, `protect.ts`, `notify.ts`, `releases.ts`,
  `actions.ts`, `hooks.ts`, `keys.ts`, `code.ts`, `search.ts`.
- `actions/`: `proto*.ts` (runner.v1 protobuf via protobufjs), `rpc.ts` (Connect RPC at `/api/actions/…`), `workflows.ts` (triggers, matrix,
  single-job payloads like Forgejo's jobparser), `runs.ts` (runs/jobs state machine, statuses, PR events, cancel/rerun).
- `lfs.ts` (Git LFS batch/basic transfer + locks at `<repo>.git/info/lfs`), `registry.ts` (OCI container registry at `/v2/`, generic packages
  at `/api/packages/<owner>/generic/…`), `mirror.ts` (copy by URL, pull mirrors synced by the scheduler), `projects.ts` (boards),
  `orgs.ts`/`avatars.ts`, `mail.ts` (notification email when `SHED_SMTP_URL` is set). `actions/artifacts.ts`: upload/download-artifact v3 (pipelines
  API at `/api/actions_pipeline/`) and v4 (Twirp at `/twirp/…` + signed blob URLs; the runtime token is a signed JWT carrying run and job).
  The scheduler (`startScheduler` in `actions/runs.ts`, started from `shed.ts`) ticks each minute: `on: schedule` crons, due mirrors, expired artifacts.
- `markdown.ts`: markdown-it with raw HTML escaped (safe for `{@html}`), repo-relative links/images, heading anchors, task lists.
- `importer.ts` + `bin/shed-admin.ts import <forgejo url>`: users/orgs, repos (all refs), issues, PRs, reviews, line comments, labels, milestones,
  releases with files, wikis, collaborators. Re-runnable.
- `cli/shed.ts`: the client CLI, like `gh` (auth + git credential helper, repo, pr, issue, run, api), only over `/api/v1` with a token;
  `bun build --compile cli/shed.ts --outfile shed`. The server's own command is `shed-admin` (`bin/shed-admin.ts`).
- The agent features from forge are unchanged: T3 Code driving (`t3.ts`, `task.ts`, agents hub), agent keys + MCP (`agents.ts`, `tools.ts`,
  `/mcp`), approvals, repo rules, `@agent` mentions. They keep their state in `forge.json` (`store.ts`, encrypted with `FORGE_SECRET`).

UI: `src/routes` mirrors Forgejo's URLs (`/[owner]/[repo]/{tree,blob,raw,blame}/[ref]/[...path]`, `commits/[ref]/[...path]`, `commit/[sha]`,
`compare/base...head`, `pulls/[index]/{files,commits}`, `issues`, `actions/runs/[run]`, `settings/*`, `labels`, `milestones`, `wiki`, `releases`).
Top level: `/`, `/changes`, `/repos`, `/new`, `/explore`, `/search`, `/notifications`, `/agents`, `/settings/*`, `/admin`; `src/lib/reserved.ts`
lists these, and logins can't take them. Shell, palette, themes, mobile rules, DiffView and the PR timeline are as described in the older
sections of git history (`git show 52e2659:.agents/NOTES.md`).

## Running locally

Dev machine: aarch64 Fedora Aurora; bun in `~/.bun/bin` (`export PATH=$HOME/.bun/bin:$PATH`); Chromium for tests is Playwright's.
- `.env` has the Pocket ID client (`SHED_OIDC_*`, issuer `https://auth.example.com`), `SHED_ALLOWED_USERS=user:ada`, `SHED_DATA=data`,
  `SHED_SSH_PORT=2223` (2222 is the old local Forgejo's), `FORGE_SECRET`.
- `bun run dev --port 5173 --strictPort`. Don't `pkill -f` patterns that match your own shell (it kills it); find the pid with `ss -ltnp`.
- Signing in without the browser round trip: `bun .agents/scripts/shed-session.ts [login]` prints a `shed_session` cookie; `shed-token.ts [login]`
  prints an API token. A real sign-in: Pocket ID is passkey-only, so headless tests use a one-time link,
  `ssh ada@192.0.2.245 'docker exec pocket-id /app/pocket-id one-time-access-token ada'` (don't print the code; each use leaves an admin
  session on Pocket ID), see `.agents/tmp/shed-login.ts`.
- Test data: `bin/shed-admin.ts import http://localhost:3000` from the old local Forgejo (`dev/forgejo`, seeded by `.agents/scripts/seed.sh`) into
  `ada/sample` (PRs, issues, labels, milestones, release, wiki) and `kiwi/website`. Wipe `data/shed.db*`, `data/repos` etc. to start over.
- CI: `dev/runner/forgejo-runner` (13.2.1, arm64) registered as `dev` with label `host`; start it with
  `cd dev/runner && PATH=$PWD/bin:$HOME/.bun/bin:$PATH ./forgejo-runner daemon` (`bin/node` → bun, so JS actions run). Artifact actions on
  Forgejo-style setups: `https://code.forgejo.org/forgejo/upload-artifact@v4` (GitHub's v4 refuses non-GitHub hosts) or `actions/upload-artifact@v3`.
- `dev/lfs/git-lfs` (3.8.1) for LFS tests; podman for registry tests (`podman login --tls-verify=false localhost:5173`).
  Test scripts open many PRs and each runs `ci.yml` (a 20 s job), so a backlog builds; closing a PR cancels its runs.
- Checks: `bun run check` (0 errors/warnings) and `bun test src` (real git clients against in-process HTTP and SSH servers, a real-ish CI
  flow is tested by hand with the runner). End to end against the dev server:
  `FJ=localhost:5173 JP=<ada token> RP=<reviewer token> JAR=shed bash .agents/scripts/writes.sh` (needs `.agents/tmp/shed.jar` with a
  `shed_session` line) and `JT=… RT=… bash .agents/scripts/shed-merges.sh` (merge styles, conflicts, auto-merge, revisions, resolve, protection)
  and `JT=… bash .agents/scripts/shed-mcp.sh` (agent keys and every MCP tool). Tests that load env-reading modules mock it with `test-env.ts`.
- Pages and screenshots: `cd .agents/tmp && bun shed-pages.ts "$COOKIE" name=/path /path …` (status, console errors, overflow, `shot-name.png`).
- Commands that hit localhost need the sandbox off. `git` here has no identity: commit with `-c user.name=the owner -c user.email=owner@example.com`.

## Deploying

`DEPLOY.md` (server `/opt/stacks/shed`, compose service `shed`, web 3080, SSH 2223, Cloudflare tunnel hostname `shed.example.com`).
Live since 2026-11-16 at https://shed.example.com. The code reaches server through the **public** GitHub repo `heycastawhat/shed`, which
holds a scrubbed copy published by `.agents/tmp/github/publish.sh` (never `git push` there). server's checkout uses `git@github.com:heycastawhat/shed.git`
with a read-only deploy key (`~/.ssh/shed_deploy` on server, set as the checkout's `core.sshCommand`). Redeploy: commit, run publish.sh, then on server
`cd /opt/stacks/shed && git fetch -q && git reset -q --hard origin/shed && docker compose build && docker compose up -d` (publish rewrites history,
so reset, not pull; `.env` is untracked). Ask the owner before touching server, Pocket ID or Cloudflare. Forgejo still runs; don't push there.
server: Fedora 44, x86_64, 15 GB RAM, ssh `ada@192.0.2.245` (key on this machine); sudo needs a password.

## Gotchas

- **SvelteKit 3:** env vars in `src/env.ts` (`defineEnvVars`) imported from `$app/env/private`; `#lib/...` imports need `.js`; `Handle` from
  `@sveltejs/kit/hooks`; `redirect()` off-origin needs `{ external }`. Bun types come from `src/bun.d.ts` (a `types` field in tsconfig hides Kit's).
- Modules imported by `bun test` must not import `$app/env/private` (only `shed.ts`, `actions/secrets.ts` and routes do).
- adapter-node limits bodies to 512 KB unless `BODY_SIZE_LIMIT` (the image sets Infinity); pushes and uploads need it.
- localhost cookies are shared across ports: cookie names are unique (`shed_session`, `shed_oidc`).
- `autofocus` doesn't work on inserted elements; use `{@attach (el) => el.focus()}`. Wait for `networkidle` before clicking in Playwright.
- House style: tabs, single quotes, no trailing commas, ~180 columns; no prettier config (a bare `bunx prettier` reformats wrongly).
- Icons are MingCute (`Icon.svelte`); the owner rejected Lucide. Selected rows are a flat tint, not an accent stripe. Don't name a class `.agent`.
- The user's shell defines `grep` as a function: use `command grep` in scripts.
- Dev server can serve stale CSS after edits; restart it. After adding a dependency, restart or SSR fails.

## Security

- Paths: refs from URLs go through `resolve()`; repo paths are by id; `commitFiles` refuses `..`/`.git` segments; the API router refuses `..`.
- Auth: cookie sessions (hashed), personal tokens (hashed, scoped, expiring), CI task tokens; the HTTP API ignores cookies (no CSRF);
  Kit's origin check covers form posts. Private repos 404 for people who can't read them; anonymous git clients are asked to sign in.
- Markdown is escaped, not sanitised: never put user text in `{@html}` other than `render()`'s output, Shiki output or `highlightLines`.
- Raw files, wiki files and release files are served with a sandbox CSP; html/js as text; SVG/XML as attachments.
- Webhooks and T3 hosts may point at private IPs (homelab) but only http(s), never following redirects.
- CI secrets are encrypted with `FORGE_SECRET` and only decrypted into a task.

## Handoff (2026-11-16)

Everything is on branch `shed`. Open work, each its own thread:
1. **UI redesign**: done 2026-11-17 (PLAN.md "Later"). Material 3 palettes from seeds (`.agents/scripts/m3-palettes.ts` → `src/lib/themes.ts`;
   roles `--shell`, `--on-accent`, `--accent-container`, `--on-accent-container`), Roboto Flex, tinted shell + rounded `.sheet`, pill nav/buttons,
   phone bottom tab bar. Layouts (Settings → Appearance, drawn cards; `prefs.layout`, cookie `forge_layout`): Classic; Tabs (`TabStrip.svelte`,
   sticky, tabs per PR/issue/file/commit/run in localStorage, keeps sub-page and scroll; DiffView's sticky headers sit under it via `--sticky-top`;
   hidden on phones); Split (`SplitPane.svelte` + `pulls/`, `issues/` layout loads in `server/split.ts`: open PRs/issues beside the open one at
   ≥1200px, loaded once per repo and streamed). Settings pages are grouped cards (`.settings-card`, `.setting-row`, `.settings-list`,
   `.settings-form` in `app.css`; repo settings style their `section`s the same in their layout). Every page was checked in light, dark and 390px
   (`.agents/tmp/pass.ts` writes contact sheets to `.agents/tmp/pass/`; `tabs-test.ts`, `split-test.ts` drive the layouts). Not done: Split's
   pane lists open items only (first 50, no filters).
2. **Deploy**: done 2026-11-16/17 (see Deploying). The owner's 7 Forgejo repos imported (no issues/PRs there). CI runner on server
   (`/opt/stacks/shed-runner`, DEPLOY.md §6) proven on `ada/ci-smoke`. Bundled T3 has SSH/HTTPS git access (§7); Claude isn't signed in
   inside the container yet (needs the owner). Forgejo is stopped (`docker compose down` in `/opt/stacks/forgejo`, data and volumes kept).
   GitHub: the first repo kept unscrubbed commits by SHA, so it was renamed `heycastawhat/shed-old` (private, keep it so) and a fresh
   `heycastawhat/shed` made public 2026-11-17 after an audit of every commit. Releases and Actions secrets need recreating there.
3. **Agents end to end**: done 2026-11-16 against real T3 (pairing, clone into T3, `@agent` on an issue with the summary posted back, approvals from
   Shed's task view, Fix with agent, a hub task); `agents-t3.test.ts` covers the same with a fake T3. Setup clones over SSH, so the T3 host needs its
   key on the account and Shed's host key in `known_hosts` (T3's git is non-interactive). A failed or running clone shows on the repo's
   Agents tab (T3's `subscribeProjectClones`) with Try again.

## Working with the owner

- Small confirmed steps. Don't chain unrequested work. Concise replies.
- Prefers Bun, Svelte, short code, and no comments unless they explain a non-obvious "why".
- Verify in a real browser (screenshot) when changing UI. The owner checks visually and reports what looks off.
- Parallel agents in one checkout: give each a distinct area, no migrations from them, they don't commit; 3–4 at most (they hit the 5-hour usage limit).
