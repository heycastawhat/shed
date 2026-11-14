#!/usr/bin/env bash
# Seeds a fresh local Forgejo (dev/forgejo, :3000) with forge's test data and writes .env's OAuth client.
# Expects users ada (admin) and reviewer to exist, passwords in dev/forgejo/.{admin,reviewer}-password.
# Idempotent enough to re-run on an empty instance only; on a seeded one it fails on the first duplicate.
set -euo pipefail
cd "$(dirname "$0")/../.."
FJ=${FJ:-http://localhost:3000} D=dev/${FJDIR:-forgejo}
JP=$(cat $D/.admin-password) RP=$(cat $D/.reviewer-password)
api() { local m=$1 p=$2; shift 2; curl -sf -u "ada:$JP" -X "$m" -H 'Content-Type: application/json' "$FJ/api/v1$p" "$@"; }
rapi() { local m=$1 p=$2; shift 2; curl -sf -u "reviewer:$RP" -X "$m" -H 'Content-Type: application/json' "$FJ/api/v1$p" "$@"; }
b64() { base64 -w0; }
put() { # put <branch> <path> <message> <content>  (creates or updates; new_branch off main when the branch is new)
	local br=$1 path=$2 msg=$3 body; body=$(printf '%s' "$4" | b64)
	local key=branch ref=$br
	api GET /repos/ada/sample/branches/$br >/dev/null 2>&1 || { key=new_branch ref=main; }
	local sha; sha=$(api GET "/repos/ada/sample/contents/$path?ref=$ref" 2>/dev/null | jq -r .sha || true)
	local data; data=$(jq -n --arg c "$body" --arg m "$msg" --arg b "$br" --arg s "$sha" --arg k $key '{content:$c,message:$m,($k):$b} + (if $s == "" then {} else {sha:$s} end)')
	if [ -n "$sha" ]; then api PUT /repos/ada/sample/contents/$path -d "$data"; else api POST /repos/ada/sample/contents/$path -d "$data"; fi >/dev/null
}

# OAuth app → .env
if [ ! -f .env ]; then
	APP=$(api POST /user/applications/oauth2 -d '{"name":"forge dev","redirect_uris":["http://localhost:5173/auth/callback","http://localhost:5174/auth/callback"],"confidential_client":true}')
	SECRET=$(head -c 32 /dev/urandom | base64 -w0)
	cat > .env <<EOF
FORGEJO_URL=$FJ
FORGEJO_CLIENT_ID=$(echo "$APP" | jq -r .client_id)
FORGEJO_CLIENT_SECRET=$(echo "$APP" | jq -r .client_secret)
T3_URL=
T3_TOKEN=
FORGE_SECRET=$SECRET
FORGE_DATA=data
EOF
	echo "wrote .env"
fi

api POST /user/repos -d '{"name":"sample","description":"Test data for forge","auto_init":true,"readme":"Default","default_branch":"main"}' >/dev/null
rapi GET /user >/dev/null
api PUT /repos/ada/sample/collaborators/reviewer -d '{"permission":"write"}' >/dev/null

put main README.md 'Write a README' "# sample

Test data for **forge**.

| Thing | Where |
| --- | --- |
| Auth | [auth.ts](src/lib/server/auth.ts) |
| Routes | [src/routes](src/routes) |
"
put main src/lib/server/auth.ts 'Add auth helpers' "export function token(user: string) {
	return \`t-\${user}\`;
}

export function check(t: string) {
	return t.startsWith('t-');
}
"
put main src/lib/server/api.ts 'Add API client' "export async function get(url: string) {
	const res = await fetch(url);
	if (!res.ok) throw new Error(\`\${res.status}\`);
	return res.json();
}
"
put main src/routes/+page.svelte 'Add home page' '<h1>Hello</h1>
'
api POST /repos/ada/sample/contents/logo.png -d "$(jq -n --arg c "$(printf '\x89PNG\r\n\x1a\n\0\0\0\rIHDR\0\0\0\x01\0\0\0\x01\x08\x06\0\0\0\x1f\x15\xc4\x89\0\0\0\rIDATx\x9cc\xf8\xcf\xc0\xf0\x1f\0\x05\0\x01\xff\x89\x99=\x1d\0\0\0\0IEND\xaeB`\x82' | b64)" '{content:$c,message:"Add logo",branch:"main"}')" >/dev/null
api POST /repos/ada/sample/contents/blob.bin -d "$(jq -n --arg c "$(head -c 64 /dev/urandom | b64)" '{content:$c,message:"Add a binary",branch:"main"}')" >/dev/null
put main .forgejo/workflows/ci.yml 'Add CI' 'on:
  pull_request:
  push:
    branches: [main]
jobs:
  lint:
    runs-on: host
    steps:
      - run: echo lint
  test:
    runs-on: host
    steps:
      - run: sleep 20
'

# Labels, milestones
for l in 'bug:ee0701' 'enhancement:84b6eb' 'docs:0075ca' 'good first issue:7057ff'; do
	api POST /repos/ada/sample/labels -d "$(jq -n --arg n "${l%%:*}" --arg c "#${l##*:}" '{name:$n,color:$c}')" >/dev/null
done
V02=$(api POST /repos/ada/sample/milestones -d '{"title":"v0.2","due_on":"2026-11-30T00:00:00Z"}' | jq .id)
BL=$(api POST /repos/ada/sample/milestones -d '{"title":"Backlog"}' | jq .id)
BUG=$(api GET /repos/ada/sample/labels | jq '.[] | select(.name=="bug") | .id')

# PR: retries (open, by ada, with a review comment from reviewer)
put feature/api-retries src/lib/server/retry.ts 'Add retry helper' "export async function retry<T>(fn: () => Promise<T>, n = 3): Promise<T> {
	for (let i = 0; ; i++) {
		try {
			return await fn();
		} catch (e) {
			if (i >= n) throw e;
			await new Promise((r) => setTimeout(r, 100 * 2 ** i));
		}
	}
}
"
put feature/api-retries src/lib/server/api.ts 'Retry Forgejo API calls' "import { retry } from './retry';

export async function get(url: string) {
	return retry(async () => {
		const res = await fetch(url);
		if (!res.ok) throw new Error(\`\${res.status}\`);
		return res.json();
	});
}
"
P1=$(api POST /repos/ada/sample/pulls -d '{"head":"feature/api-retries","base":"main","title":"Retry Forgejo API calls","body":"Wraps `get` in a retry with backoff.\n\nDrop this before merging: debug note."}' | jq .number)
rapi POST /repos/ada/sample/pulls/$P1/reviews -d '{"event":"COMMENT","body":"","comments":[{"path":"src/lib/server/retry.ts","new_position":6,"body":"Should this jitter?"}]}' >/dev/null
api POST /repos/ada/sample/issues/$P1/comments -d '{"body":"Looks good overall."}' >/dev/null

# PR: greeting by reviewer (open, for approve tests)
put feature/greeting src/routes/+page.svelte 'Friendlier greeting' '<h1>Kia ora</h1>
'
rapi POST /repos/ada/sample/pulls -d '{"head":"feature/greeting","base":"main","title":"Friendlier greeting"}' >/dev/null

# PR: closed test
put closed-test closed.txt 'Closed test' 'nothing
'
C=$(api POST /repos/ada/sample/pulls -d '{"head":"closed-test","base":"main","title":"Closed test"}' | jq .number)
api PATCH /repos/ada/sample/pulls/$C -d '{"state":"closed"}' >/dev/null

# PR: merged docs change
put docs/usage USAGE.md 'Usage notes' '# Usage

Run `bun run dev`.
'
M=$(api POST /repos/ada/sample/pulls -d '{"head":"docs/usage","base":"main","title":"Add usage notes"}' | jq .number)
api POST /repos/ada/sample/pulls/$M/merge -d '{"Do":"merge","delete_branch_after_merge":false}' >/dev/null

# Issues
I1=$(api POST /repos/ada/sample/issues -d "$(jq -n --argjson m $V02 --argjson l $BUG '{title:"Login loops when the token expires",body:"Steps: wait an hour, reload.",assignees:["ada"],milestone:$m,labels:[$l]}')" | jq .number)
api POST /repos/ada/sample/issues -d "$(jq -n --argjson m $BL '{title:"Dark mode for the diff view",assignees:["reviewer"],milestone:$m}')" >/dev/null
api POST /repos/ada/sample/issues -d "$(jq -n --argjson m $V02 '{title:"Document the MCP tools",milestone:$m}')" >/dev/null
X=$(rapi POST /repos/ada/sample/issues -d '{"title":"Old idea","body":"Closed on purpose."}' | jq .number)
api PATCH /repos/ada/sample/issues/$X -d '{"state":"closed"}' >/dev/null
api POST /repos/ada/sample/issues/$I1/comments -d '{"body":"Reproduced on 15."}' >/dev/null

# Release and tags
api POST /repos/ada/sample/releases -d '{"tag_name":"v0.1.0","target_commitish":"main","name":"v0.1.0","body":"First release.\n\n- retries\n- docs"}' >/dev/null
RID=$(api GET /repos/ada/sample/releases | jq '.[0].id')
printf 'sample 0.1.0\n' > /tmp/sample-0.1.0.txt
curl -sf -u "ada:$JP" -F attachment=@/tmp/sample-0.1.0.txt "$FJ/api/v1/repos/ada/sample/releases/$RID/assets?name=sample-0.1.0.txt" >/dev/null
api POST /repos/ada/sample/tags -d '{"tag_name":"v0.0.1","target":"feature/api-retries"}' >/dev/null

# Org with a repo
api POST /orgs -d '{"username":"kiwi","full_name":"Kiwi Test Org"}' >/dev/null
api POST /orgs/kiwi/repos -d '{"name":"website","auto_init":true}' >/dev/null
echo seeded
