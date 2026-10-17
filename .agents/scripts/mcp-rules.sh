#!/usr/bin/env bash
# Repo rules (.forge/agents.json): branch prefix, protected paths, ask, deny, and an invalid file failing closed.
# Temporarily commits the rules file to ada/sample's main and removes it again. Same requirements as mcp-tools.sh.
set -uo pipefail
cd "$(dirname "$0")/../.."
J=.agents/tmp/app.jar; PW=$(cat dev/forgejo/.admin-password); FJ=(-u "ada:$PW" -H 'content-type: application/json'); AO=(-H 'Origin: http://localhost:5173' -H 'x-sveltekit-action: true' -b $J)
API=localhost:3000/api/v1/repos/ada/sample
.agents/scripts/login.sh >/dev/null || exit 1
KEY=$(curl -s "${AO[@]}" -F name=rules-test -F repos=ada/sample localhost:5173/settings/agents?/create | command grep -oP 'fk_[A-Za-z0-9_-]+' | head -1)
rpc() { curl -s -H "authorization: Bearer $KEY" -H 'content-type: application/json' localhost:5173/mcp -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"$1\",\"arguments\":$2}}" | python3 -c 'import sys,json;r=json.load(sys.stdin)["result"];print(("ERROR: " if r.get("isError") else "")+r["content"][0]["text"])'; }
b64() { printf '%s' "$1" | base64 -w0; }
file() { curl -s -o /dev/null "${FJ[@]}" -X POST $API/contents/$1 -d "{\"new_branch\":\"$2\",\"branch\":\"main\",\"message\":\"t\",\"content\":\"$(b64 x)\"}"; }
S=$RANDOM
setrules() { # $1 = file body; creates or updates on main
  SHA=$(curl -s "${FJ[@]}" "$API/contents/.forge/agents.json?ref=main" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("sha",""))')
  if [ -n "$SHA" ]; then curl -s -o /dev/null "${FJ[@]}" -X PUT $API/contents/.forge/agents.json -d "{\"sha\":\"$SHA\",\"branch\":\"main\",\"message\":\"rules\",\"content\":\"$(b64 "$1")\"}"
  else curl -s -o /dev/null "${FJ[@]}" -X POST $API/contents/.forge/agents.json -d "{\"branch\":\"main\",\"message\":\"rules\",\"content\":\"$(b64 "$1")\"}"; fi
}
setrules '{"branchPrefix":"agent/","protectedPaths":["**/*.lock",".forgejo/workflows/**"],"ask":["comment_on_pull_request"],"deny":["resolve_thread"]}'
file docs-$S.txt agent/docs-$S; file .forgejo/workflows/ci.yml agent/ci-$S; file lock/x.lock agent/lock-$S; file stray-$S.txt feature/stray-$S
echo "--- get_rules";                 rpc get_rules '{"repo":"ada/sample"}' | tr -d '\n '; echo
echo "--- wrong branch prefix";       rpc open_pull_request "{\"repo\":\"ada/sample\",\"head\":\"feature/stray-$S\",\"title\":\"Rules test stray (throwaway)\"}"
echo "--- harmless paths -> opens";   rpc open_pull_request "{\"repo\":\"ada/sample\",\"head\":\"agent/docs-$S\",\"title\":\"Rules test docs (throwaway)\"}" | tr -d '\n '; echo
echo "--- workflow file -> queued";   rpc open_pull_request "{\"repo\":\"ada/sample\",\"head\":\"agent/ci-$S\",\"title\":\"Rules test ci (throwaway)\"}"
echo "--- nested lockfile -> queued"; rpc open_pull_request "{\"repo\":\"ada/sample\",\"head\":\"agent/lock-$S\",\"title\":\"Rules test lock (throwaway)\"}"
echo "--- repo asks for comments";    rpc comment_on_pull_request '{"repo":"ada/sample","number":7,"body":"x"}'
echo "--- resolve_thread denied";     rpc resolve_thread '{"repo":"ada/sample","number":7,"thread_id":59}'
echo "--- invalid file fails closed"; setrules '{ nope'; rpc comment_on_pull_request '{"repo":"ada/sample","number":7,"body":"x"}'; echo "reads still work: $(rpc list_pull_requests '{"repo":"ada/sample","state":"closed"}' | head -c 20)"
echo "--- cleanup"
SHA=$(curl -s "${FJ[@]}" "$API/contents/.forge/agents.json?ref=main" | python3 -c 'import sys,json;print(json.load(sys.stdin)["sha"])')
curl -s -o /dev/null -w "rules file: %{http_code}\n" "${FJ[@]}" -X DELETE $API/contents/.forge/agents.json -d "{\"sha\":\"$SHA\",\"branch\":\"main\",\"message\":\"remove rules\"}"
for n in $(curl -s "${FJ[@]}" "$API/pulls?state=all" | python3 -c 'import sys,json;[print(p["number"]) for p in json.load(sys.stdin) if "Rules test" in p["title"]]'); do curl -s -o /dev/null -w "delete PR $n: %{http_code}\n" "${FJ[@]}" -X DELETE $API/issues/$n; done
for b in agent/docs-$S agent/ci-$S agent/lock-$S feature/stray-$S; do curl -s -o /dev/null -w "delete $b: %{http_code}\n" "${FJ[@]}" -X DELETE "$API/branches/${b/\//%2F}"; done
python3 - <<'EOF'
import json, subprocess
for a in json.load(open('data/forge.json'))['approvals']:
    if a['status'] == 'pending':
        subprocess.run(['curl','-s','-o','/dev/null','-H','Origin: http://localhost:5173','-H','x-sveltekit-action: true','-b','.agents/tmp/app.jar','-F',f"id={a['id']}",'localhost:5173/settings/agents?/deny'])
        print('denied leftover', a['id'], a['tool'], a.get('reason'))
EOF
