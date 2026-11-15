#!/usr/bin/env bash
# Merge styles, auto-merge on a status, revisions on push, and thread resolution, through Shed's API. JT/RT: ada/reviewer tokens.
set -uo pipefail
APP=${APP:-localhost:5173} R=/repos/ada/sample T=$(date +%s) fail=0
a() { local m=$1 p=$2; shift 2; curl -s -u "ada:$JT" -X "$m" -H 'Content-Type: application/json' "$APP/api/v1$p" "$@"; }
r() { local m=$1 p=$2; shift 2; curl -s -u "reviewer:$RT" -X "$m" -H 'Content-Type: application/json' "$APP/api/v1$p" "$@"; }
py() { python3 -Ic "import json,sys; d=json.load(sys.stdin); print($1)"; }
check() { [[ "$2" == *"$3"* ]] && echo "ok   $1" || { echo "FAIL $1: got '$2', want '$3'"; fail=1; }; }
file() { a POST $R/contents/$2 -d "{\"content\":\"$(printf "$3" | base64 -w0)\",\"message\":\"$2\",\"${4:-new_branch}\":\"$1\"}" >/dev/null; }
pr() { r POST $R/pulls -d "{\"head\":\"$1\",\"base\":\"main\",\"title\":\"$2\"}" | py "d['number']"; }

for style in merge squash rebase rebase-merge fast-forward-only; do
	b=m$T-$style; file $b $b.txt "x\n"
	n=$(pr $b "Merge $style $T")
	a POST $R/pulls/$n/merge -d "{\"Do\":\"$style\",\"delete_branch_after_merge\":true}" >/dev/null
	check "merge $style" "$(a GET $R/pulls/$n | py "d['merged']")" True
	check "branch deleted ($style)" "$(a GET $R/branches/$b -o /dev/null -w '%{http_code}')" 404
	check "on main ($style)" "$(a GET "$R/contents/$b.txt?ref=main" | py "d['name']")" $b.txt
done

# Conflicts: two branches change the same new file differently; after one merges the other can't.
file c$T-1 conflict-$T.txt "one\n"; file c$T-2 conflict-$T.txt "two\n"
n1=$(pr c$T-1 "Conflict A $T"); n2=$(pr c$T-2 "Conflict B $T")
a POST $R/pulls/$n1/merge -d '{"Do":"merge"}' >/dev/null
check 'conflict detected' "$(a GET $R/pulls/$n2 | py "d['mergeable']")" False
check 'conflict refused' "$(a POST $R/pulls/$n2/merge -d '{"Do":"merge"}' | py "d['message']")" conflicts

# Auto-merge: a pending status, schedule, then success merges it. It merges into a throwaway base without the repo's workflows,
# so only the status set below decides (and main keeps its CI).
for w in $(a GET "$R/contents/.forgejo/workflows?ref=main" | py "' '.join(x['path'] for x in d) if isinstance(d, list) else ''"); do
	a DELETE $R/contents/$w -d "{\"branch\":\"main\",\"new_branch\":\"amb$T\"}" >/dev/null 2>&1 || a DELETE $R/contents/$w -d "{\"branch\":\"amb$T\"}" >/dev/null
done
a GET $R/branches/amb$T -o /dev/null -w '%{http_code}' | command grep -q 200 || a POST $R/branches -d "{\"new_branch_name\":\"amb$T\",\"old_ref_name\":\"main\"}" >/dev/null
a POST $R/contents/am-$T.txt -d "{\"content\":\"YQo=\",\"message\":\"am\",\"branch\":\"amb$T\",\"new_branch\":\"am$T\"}" >/dev/null
n=$(r POST $R/pulls -d "{\"head\":\"am$T\",\"base\":\"amb$T\",\"title\":\"Auto $T\"}" | py "d['number']")
sha=$(a GET $R/pulls/$n | py "d['head']['sha']")
a POST $R/statuses/$sha -d '{"context":"ci / test","state":"pending"}' >/dev/null
a POST $R/pulls/$n/merge -d '{"Do":"squash","merge_when_checks_succeed":true}' >/dev/null
check 'scheduled' "$(a GET $R/pulls/$n | py "d['auto_merge']['style']")" squash
check 'not yet merged' "$(a GET $R/pulls/$n | py "d['merged']")" False
a POST $R/statuses/$sha -d '{"context":"ci / test","state":"success"}' >/dev/null
# The repo's own CI (if a runner is up) adds checks too; the merge waits for all of them.
for i in $(seq 60); do [ "$(a GET $R/pulls/$n | py "d['merged']")" = True ] && break; sleep 2; done
check 'merged on success' "$(a GET $R/pulls/$n | py "d['merged']")" True

# Revisions: a push to the head adds one, and a comment on the old head shows as outdated in its hunk.
file rv$T rv-$T.txt "a\nb\n"; n=$(pr rv$T "Revisions $T")
a POST $R/pulls/$n/reviews -d "{\"event\":\"COMMENT\",\"body\":\"\",\"comments\":[{\"path\":\"rv-$T.txt\",\"new_position\":2,\"body\":\"why b?\"}]}" >/dev/null
sha=$(a GET "$R/contents/rv-$T.txt?ref=rv$T" | py "d['sha']")
a PUT $R/contents/rv-$T.txt -d "{\"content\":\"$(printf 'a\nc\n' | base64 -w0)\",\"message\":\"c\",\"branch\":\"rv$T\",\"sha\":\"$sha\"}" >/dev/null; sleep 1
check 'two revisions' "$(a GET $R/pulls/$n/revisions | py "len(d)")" 2
cid=$(a GET $R/pulls/$n/comments | py "d[0]['id']")
check 'stale review' "$(a GET $R/pulls/$n/reviews | py "d[0]['stale']")" True
a POST $R/pulls/comments/$cid/resolve >/dev/null
check 'resolved' "$(a GET $R/pulls/$n/comments | py "d[0]['resolver']['login']")" ada
a DELETE $R/pulls/comments/$cid/resolve >/dev/null
check 'unresolved' "$(a GET $R/pulls/$n/comments | py "d[0]['resolver']")" None
check 'own approve refused' "$(r POST $R/pulls/$n/reviews -d '{"event":"APPROVED"}' | py "d['message']")" "own pull request"
check 'stale edit refused' "$(a PUT $R/contents/rv-$T.txt -d "{\"content\":\"eA==\",\"branch\":\"rv$T\",\"sha\":\"$sha\"}" | py "d['message']")" changed

# Branch protection: needs an approval.
a POST $R/branch_protections -d '{"rule_name":"main","required_approvals":1}' >/dev/null
file bp$T bp-$T.txt "a\n"; n=$(pr bp$T "Protected $T")
check 'blocked without approval' "$(a POST $R/pulls/$n/merge -d '{"Do":"merge"}' | py "d['message']")" approval
a POST $R/pulls/$n/reviews -d '{"event":"APPROVED"}' >/dev/null
a POST $R/pulls/$n/merge -d '{"Do":"merge"}' >/dev/null
check 'merged after approval' "$(a GET $R/pulls/$n | py "d['merged']")" True
a DELETE $R/branch_protections/main >/dev/null
# Close what's still open, which also cancels its CI.
for t in "Conflict B $T" "Revisions $T"; do
	m=$(a GET "$R/pulls?state=open&limit=100" | py "[p['number'] for p in d if p['title'] == '$t'][0]")
	a PATCH $R/pulls/$m -d '{"state":"closed"}' >/dev/null
done
exit $fail
