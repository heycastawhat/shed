#!/usr/bin/env bash
# Exercises the MCP tools that write (open PR, resolve thread) plus diff and read_file, on a throwaway branch/PR in ada/sample.
# Needs Forgejo on :3000 and the dev server on :5173 already running, and loopback access (run unsandboxed). Cleans up after itself.
set -uo pipefail
cd "$(dirname "$0")/../.."
J=.agents/tmp/app.jar; PW=$(cat dev/forgejo/.admin-password); FJ=(-u "ada:$PW" -H 'content-type: application/json')
B=agent/mcp-test-$RANDOM
.agents/scripts/login.sh >/dev/null || exit 1
KEY=$(curl -s -H 'Origin: http://localhost:5173' -b $J -H 'x-sveltekit-action: true' -F name=tools-test -F repos=ada/sample localhost:5173/settings/agents?/create | command grep -oP 'fk_[A-Za-z0-9_-]+' | head -1)
rpc() { curl -s -H "authorization: Bearer $KEY" -H 'content-type: application/json' localhost:5173/mcp -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"$1\",\"arguments\":$2}}" | python3 -c 'import sys,json;r=json.load(sys.stdin)["result"];print(("ERROR: " if r.get("isError") else "")+r["content"][0]["text"])'; }
curl -s -o /dev/null -w "branch: %{http_code}\n" "${FJ[@]}" -X POST localhost:3000/api/v1/repos/ada/sample/contents/mcp-test.txt -d "{\"new_branch\":\"$B\",\"branch\":\"main\",\"message\":\"mcp test\",\"content\":\"$(echo hello | base64)\"}"
echo "--- open_pull_request"; OUT=$(rpc open_pull_request "{\"repo\":\"ada/sample\",\"head\":\"$B\",\"title\":\"MCP tool test (throwaway)\",\"body\":\"Delete me.\"}"); echo "$OUT"
N=$(echo "$OUT" | python3 -c 'import sys,json;print(json.load(sys.stdin)["number"])') || exit 1
echo "--- get_pull_request_diff"; rpc get_pull_request_diff "{\"repo\":\"ada/sample\",\"number\":$N}" | head -n 8
echo "--- read_file";             rpc read_file '{"repo":"ada/sample","path":"README.md"}' | head -n 3
echo "--- read_file at ref";      rpc read_file "{\"repo\":\"ada/sample\",\"path\":\"mcp-test.txt\",\"ref\":\"$B\"}"
echo "--- read_file missing";     rpc read_file '{"repo":"ada/sample","path":"nope.txt"}'
curl -s -o /dev/null -w "inline comment: %{http_code}\n" "${FJ[@]}" -X POST localhost:3000/api/v1/repos/ada/sample/pulls/$N/reviews -d '{"event":"COMMENT","body":"","comments":[{"path":"mcp-test.txt","body":"please fix","new_position":1}]}'
T=$(rpc read_pull_request "{\"repo\":\"ada/sample\",\"number\":$N}" | python3 -c 'import sys,json;t=json.load(sys.stdin)["threads"][0];print(t["thread_id"], t["resolved"])')
echo "--- thread before: $T"
echo "--- resolve_thread"; rpc resolve_thread "{\"repo\":\"ada/sample\",\"number\":$N,\"thread_id\":${T% *}}"
echo "--- thread after: $(rpc read_pull_request "{\"repo\":\"ada/sample\",\"number\":$N}" | python3 -c 'import sys,json;t=json.load(sys.stdin)["threads"][0];print(t["thread_id"], t["resolved"])')"
echo "--- comment_on_line"; rpc comment_on_line "{\"repo\":\"ada/sample\",\"number\":$N,\"path\":\"mcp-test.txt\",\"line\":1,\"body\":\"Nit: add a newline.\"}"
rpc comment_on_line "{\"repo\":\"ada/sample\",\"number\":$N,\"path\":\"mcp-test.txt\",\"line\":0,\"body\":\"x\"}"
rpc comment_on_line "{\"repo\":\"ada/sample\",\"number\":$N,\"path\":\"nope.txt\",\"line\":1,\"body\":\"x\"}"
echo "threads now: $(rpc read_pull_request "{\"repo\":\"ada/sample\",\"number\":$N}" | python3 -c 'import sys,json;print([(t["where"],t["resolved"],len(t["comments"])) for t in json.load(sys.stdin)["threads"]])')"
echo "--- cleanup"
curl -s -o /dev/null -w "delete PR: %{http_code}\n" "${FJ[@]}" -X DELETE localhost:3000/api/v1/repos/ada/sample/issues/$N
curl -s -o /dev/null -w "delete branch: %{http_code}\n" "${FJ[@]}" -X DELETE "localhost:3000/api/v1/repos/ada/sample/branches/$(python3 -c "import urllib.parse;print(urllib.parse.quote('$B',safe=''))")"
