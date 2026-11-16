# Shed — plan

A self-hosted git host for one person and their coding agents. It replaces Forgejo: Shed stores the repos, runs sign-in,
pull requests, issues and CI itself, rather than being a UI over Forgejo's API (which is what forge is today).

History: forge started as a headless UI for Forgejo. Every wall it hit was Forgejo's API (no job logs, no re-runs, no real
resolved threads, comments lost on force-push, no stacked diffs, single-use refresh tokens shared across every login).
On 2026-11-15 the owner decided to own the backend, the way Sink owns its notes. forge's UI carries over; `forgejo.ts` is what goes.

## Goals

- Repos are plain bare git repos on disk. SQLite holds everything else (users, PRs, reviews, issues, CI runs).
  Back up two things: the repos folder and the database.
- Build what the owner uses, better than Forgejo does it: review, merge, CI with logs, agents as first-class users.
- Existing tools keep working: `git` over HTTPS (and SSH later), `forgejo-runner` for CI, current workflow files.
- Move off git.example.com with an importer, run both side by side, then turn Forgejo off.

## Non-goals

- Federation, packages, LFS, pull mirrors, projects boards, the site-admin long tail. Add one only when it's needed.
- Many users or organisations at scale. A few people and agents, yes; a public forge, no.

## Architecture

```
browser ── HTTPS ── shed (Bun + SvelteKit, one process)
git CLI ── HTTPS ──┤   ├─ /repos/<id>.git             bare repos
agents ─── MCP ────┤   ├─ /data/shed.db               SQLite (bun:sqlite, append-only migrations)
forgejo-runner ────┘   └─ git binary, spawned per request
```

- One SvelteKit app, same stack as forge (Bun, Kit 3, Svelte 5 runes, Shiki). Server code moves from "call Forgejo"
  to "query SQLite / run git". forge's routes, components and agent features stay.
- **git does the git work**, spawned with `Bun.spawn`: `upload-pack`/`receive-pack --stateless-rpc` for clone and push,
  `merge-tree --write-tree` + `commit-tree` + `update-ref <ref> <new> <old>` for merges without a checkout,
  `diff`, `log`, `blame`, `cat-file --batch` for browsing. No libgit2.
- **Every write to a ref is compare-and-swap** (`update-ref` with the old value), so a push racing a merge fails
  cleanly instead of losing commits.

## Accounts and access

- Sign-in with any OIDC provider plus an allowlist (`email:`, `user:`, `sub:`), like Sink. Shed refuses to start with
  nobody allowed. No passwords stored. The first account is the owner.
- Git over HTTPS: Basic auth with a personal token as the password. Tokens are scoped (`repo:read`, `repo:write`, per-repo
  lists, optional expiry), stored hashed.
- **Agents are users** (kind `agent`, owned by a person): their own tokens, their own name on commits, comments and PRs.
  The approval queue, repo rules and MCP server from forge move over and gate agent writes server-side.
- Permissions per repo: owner, write, read. Private by default.

## Repos and git

- `POST` creates a bare repo (`git init --bare`, default branch `main`). Rename, transfer, archive, delete (to a trash
  folder first).
- Smart HTTP: `GET info/refs?service=…`, `POST git-upload-pack`, `POST git-receive-pack`. Auth before spawning.
- **Push checks** run in a `pre-receive` hook that calls back into Shed (protected branches, required checks, who may
  force-push). `post-receive` records the push: updates PRs, starts CI, fires webhooks, feeds activity.
- Repos are stored by id (`repos/<id>.git`), so renames and transfers only touch the database and no URL part is ever a path.
  Owner and repo names are still checked (letters, digits, `.-_`, starting with a letter or digit, not ending in `.git`).
- SSH: later, via an `authorized_keys` `command=` entry that calls `shed git-ssh <key id>`.

## Pull requests and review

- A PR is (base branch, head branch or fork ref), stored with `refs/pull/N/head` kept up to date on push.
- Every push to a PR is recorded as a **revision** (old head → new head). Review comments are anchored to
  (revision, path, side, line), so they survive force-pushes and show as outdated against later revisions, and
  "changes since your last review" is a diff between two revisions.
- Threads can be resolved for real. Reviews: comment, approve, request changes; drafts are server-side.
- Merge styles: merge, squash, rebase, fast-forward. Rebase without a worktree uses `git replay` where the git version
  has it, else a temporary worktree. Auto-merge when checks pass is a first-class state, not a timeline hack.
- Later: stacked PRs (a PR's base is another PR's head; merging the bottom retargets the next).

## Issues

Issues, comments, labels, milestones, assignees, close/reopen, cross-references (`#12`, `owner/repo#12`), mentions,
reactions. PRs and issues share one number sequence per repo, as in Forgejo, so imported links keep working.

## CI

- Shed speaks the protocol `forgejo-runner` uses (Connect RPC, `runner.v1` from `actions-proto-def`: register, declare,
  fetch task, update task, update log), so the existing runner and `.forgejo/workflows/*.yml` files work unchanged.
  **To check first:** how much of the workflow parsing (`on:`, `needs`, matrix, expressions) the server has to do;
  Gitea and Forgejo do it server-side with act's job parser. That decides how big this is.
- Logs are stored per step and streamed to the browser. Re-run a job or a whole run. Cancel. Artifacts.
- Commit statuses from CI and from outside tools (`POST` status API) feed the merge checks.

## Importing from Forgejo

`shed-admin import <forgejo url> <token>`: for each repo, `git clone --mirror` into the repos folder, then copy issues, PRs
(with their reviews and line comments), labels, milestones, releases and comments through Forgejo's API. Forgejo users map
to Shed accounts by email. Re-runnable per repo. Forgejo stays up until Shed has done a few weeks of real use.

## API

`/api/v1` is Forgejo-compatible (the subset Shed's pages, agents and common tools use), served from `src/lib/server/api/`.
Pages call it in-process through `forgejo.ts` with an internal token for the signed-in person, so forge's pages moved over
unchanged; scripts and tools call it over HTTP with a Shed token. Where Forgejo's API fell short, Shed adds endpoints
(`pulls/N/revisions`, `pulls/N/comments`, `pulls/comments/ID/resolve`). `/mcp` for agents, as now.

## First usable version

1. Data layer: SQLite schema and migrations, the repos folder, path checks.
2. Sign-in (OIDC), users, tokens.
3. Repos: create, browse (tree, file, raw, commits, commit, branches, tags), clone and push over HTTPS with push hooks.
4. PRs: open, diff, revisions, review comments, reviews, merge styles, close/reopen.
5. Issues with labels, milestones, assignees.
6. Importer, run against a copy of git.example.com.
7. CI with forgejo-runner.
8. Agents moved over from forge (keys → agent users, MCP, approvals, T3).

Then: SSH, webhooks, branch protection UI, notifications, search, releases, wiki, stacked PRs.

## Later: UI redesign (after the backend)

Take Sink's visual language, not its component library (`@m3e/web` builds in the browser; Shed renders on the server):
a seed-colour palette made server-side with `material-color-utilities` (same purple seed as Sink, accent picker), Roboto Flex
with its width axis for headings, a tinted shell with one big rounded sheet, pill nav, tonal buttons, a bottom tab bar on phones,
settings as grouped cards. Code views (diffs, trees, commit lists) stay dense.
Layouts like Sink's, per account: **Tabs** for PRs (open PRs and their files as tabs that keep scroll, drafts and viewed state)
and **Split** for lists (the PR list beside the open PR).

## Working

- One topic per commit, the body says why.
- Every server change gets a test: Kit's handlers or the git layer against a temp repos folder and an in-memory DB.
  Git transport tests run the real `git` client against a Shed started in-process.
- CI runs typecheck, tests and the build on every push, and publishes an amd64 + arm64 image.

## Decided

- Same repo: forge becomes Shed.
- Sign-in works with any OIDC provider; the owner's is Pocket ID, so test against that first.
- Runs on server, repos and database on local disk.
