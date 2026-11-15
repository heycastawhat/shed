#!/usr/bin/env bash
# Agent keys and /mcp end to end against Shed: create keys in Settings → Agents, call every tool, the approval queue, opt-in merge and repo scope.
# Needs the dev server on :5173 and .agents/tmp/shed.jar (a shed_session cookie line, see NOTES). JT: a ada API token for setup and checks.
set -uo pipefail
cd "$(dirname "$0")/.."
APP=localhost:5173 R=/repos/ada/sample T=$(date +%s) fail=0
AO=(-H "Origin: http://$APP" -H 'x-sveltekit-action: true' -b tmp/shed.jar)
a() { local m=$1 p=$2; shift 2; curl -s -u "ada:$JT" -X "$m" -H 'Content-Type: application/json' "$APP/api/v1$p" "$@"; }
py() { python3 -Ic "import json,sys; d=json.load(sys.stdin); print($1)"; }
check() { [[ "$2" == *"$3"* ]] && echo "ok   $1" || { echo "FAIL $1: got '${2:0:200}', want '$3'"; fail=1; }; }
key() { curl -s "${AO[@]}" "$@" "$APP/settings/agents?/create" | command grep -oP 'fk_[A-Za-z0-9_-]+' | head -1; }
call() { curl -s -H "authorization: Bearer $KEY" -H 'content-type: application/json' $APP/mcp -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"$1\",\"arguments\":$2}}" |
	python3 -Ic 'import sys,json;r=json.load(sys.stdin).get("result") or {};print(("ERROR: " if r.get("isError") else "")+((r.get("content") or [{}])[0].get("text","")))'; }

KEY=$(key -F name=shed-mcp-$T -F repos=ada/sample -F ask=open_pull_request)
check 'key made' "$KEY" fk_
check 'no key refused' "$(curl -s -o /dev/null -w '%{http_code}' $APP/mcp -d '{"jsonrpc":"2.0","id":1,"method":"ping"}')" 401
check 'tools listed' "$(curl -s -H "authorization: Bearer $KEY" -H 'content-type: application/json' $APP/mcp -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}')" read_pull_request
check 'no merge tool by default' "$(curl -s -H "authorization: Bearer $KEY" -H 'content-type: application/json' $APP/mcp -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | command grep -c merge_pull_request)" 0
check 'list repos' "$(call list_repositories '{}')" ada/sample
check 'list PRs' "$(call list_pull_requests '{"repo":"ada/sample","state":"all"}')" '"number"'
check 'read PR' "$(call read_pull_request '{"repo":"ada/sample","number":1}')" 'Retry Forgejo API calls'
check 'diff' "$(call get_pull_request_diff '{"repo":"ada/sample","number":1}')" 'retry'
check 'read file' "$(call read_file '{"repo":"ada/sample","path":"README.md"}')" sample
check 'other repo refused' "$(call list_pull_requests '{"repo":"kiwi/website"}')" ERROR
check 'rules' "$(call get_rules '{"repo":"ada/sample"}')" ''

# A throwaway branch and PR to write on.
a POST $R/contents/mcp-$T.txt -d "{\"content\":\"$(printf 'a\nb\n' | base64 -w0)\",\"message\":\"mcp test\",\"new_branch\":\"agent/mcp-$T\"}" >/dev/null
# New keys ask before opening PRs: the call is queued until approved in Settings → Agents.
OUT=$(call open_pull_request "{\"repo\":\"ada/sample\",\"head\":\"agent/mcp-$T\",\"title\":\"MCP test $T (throwaway)\"}")
REQ=$(echo "$OUT" | command grep -oP 'as request \K[0-9a-f]{8}')
check 'open PR queued' "$OUT" 'request'
check 'approve' "$(curl -s "${AO[@]}" -F id=$REQ "$APP/settings/agents?/approve")" success
check 'request done' "$(call check_request "{\"id\":\"$REQ\"}")" ''
N=$(a GET "$R/pulls?state=open&limit=100" | py "[p['number'] for p in d if p['title'] == 'MCP test $T (throwaway)'][0]")
check 'PR opened' "$N" ''
check 'PR signed' "$(a GET $R/pulls/$N | py "d['body']")" 'via forge'
check 'comment' "$(call comment_on_pull_request "{\"repo\":\"ada/sample\",\"number\":$N,\"body\":\"agent note\"}")" ''
check 'comment landed' "$(a GET $R/issues/$N/comments | py "d[-1]['body']")" 'agent note'
check 'line comment' "$(call comment_on_line "{\"repo\":\"ada/sample\",\"number\":$N,\"path\":\"mcp-$T.txt\",\"line\":2,\"body\":\"why b\"}")" ''
TID=$(a GET $R/pulls/$N/comments | py "d[0]['id']")
check 'reply' "$(call reply_to_thread "{\"repo\":\"ada/sample\",\"number\":$N,\"thread_id\":$TID,\"body\":\"because\"}")" ''
check 'two in thread' "$(a GET $R/pulls/$N/comments | py "len(d)")" 2
check 'resolve' "$(call resolve_thread "{\"repo\":\"ada/sample\",\"number\":$N,\"thread_id\":$TID}")" ''
check 'resolved' "$(a GET $R/pulls/$N/comments | py "d[0]['resolver'] and d[0]['resolver']['login']")" ada
check 'merge not offered' "$(call merge_pull_request "{\"repo\":\"ada/sample\",\"number\":$N}")" ERROR

# A key allowed to merge, which asks first: queued, then merged on approval.
KEY=$(key -F name=shed-mcp-merge-$T -F repos=ada/sample -F allow=merge_pull_request -F ask=merge_pull_request)
OUT=$(call merge_pull_request "{\"repo\":\"ada/sample\",\"number\":$N,\"style\":\"squash\",\"delete_branch\":true}")
REQ=$(echo "$OUT" | command grep -oP 'as request \K[0-9a-f]{8}')
check 'merge queued' "$OUT" request
curl -s "${AO[@]}" -F id=$REQ "$APP/settings/agents?/approve" >/dev/null
check 'merged' "$(a GET $R/pulls/$N | py "d['merged']")" True
exit $fail
