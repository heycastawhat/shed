#!/usr/bin/env bash
# Seeds demo state in ada/sample (pin, pushed branch, review request, agent request), runs a headless-browser tour
# (screenshots in .agents/tmp/shell-*.png) and removes everything again. Needs Forgejo :3000 and the dev server :5173, unsandboxed.
set -uo pipefail
cd "$(dirname "$0")/../.."
J=.agents/tmp/app.jar; API=localhost:3000/api/v1/repos/ada/sample
JS=(-u "ada:$(cat dev/forgejo/.admin-password)" -H 'content-type: application/json')
RV=(-u "reviewer:$(cat dev/forgejo/.reviewer-password)" -H 'content-type: application/json')
AO=(-H 'Origin: http://localhost:5173' -H 'x-sveltekit-action: true' -b $J)
S=$RANDOM
.agents/scripts/login.sh >/dev/null || exit 1
b64() { printf '%s' "$1" | base64 -w0; }
file() { local name=$1 br=$2 msg=$3; shift 3; curl -s -o /dev/null "$@" -X POST $API/contents/$name -d "{\"new_branch\":\"$br\",\"branch\":\"main\",\"message\":\"$msg\",\"content\":\"$(b64 x)\"}"; }

curl -s -o /dev/null -b $J -H 'Origin: http://localhost:5173' -F repo=ada/sample -F pin=1 localhost:5173/pin
file demo-$S.txt feature/demo-push-$S "Add the demo file" "${JS[@]}"
file rev-$S.txt reviewer/typo-$S "Fix a typo" "${RV[@]}"
N=$(curl -s "${RV[@]}" -X POST $API/pulls -d "{\"head\":\"reviewer/typo-$S\",\"base\":\"main\",\"title\":\"Fix a typo in the docs (demo)\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["number"])')
curl -s -o /dev/null -w "request review: %{http_code}\n" "${RV[@]}" -X POST $API/pulls/$N/requested_reviewers -d '{"reviewers":["ada"]}'
KEY=$(curl -s "${AO[@]}" -F name="Claude Code · laptop" -F repos=ada/sample -F ask=comment_on_pull_request localhost:5173/settings/agents?/create | command grep -oP 'fk_[A-Za-z0-9_-]+' | head -1)
curl -s -o /dev/null -H "authorization: Bearer $KEY" -H 'content-type: application/json' localhost:5173/mcp -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"comment_on_pull_request","arguments":{"repo":"ada/sample","number":7,"body":"Looks good to me"}}}'

bun .agents/tmp/shell-tour.ts; echo "tour exit: $?"

echo "--- cleanup"
for n in $(curl -s "${JS[@]}" "$API/pulls?state=all" | python3 -c 'import sys,json;[print(p["number"]) for p in json.load(sys.stdin) if "(demo)" in p["title"]]'); do curl -s -o /dev/null -w "delete PR $n: %{http_code}\n" "${JS[@]}" -X DELETE $API/issues/$n; done
for br in feature%2Fdemo-push-$S reviewer%2Ftypo-$S; do curl -s -o /dev/null -w "delete $br: %{http_code}\n" "${JS[@]}" -X DELETE "$API/branches/$br"; done
curl -s -o /dev/null -b $J -H 'Origin: http://localhost:5173' -F repo=ada/sample -F pin=0 localhost:5173/pin
python3 - <<'EOF'
import json, subprocess
for a in json.load(open('data/forge.json'))['approvals']:
    if a['status'] == 'pending':
        subprocess.run(['curl','-s','-o','/dev/null','-H','Origin: http://localhost:5173','-H','x-sveltekit-action: true','-b','.agents/tmp/app.jar','-F',f"id={a['id']}",'localhost:5173/?/deny'])
EOF
bash .agents/scripts/mcp-clean.sh >/dev/null
