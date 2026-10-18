# forge — notes for agents

A better UI for Forgejo: a SvelteKit app that uses **stock Forgejo as a headless backend** over its REST API.
The goals are a faster, nicer UI, better code review, and CI built in. It's for a single user (the owner) in a homelab.

## Decisions (don't re-litigate)

- **Headless first, not a fork.** Forgejo does git hosting, auth, storage and CI (Actions). This app only reads and writes through `/api/v1`.
  If the API blocks a feature (e.g. true stacked diffs, comments that survive a force-push), the agreed fallback
  is to **hard-fork Forgejo** and add endpoints. Don't do that unprompted.
- Stack: **Bun + SvelteKit 3 + Svelte 5 runes + TypeScript**, Shiki for highlighting. No CSS framework.
- Markdown is rendered by Forgejo (`POST /markdown`), so output matches Forgejo and is sanitised by it.
- Theme: purple accent (`--accent`). The user found stock GitHub green jarring, so **primary actions and the Open badge use the accent**.
  Green and red are only for diff +/− lines and closed state. State badges differ by icon and fill as well as colour (see `PrState.svelte`).

## Layout

- `src/lib/server/forgejo.ts`: API client (`request`/`api`/`apiPage`), `renderMarkdown`, API types.
- `src/lib/server/auth.ts`: OAuth2 (Forgejo is the provider), sessions, silent token refresh (tokens last 1h). The `forge_session` cookie is an opaque id;
  the user's one Forgejo refresh token lives encrypted (AES-GCM, `FORGE_SECRET`) in `data/forge.json` via `store.ts`. `userToken(userId)` is the only way to get an access token.
- **Shell and settings:** `+layout.svelte` has the nav as a sidebar (collapsible to an icon rail with `[`) or a top bar (Settings → Appearance → Navigation, or the palette): Home, Changes, Repos, Agents (waiting badge), chords `G H/C/R/A`, then **pinned repos**
  (labelled `owner/`name, no tile except in rail mode, `1`–`9` jump to them, hover shows an unpin button posting to `/pin`; `/pin` only checks the repo exists when *pinning*, so deleted repos can still be unpinned).
  `NOT_REPOS` lists top-level paths that aren't owners; add new top-level routes there. `Palette.svelte` (Ctrl+K) has pages, actions, `Mode: …` and `Theme: …` entries (POST `/settings/appearance?/palette`), repos and PRs, each with an icon.
  Home shows a "Recently updated" grid of the 6 latest repos above the needs list.
  `/settings` has a sidebar layout with Account (profile link, signed-in sessions with per-session sign-out, newest 5 shown and the rest in a "Show N older" `<details>`; sessions record a browser/OS label), Appearance (System/Light/Dark via the `forge_theme` cookie;
  the hook sets `data-theme` on `<html>` while rendering, and the dark CSS blocks are `:root:not([data-theme='light'])` inside the media query plus `[data-theme='dark']`), and Agents.
  New dark-mode CSS must follow that pattern or it won't respond to the override.
  **Themes** (colour palettes, on top of the mode): `src/lib/themes.ts` holds them (Forge, Catppuccin, Rosé Pine, Nord, Gruvbox, Mono) and generates CSS that the layout injects.
  The `forge_palette` cookie makes the hook set `data-palette` on `<html>`. Palettes only set bg/surface/fg/muted/border/accent; use those vars (plus `--warn`, `--add-fg`, `--del-fg`) and never hard-code colours.
  Appearance shows themes as cards with light/dark previews, then Mode, then Navigation.
- **Repo pages:** the repo header is muted owner / bold name, a "Private" tag and a ghost Pin button; tabs have icons. The branch picker is a label with an invisible `<select>` laid over it (`field-sizing: content` doesn't work on `<select>` in this Chromium).
  `CommitList` groups commits by day (en-NZ dates) and falls back to an initial avatar. The PR list has a segmented Open/Closed switch and an empty state.
  The PR conversation is a timeline (avatar column + connecting line); a merged/closed PR ends with an event dot, and the merge card only renders for open PRs, above the composer.
  In `DiffView` file headers are sticky (`.file` uses `overflow: clip`, since `hidden` breaks sticky) and the summary uses coloured status squares (modified = `--warn`).
- Every T3 task has its own page, `/agents/<host>/<thread>` (breadcrumb Agents / repo; works for T3-only projects too). The task panel is `TaskView.svelte`, used there and in the repo Agents tab; its loader/actions are `src/lib/server/task.ts` (`taskDetail`, `taskActions` = answer/respond/steer/stop, spread into each page's actions).
  TaskView is a chat: your messages as right-hand bubbles, agent replies as plain markdown, steps folded into one line, question/approval cards above an auto-growing composer (Enter sends, Shift+Enter newline), "Open in T3 Code" and Stop in the header.
  `send()` turns T3 `HttpError`s into `fail(status, { actionError })` with the RPC's own message (`failure()` in t3.ts digs it out of Effect's cause), and ignores "not interruptible" from Stop on a finished run (that used to be a 502 page).
- `/agents` is the agent hub (sidebar Agents, `G A`): a new-task box (`NewTask.svelte`, shared with the repo tab; lists only repos that have a same-named T3 project on some host), waiting on you (MCP approvals and T3 permission requests, answerable inline), T3 tasks across every project (hover × dismisses one from the hub only, stored in `dismissed` as `task:<host>:<id>:<updatedAt>`, so new activity brings it back; running or waiting tasks can't be dismissed), recent key activity (collapsed). Shared status helpers are in `src/lib/agent-status.ts`.
- `src/lib/server/agents.ts` (keys), `tools.ts` (the MCP tools, approval gating, `decide`), `src/routes/mcp/+server.ts` (protocol only), `/settings/agents` (UI): see item 10 in the roadmap.
- `src/lib/diff.ts`: unified diff parser plus `toSplit` (shared with the client). `server/highlight.ts` highlights diffs per hunk.
- `src/lib/components/DiffView.svelte`: unified/split diff, collapsible files, line comment threads and composer.
- Routes mirror Forgejo URLs: `/[owner]/[repo]/{tree,blob,raw}/[ref]/[...path]`, `commits/[ref]`, `commit/[sha]`,
  `pulls`, `pulls/[index]` (conversation, comment + merge actions), `pulls/[index]/{files,commits}`.
  Refs are URL-encoded as one segment (`feature%2Fx`).

## Running locally

1. `cd dev/forgejo && ./forgejo web`. This is Forgejo 17.0.0 on SQLite, at http://localhost:3000, with SSH on :2222. Config is in `custom/conf/app.ini`.
   Its browser session lasts 30 days (remember-me 365) and OAuth access tokens 24h, so forge's login bounce rarely stops at a password prompt.
2. `bun run dev --port 5173 --strictPort` → http://localhost:5173. The OAuth redirect URI is registered for exactly this port.
3. Optional, for CI: `cd dev/runner && ./forgejo-runner daemon` (forgejo-runner 13.2.0, registered as `laptop-host` with label `host`, so jobs say `runs-on: host` and run **directly on this machine**, one at a time).
   Re-register with a token from `dev/forgejo/forgejo forgejo-cli actions generate-runner-token` if `.runner` is lost.
4. Check with `bun run check`. Smoke test: `.agents/scripts/login.sh && .agents/scripts/smoke.sh`.

- Admin login: user `ada`, password in `dev/forgejo/.admin-password`. OAuth client ID and secret are in `.env` (see `.env.example`).
- The owner's real instance is **git.example.com** (Forgejo 15.0.5) and is offered for use. Point `FORGEJO_URL` at it and register an OAuth app there.
  Ask first, because it's outward-facing.
- No Docker on this machine, hence the host-mode runner.

### Test data (`ada/sample` on the local Forgejo)
- PR #1 is merged (it has a review with an inline comment on `auth.ts`). PR #2 and PR #3 are merged; #2's comments are throwaway. PR #4 is closed.
- Org `kiwi` ("Kiwi Test Org", repo `kiwi/website`, ada is a member) exists for testing owner pages.
- PR #6 is merged. PR #7 (`feature/greeting`, by ada) is merged too; its one thread was fixed by an agent via Fix with agent.
- **PR #5** (by the second user `reviewer`, password in `dev/forgejo/.reviewer-password`, write access to the repo) was merged by ada on 2026-10-16. For Approve / Request changes tests, open a fresh PR as `reviewer`.
- Don't litter PR #1 or #6 with test comments, or delete the ones you add afterwards (`DELETE /repos/ada/sample/pulls/N/reviews/ID`).
- PRs #8–#20, #22 and #24 are closed throwaways from tests; #21 and #23 were throwaways that auto-merged (their files were removed from main afterwards).
- `main` has `.forgejo/workflows/ci.yml`: `lint` (instant) and `test` (sleeps 20s) on `pull_request`, and on `push` to main only. Any PR gets two checks. For a quick throwaway PR, use the API with basic auth `ada:<admin password>` (the `dev/.git-credentials` token works for git only and gets 401 from the API), then close it and delete its branch.
- Don't merge #5 or #6 from tests. Merging can't be undone, and a merged test PR has to be replaced with a new branch.
- Release `v0.1.0` (on main, notes plus one asset `sample-0.1.0.txt`) and a lightweight tag `v0.0.1` (on `feature/retry-jitter`) are test data for the releases page. PR #34 is a closed throwaway from the branches page.
- Milestones `v0.2` (due 30 Nov 2026; issues #27, #29) and `Backlog` (#28). #27 is assigned to ada, #28 and #30 to reviewer; #30 and #31 have assign/milestone events in their timelines. PR #35 is a closed throwaway from the triage tests.

## Docker

One image runs forge and T3 Code. It was never built (there's no Docker here); every step was checked by hand instead.
- Build: `AGENTS=both docker compose build`. `AGENTS` is `claude` (the default), `codex` or `both`, and picks which agent CLIs get installed. Run it with `docker compose up -d`, which publishes forge on host port 3080.
- `bun run build` uses `@sveltejs/adapter-node` 6 (`svelte-adapter-bun` only supports Kit 2), and Bun runs `build/index.js`, which needs no `node_modules`. The build validates env vars while analysing routes, so the Dockerfile passes dummy values.
  The real values are read at runtime. Without them, `bun --bun` dies with a SIGABRT instead of printing the env error.
- adapter-node 6 has no `ORIGIN`: it assumes `https` and takes the host from `Host`, and `url.origin` builds the OAuth redirect URI. Behind a TLS proxy that's right. Over plain http, set `PROTOCOL_HEADER=x-forwarded-proto`.
- `docker-entrypoint.sh` starts `t3 serve` on `127.0.0.1:3773` (`T3_HOST`/`T3_PORT` override this). The first time, it mints a 10-year token for forge into `~/.t3/forge-token`.
  It sets `T3_URL`/`T3_TOKEN`, overriding `.env`, so the bundled T3 is every user's built-in host. Then it runs forge. If either process exits, the container exits.
  `t3` is pinned at `t3@0.1.0`, the same version as the desktop app, because `t3.ts` speaks T3's internal RPC. The npm package is a wrapper around a native binary (`@t3code/t3-linux-*`), which the image symlinks directly.
- The container runs as `bun`, because Claude Code refuses bypass permissions as root. It has five volumes:
  - `data` → `/data` (`forge.json`)
  - `t3` → `~/.t3` (state, worktrees, `forge-token`, `git-credentials`)
  - `projects` → `~/.t3/projects` (T3 clones)
  - `claude` → `~/.claude` (`CLAUDE_CONFIG_DIR`, so `.claude.json` lives there too)
  - `codex` → `~/.codex`
- First run:
  1. In `.env`, set `FORGEJO_URL`, an OAuth app whose redirect URI is `https://<forge host>/auth/callback`, and `FORGE_SECRET`.
     Set `GIT_AUTHOR_NAME`/`GIT_AUTHOR_EMAIL`/`GIT_COMMITTER_NAME`/`GIT_COMMITTER_EMAIL` too, so agents can commit.
     Never change `FORGE_SECRET` or drop the `data` volume, or everyone has to log in again and all keys die.
  2. Log the agents in with `docker compose exec -it forge claude` (then `/login`) and/or `docker compose exec -it forge codex login --device-auth`.
  3. Give T3 clones push access: `docker compose exec forge sh -c 'echo https://<user>:<token>@<forgejo host> > ~/.t3/git-credentials'`.
  4. T3 is only reachable inside the container, so "Open in T3 Code" links (`http://127.0.0.1:3773/…`) don't work from a browser. Use `docker compose exec forge t3 connect link --headless` (untested), or publish 3773 with `T3_HOST=0.0.0.0`.
     Pairing links for the bundled T3 come from `t3 auth pairing create --base-dir ~/.t3 --base-url <url>`. Other T3 hosts are still added in Settings → Agents.
- Verified by hand:
  - the build in a clean copy without `.env`, and the built server served pages from outside the repo;
  - the npm `t3`/`claude`/`codex` bins run with Bun standing in for `node`;
  - the entrypoint: T3 starts, the token is minted, forge serves pages, and SIGTERM stops both;
  - forge's `t3.ts` (`config`, `survey`) against a headless `t3 serve`, and pairing-link redemption.
- Not verified:
  - the Docker build itself, and whether the base image already provides `node`;
  - volume ownership;
  - Codex's sandbox inside a container;
  - whether T3 lists models once the agents are logged in (an unauthenticated headless T3 returned none).

## Gotchas (each one cost time)

- **SvelteKit 3 differs from v2:**
  - Env vars are declared in `src/env.ts` with `defineEnvVars` and imported from `$app/env/private`.
  - `#lib/...` imports need the `.js` extension.
  - `Handle` comes from `@sveltejs/kit/hooks`.
  - `redirect()` to another origin needs `{ external: [origin] }`.
  - Check `node_modules/@sveltejs/kit/types/index.d.ts` rather than relying on memory.
- No `@types/node`: use `Uint8Array.fromBase64` + `TextDecoder`, not `Buffer`.
- **localhost cookies are shared across ports.** Other local apps' `session` and `i_like_gitea` cookies crashed both the app and Forgejo.
  The fix is unique names: `forge_session` in the app, and `[session] COOKIE_NAME = forge_dev_fj` in app.ini. Never use generic cookie names.
- The dev server can keep serving stale component CSS after edits, even on a full reload: an unscoped `li` rule stayed live after it was fixed in the file.
  If styles don't match the source, restart `bun run dev`.
- `autofocus` doesn't work on elements inserted after load. Use `{@attach (el) => el.focus()}`.
- Split diff tables use `table-layout: fixed` and the first row is a colspan hunk header, so column widths come from `<colgroup>`.
- **Forgejo API quirks:**
  - Some errors come back as `{"message": ""}` (e.g. 405 when merging a merged PR). `request()` falls back to the status code.
  - After a branch is deleted, `head.ref` becomes `refs/pull/N/head`. Display `head.label`.
  - There's no standalone line-comment endpoint. A line comment is `POST /pulls/N/reviews` with `event: COMMENT`, an empty body and one comment.
    Use `new_position` for new-side lines and `old_position` for old-side ones. When reading, `position` (new) or `original_position` (old) is set.
  - There's no API to resolve a conversation. The app uses a 🚀 (`rocket`) reaction on the thread's first comment instead.
    A thread also counts as closed once its line is gone or changed in the current diff, because the API doesn't flag outdated comments.
  - The contents API returns `content: null` for blobs over its size limit.
  - The login form may not render `_csrf` (Forgejo checks `Origin`). Scripts must send `Origin` and treat the token as optional.
- **Forgejo refresh tokens are single-use, and all logins of a user for one OAuth app share one chain.** Redeeming any token invalidates every older one ("token was already used"),
  so two browsers, or a browser plus an agent key, can't each hold their own. That's why forge keeps a single server-side grant per user and shares the access token. Concurrent refreshes are de-duplicated in `userToken`.
  Consequence: if `forge.json` is lost or `FORGE_SECRET` changes, log in again and recreate keys.
- **The agent sandbox proxy blocks `localhost`** (511). To run the local Forgejo/dev server or curl them, run the terminal command unsandboxed. Another session may already have `forgejo web` and `vite` running on :3000/:5173 (the Forgejo queue DB lock fails a second start), so `mcp.sh` only starts what isn't up.
- There's no prettier config. A bare `bunx prettier` reformats to spaces and double quotes; the house style is tabs, single quotes, no trailing commas, ~180 columns.
- Icons are MingCute Core Regular (`@mingcute/svelte`, per-icon imports like `@mingcute/svelte/core-regular/robot`), mapped by name in `Icon.svelte`. The owner rejected Lucide as too generic. They are filled shapes, so there is no stroke width to set. After adding a dependency, restart `bun run dev` or SSR fails with "Unknown file extension .svelte".
- Selected rows (sidebar, settings nav, palette) are a flat `color-mix(var(--fg) 9%)` tint, not an accent stripe. The owner found the stripe looked AI-made.
- Don't name a class `.agent` inside a component: `app.css` has a global `.agent` pill (the agent label), and it leaks in.
- The user's shell defines `grep` as a function (ugrep). Use `command grep` in scripts.
- **Headless UI testing:** `/usr/bin/chromium` works with `playwright-core`; see `scripts/line-comments.e2e.ts`.
  Wait for `networkidle` before clicking, because clicks before hydration do nothing.
  Screenshots: `.agents/scripts/login.sh` then, in `.agents/tmp`, `bun shot.ts <light|dark> name=/path …` → `shot-name.png` (`FULL=1` for full page, `COOKIES="forge_palette=nord"` for extra cookies).
  `login.sh` reuses `app.jar` while it still works (`FRESH=1` forces a new login), because every fresh login adds a sign-in on Settings → Account. About 26 old test sign-ins are still listed there.
  `.agents/tmp` is scratch (one-off playwright scripts like `chat.ts`, `question.ts`, `hublaunch.ts`, `dismiss.ts`, `paltheme.ts`); none of it is load-bearing.
- Editing Svelte with Python substring replaces: match on unique text, not indentation plus `{/each}`; one cut the wrong block.

## Status and roadmap

Done:
1. Local Forgejo
2. OAuth login
3. Repo browser
4. Commit and PR diff views
- Plus merge, PR comments, inline line comments, and state badges.
5. Merge card: a readiness checklist plus Approve and Merge. `A` approves; `M` arms the merge and a second `M` within 2s merges.
6. Pending reviews: drafts are kept in localStorage (`review:owner/repo#N`) and submitted as one `POST /reviews`.
   Forgejo's own PENDING reviews need a non-empty body, so they weren't used.
7. A "viewed" checkbox per file, in localStorage (`viewed:owner/repo#N`) with a hash of the file's diff, so it unviews itself when the file changes.
8. Expanding diff context (`DiffView` `source` prop → `/[owner]/[repo]/lines/[ref]/[...path]?from&to`). Expanded lines can't be commented on.
9. Agents tab (`/[owner]/[repo]/agents`), driving T3 Code through `src/lib/server/t3.ts` (WebSocket RPC).
   **Hosts:** each user adds T3 servers in Settings → Agents, normally by pasting a **pairing link** from T3's Settings → Connections (`<host>/pair#token=…`, or hosted `…?host=<url>#token=…`; single-use, 5 min).
   `pair()` redeems it at T3's `POST /oauth/token` (RFC 8693 token exchange, subject type `urn:t3:params:oauth:token-type:environment-bootstrap`, scope `orchestration:read orchestration:operate source-control:write`, client_label `forge`) for a 30-day bearer with no refresh token, so hosts show when the pairing ends and must be re-paired.
   (T3's MCP OAuth flow is no use here: its tokens only work on `/mcp`.) A URL plus a `t3 auth session issue …` token still works under "Or use a URL and token". Hosts are checked (`getConfig`) on add and stored in `forge.json` (`t3Hosts`, token encrypted).
   `T3_URL` + `T3_TOKEN` in `.env` is an optional extra host for everyone (id `env`, not removable). Every t3.ts call takes a `Host`; `survey(hosts)` loads all of them and reports a host that's down instead of failing.
   **Agent questions:** an agent's AskUserQuestion shows up as a pending runtime request of kind `user_input` plus a `user_input_request` turn item with `questions`. Forge renders a card (options + free text) above the reply box and answers with
   `runtime-request.respond` `{ answers: { [questionId]: value | label | text, or an array for multiSelect } }`, or `thread.user-input.dismiss`. Before this, a question left the run stuck.
   The task log groups everything between messages into one expandable "Ran 2 commands, thought 3 times" line.
   **Open in T3 Code:** threads link to the host's own web UI at `<host url>/<environmentId>/<threadId>` (`config()` returns the base). A browser that never paired with that host lands on T3's `/pair` page, which then goes to `/` rather than the thread. Making a pairing link per click would need T3's `access:write` scope, so it's not done.
   **Set up in T3:** when no host has the repo as a project, the Agents tab offers "Clone into T3 Code": `cloneProject()` calls T3's `projectClone.start` (needs the `source-control:write` scope; pairing asks for it, and the `.env` token was re-minted with it) into `<newProjectsRoot>/<repo name>` (`~/.t3/projects/…` here).
   The clone uses the repo's `clone_url`, so pushing needs git credentials for Forgejo on that host. Locally there are none globally; `~/.t3/projects/claude-testing` got the same local `credential.helper` as `dev/sample`.
   The Agents tab merges threads from every host that has the project; the new-task form picks the host; links carry `?host=&thread=` (the same server added twice yields the same thread ids). Fix with agent uses the first reachable host with the project.
   A repo maps to the T3 project with the same **title**. New tasks run in a T3 worktree off the default branch and reuse the model of your latest T3 thread.
   It has start, a polled log (every 2s while running), approvals, follow-up/steer and Stop. Stop and steering a *running* agent are untested.
   **Fix with agent** (Conversation and Files tabs, `src/lib/server/fix.ts`) starts a task on the PR branch (`startFromOrigin`) that commits and pushes the fix.
   `dev/sample` pushes with a `write:repository` token in `dev/.git-credentials`; T3 worktrees share that config.
   The local T3 server is the desktop app's, on :3773. `ada/sample` is checked out at `dev/sample` as T3 project "sample".

10. **Agent keys and MCP server** (`.agents/scripts/mcp.sh` tests it end to end). Agents connect *to* forge: Settings → Agents creates a key and shows a `claude mcp add --transport http forge <origin>/mcp --header "Authorization: Bearer fk_…"` line.
   `/mcp` is a hand-rolled MCP (Streamable HTTP, JSON replies, no SSE) with list/read PRs, diff, `read_file`, comment, reply to thread, resolve thread, open PR, and an **opt-in** `merge_pull_request` (merge now or `when_checks_pass`).
   A key can only see or call merge if its owner ticked "Also allow it to: merge a PR" (`AgentKey.allow`; tools marked `optIn` in `tools.ts`). New keys ask before merging by default.
   Keys act as their owner through Forgejo, are scoped to a repo list (`*` = all), and writes are signed "<key name>, an agent acting for @user via forge" and logged (last 500 in `forge.json`, shown on the settings page).
   **Approval queue:** each key has an `ask` list of write tools. A call to one of those is parked in `forge.json` (`approvals`) and the agent gets "queued as request <id>", then polls the `check_request` tool.
   The owner approves or denies on `/settings/agents` ("Waiting on you", header badge, 5s poll). Approve runs the stored call as the owner. Decisions are one-shot (409 on a repeat) and only the owner can decide. New keys ask before `open_pull_request` by default; keys made before this have no `ask` and never ask.
   **Repo rules** (`src/lib/server/rules.ts`): `.forge/agents.json` on the repo's default branch, read on every agent write. Keys: `branchPrefix` (open_pull_request head must start with it; refused),
   `protectedPaths` (globs; a PR whose compare-diff touches one is queued with a reason; if the file list can't be had it queues too), `ask` (tools that always queue for that repo), `deny` (tools refused).
   An invalid file **fails closed** (writes refused with a 422; reads still work). The `get_rules` tool lets agents read them first. Lockfiles need `**/*.lock`-style globs; `*` doesn't cross `/`.
   **Agent labels:** writes carry a `<sub>name, an agent acting for @user via forge</sub>` footer (`src/lib/sign.ts`). The PR conversation and Files tab strip it and show a purple pill with the key's name. It's a label, not proof: anyone can type the same text.
   Keys are editable in place (name, repos, ask list) under each key on `/settings/agents`. `comment_on_line` lets an agent start a thread on a diff line (path must be in the PR; it can comment but never approve).
   Tests: `mcp.sh` (auth, reads, token refresh), `mcp-merge.sh` (opt-in merge: hidden/refused, queued, scheduled), `mcp-tools.sh` (open PR, diff, read_file, resolve, comment_on_line), `mcp-approval.sh` (queue), `mcp-rules.sh` (rules); `mcp-clean.sh` revokes their throwaway keys (by name).
   They create and delete branches/PRs in `ada/sample` themselves; `mcp-rules.sh` also commits and removes `.forge/agents.json` on main.
   Not built yet: blame markers for agent lines, a way to edit rules in forge's UI (it's a file in the repo for now), and pushing branches through forge (agents push over git). `FORGE_SECRET` must be set in `.env`.

11. Auto-merge: when the head's combined status is `pending`, the merge button becomes "Merge when checks pass" (`merge_when_checks_succeed`); `cancelAutoMerge` is `DELETE /pulls/N/merge`.
   The API has no auto-merge field, so the state is the latest `pull_scheduled_merge`/`pull_cancel_scheduled_merge` in `/issues/N/timeline`.
   Forgejo schedules even with no checks at all and then waits for a status forever, so the button is only offered while checks are pending.

12. CI status: the merge card lists each commit status (job name, description, a Logs link to Forgejo's job page) under the "N of M checks passed" row, and the page re-polls every 5s while checks are pending.
   Forgejo calls a status's state `status`, not `state` (the old count was always 0). Job logs aren't in the API, hence the link out.

13. Agent attribution: `Byline.svelte` renders "<agent pill> on behalf of <user>" for PR lists, Changes, the PR header, the conversation, line comments and commit lists.
   Sources (`sign.ts`): forge's own MCP signature; Claude Code's "Generated with [Claude Code]" PR footer (→ "Claude Code"); and the `Co-Authored-By: <name> <noreply@anthropic.com>` commit trailer (→ e.g. "Claude Opus 5.5").
   A PR counts as agent-made if its body says so or any of its commits has the trailer (the PR layout fetches commits for this). The sidebar/top bar brand is plain "forge" text now; the rail hides it.

14. Small gaps closed: `/[owner]` is a user/org page (profile, org members, `RepoList.svelte` shared with `/repos`; `/users/<name>` works for orgs, and `/orgs/<name>/members` succeeding is how it tells them apart).
   Markdown files and READMEs render with `renderMarkdown(…, { ref, dir })`: Forgejo gets `<repo>/src/branch/<ref>/<dir>` as context, and that prefix is rewritten to forge's `blob`/`raw` URLs (folder links redirect blob → tree).
   The tree view shows each entry's last commit subject and age (`last_commit_sha` from the contents API, then one `git/commits/<sha>` per distinct sha).

15. Issues: repo tab "Issues" (open count, hidden if `has_issues` is off). `/[owner]/[repo]/issues` (Open/Closed switch, `LabelChip.svelte`, New issue), `issues/new`, and `issues/[index]`
   (timeline of comments plus close/reopen/label/title events, composer with Close/Reopen "with comment", Labels sidebar with a toggle picker). `IssueState.svelte` mirrors `PrState`. Open issues are in the palette.
   Quirks: the list needs `type=issues` or PRs come back too; `/issues/N` for a PR redirects to `/pulls/N` (`pull_request` is set); `/issues/N/timeline` returns `null`, not `[]`, when empty;
   label colours come back without `#`; a `label` timeline event has `body` `"1"` for added and `"0"` for removed. Test issues #27–#31 and labels bug/enhancement/docs/good first issue are in `ada/sample`.

16. Labels and editing on issues and PRs. The label picker (now in `Triage.svelte`, see 18) is in the sidebar on the issue page and the PR Conversation tab; the other PR tabs show chips in the header; chips on the PR list and Changes.
   The label dropdown next to Open/Closed is in `ListFilters.svelte` (see 18); list chips link to the same `?labels=<name>` filter, with × to clear.
   `EditTitle.svelte` (pencil, Enter saves, Esc cancels) and `Description.svelte` (Edit swaps the first card to a textarea) are allowed for push access or the author.
   Actions live in `src/lib/server/issue.ts` (`issueActions` = label/edit, spread into both pages; PRs use the `/issues/N` endpoints). The PR layout's title form posts to `<pr>?/edit`, so it works from the Files and Commits tabs too.
   Editing a body unsigns it first and re-appends the original forge footer on save, so agent attribution survives. ("Generated with Claude Code" is ordinary body text and stays editable.)
   Quirk: `/issues?labels=` takes label **names**, but `/pulls?labels=` takes label **ids** (a name fails with a `strconv.ParseInt` error), so the PR list maps the name first.

17. Branches and releases: "N branches · N tags" links sit left of the branch picker on the Code tab (the layout fetches `tags?limit=1` for `x-total-count`; the picker hides on these pages).
   `/[owner]/[repo]/branches`: default first, then by latest commit; last commit with `Byline`; behind/ahead vs the default branch for the 20 newest (two `compare` calls each, which return full commits and files, hence the cap);
   the open PR (matched on `head.ref`) or "New pull request" (`?/openPr` → `openPush` from `home.ts`, drafted title, straight to the PR); delete with a confirm for push users, never the default or a protected branch (re-checked server-side).
   `/[owner]/[repo]/releases`: Releases/Tags switch (`?tags`, and Tags when there are no releases); notes via `renderMarkdown(…, { ref: tag, dir: '' })`; assets and source archives link straight to Forgejo (so a private repo needs a Forgejo browser session).
18. Triage: `Triage.svelte` is the issue/PR sidebar (Labels, Assignees, Milestone), each a `SidePicker.svelte` (generic toggle list of forms posting to `?/<action>`).
   `issueActions` gained `assign` (toggles one login against the *current* assignees, fetched server-side, so quick clicks on a stale page don't undo each other) and `milestone` (`PATCH milestone: id`, `0` clears); `triageOptions()` loads labels, `/assignees` and open milestones.
   Lists: `ListFilters.svelte` (Label and Milestone dropdowns, "Assigned to me" toggle; it replaced `LabelFilter.svelte`), assignee avatars (`Assignees.svelte`) and the milestone on each row, and `Pager.svelte` (25 per page, `x-total-count`).
   All list links go through `listQuery(url, { key: value | null })` in `src/lib/list-query.ts`, which keeps the other params and drops `page`. URL params: `state`, `labels` (name), `milestone` (title), `assignee` (login), `page`; `listFilters()` in `issue.ts` parses them.
   The issue timeline shows `assignees` events (`assignee` + `removed_assignee`; self-assign reads "self-assigned this") and `milestone` events (`milestone`/`old_milestone`, null on the cleared side).
   Quirks: the pulls list has no assignee filter, so with `assignee` set the PR list pages through `/issues?type=pulls&assigned_by=` and fetches each `/pulls/N` for its branches. It filters milestones by id (`milestone=`), the issues list by `milestones=` (names or ids).
   An unknown label or milestone name makes Forgejo **ignore** the filter and return everything, so `listFilters` flags it and the list is emptied by hand; an unknown `assigned_by` user is a 404.

19. `@agent` mentions (`src/lib/mention.ts` finds them, skipping code and quotes; `src/lib/server/mention.ts` acts). A comment posted *through forge* (PR conversation, PR line comment, issue) that mentions `@agent` starts a T3 task on the commenter's own first host with the repo as a project
   (PR: on the PR branch, pushing to it; line comment: plus the diff lines above it; issue: a new `agent/issue-N-…` branch off the default one) and replies "On it" with the task link, signed as agent `agent`. Open mentions live in `forge.json` (`mentions`).
   The request hook runs `sweepMentions()` at most every 15s: a finished task gets "Done" plus the agent's last message (cut at ~4000 chars), a failed one a "stopped" note; line-comment replies go to the same line. Mentions made in Forgejo's own UI do nothing yet (stage 3: webhook + a real Forgejo user).
   Typing `@` in a comment box (PR/issue composers, line comments, descriptions, new issue) opens `MentionPicker.svelte`: `@agent` first, then the repo's `/assignees` (via `/[owner]/[repo]/mentionable`, cached per page load); arrows + Enter/Tab pick, Esc closes. Add it to a new textarea with `bind:this` + `<MentionPicker input={…} />`.
   `store.read()` caches the load *promise*: two concurrent first loads used to make two copies, and the sweep's `done` flags landed on the lost one, so it posted twice.

20. T3 task attribution: `startTask` (every forge-started task: Fix with agent, `@agent`, NewTask) records `{ repo, branches, host, thread, agent, userId }` in `forge.json` `tasks` (last 500); `agent` is the provider's display name ("Claude", "Codex").
   `branches` is where the task was told to push (PR head, or `agent/issue-N-…`); for a NewTask it's empty, and `taskOn()` fills it in when a PR shows up from the thread's current branch (T3's `t3/<slug>`, checked only for tasks started in the 3 days before the PR).
   The PR layout uses it only when no signature/footer/trailer names an agent; the pill links to `/agents/<host>/<thread>` (`Byline`'s `href`). Only tasks started before the PR opened count, so a Fix or `@agent` on a human's PR doesn't credit the PR to the agent. PRs #38 and #39 are closed throwaways from these tests.

Next, in the order discussed:
1. Deploy to `/opt/stacks` on server. (The session cookie is now an opaque id, so that blocker is gone. Persist `FORGE_DATA` and keep `FORGE_SECRET` stable, or everyone has to log in again and all keys die.)
2. Agent attribution, the rest: commit lists don't use the T3 task record (item 20). Maybe also a real Forgejo label (`agent/<key name>`) so Forgejo's own UI shows it.

Waiting on the owner (asked, not answered; don't start without a yes):
- **T3 Code bundled in the Docker image**: done as an image only (see "Docker"); never built, since there's no Docker here, and not deployed. Deploying it to server (`/opt/stacks/forge`) and T3 Connect still need an OK.
- Smaller offers: a "show dismissed tasks" view on the hub; hub launch redirecting to the new task's page instead of the repo tab; clearing the old test sign-ins.

Agent ideas (designs in `.agents/reference/`, not started):
- **Agents tab** (`git-host-prototype.html`, `git-host-prototype-agents.png`): tasks with status, a live log, a "Needs your OK" box,
  Pause / Take over / Stop, and a box for steering the agent. The idea is to drive T3 Code agents from forge over T3 Connect.
  Everything it needs exists in T3 Code without changes (checked against a fresh clone, 2026-10-16). See "T3 Code API" below.
- **Agent activity** (`agent-activity.png`): agents connect *to* forge with scoped keys (CLI or MCP server). Repo rules decide what they may do;
  anything outside the rules waits in a "Waiting on a human" queue. Also: an audit log, and agent lines marked in blame and diffs.
  Forgejo's scoped access tokens could be the keys, but the approval queue only works if agents go through forge's API rather than Forgejo's.

T3 Code API (from the source, commit 2577baf8; server default port 3773):
- **Auth:** on the T3 host, `t3 auth session issue --scope orchestration:read --scope orchestration:operate --scope source-control:write --label forge` mints a bearer token.
  Without `--scope` it is admin. Keep it server-side in forge's `.env`.
- **MCP at `/mcp`** is the only documented outside-client surface (`docs/user/outside-agents.md`). It has `t3_thread_launch`, `t3_thread_send`
  (mode `steer`), `t3_thread_read` (view `activity`), `t3_thread_wait` and `t3_thread_interrupt`. It **can't approve permission requests**, only answer questions.
- **WebSocket RPC** at `/ws?wsTicket=…&orchestrationProtocol=2` (ticket from `POST /api/auth/websocket-ticket`) is what T3's own apps use.
  It adds a live `subscribeThread` stream and `runtime-request.respond` for approvals. It's internal Effect RPC, so pin the T3 version.
- **Webhook tasks** answer at `/api/hooks/:taskId/:token`, with optional GitHub-style HMAC and `{{body.x}}` placeholders in the prompt.
  They don't need T3 Connect when forge can reach the host directly.
- T3 projects must already exist, so a forge repo needs a matching T3 project (a local checkout).

Known gaps:
- Unit tests: `bun run test` (`bun test` on `src/lib/*.test.ts`; diff fixtures saved from `ada/sample` plus a hand-made `edge.diff` live in `src/lib/fixtures/`). Test files are excluded from svelte-check (no `bun:test` types).

## Working with the owner

- Small confirmed steps. Don't chain unrequested work. Concise replies.
- Prefers Bun, Svelte, short code, and no comments unless they explain a non-obvious "why".
- Verify in a real browser (screenshot) when changing UI. The owner checks visually and reports what looks off.
