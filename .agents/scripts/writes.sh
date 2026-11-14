#!/usr/bin/env bash
# Drives forge's write actions (the same form posts the UI makes) against a throwaway PR and issue, then checks Forgejo's state.
# Run login.sh first. Defaults to :5173 against dev/forgejo on :3000; override APP/FJ/FJDIR/JAR for another pair.
# Creates, merges and deletes throwaway branches/PRs/issues in ada/sample, so only point it at a test instance.
set -uo pipefail
APP=${APP:-localhost:5173} FJ=${FJ:-localhost:3000} FJDIR=${FJDIR:-forgejo} JAR=${JAR:-app}
cd "$(dirname "$0")/../tmp"
JP=$(cat ../../dev/$FJDIR/.admin-password) RP=$(cat ../../dev/$FJDIR/.reviewer-password)
R=/repos/ada/sample T=$(date +%s) fail=0
api() { local m=$1 p=$2; shift 2; curl -s -u "ada:$JP" -X "$m" -H 'Content-Type: application/json' "$FJ/api/v1$p" "$@"; }
rapi() { local m=$1 p=$2; shift 2; curl -s -u "reviewer:$RP" -X "$m" -H 'Content-Type: application/json' "$FJ/api/v1$p" "$@"; }
py() { python3 -Ic "import json,sys; d=json.load(sys.stdin); print($1)"; }
# act <path?/action> field=value... → prints the action result type (success/redirect/failure + message)
act() {
	local url=$1; shift
	local args=(-X POST); for f in "$@"; do args+=(--form-string "$f"); done
	[ $# = 0 ] && args+=(-H 'Content-Type: application/x-www-form-urlencoded' --data '')
	curl -s -b $JAR.jar -H "Origin: http://$APP" -H 'x-sveltekit-action: true' -H 'accept: application/json' "${args[@]}" "$APP$url" |
		python3 -Ic "import json,sys; d=json.load(sys.stdin); print(d.get('type'), d.get('status',''), d.get('location','') or '', (d.get('data') or '')[:200] if d.get('type')=='failure' else '')"
}
check() { local name=$1 got=$2 want=$3; [[ "$got" == *"$want"* ]] && echo "ok   $name" || { echo "FAIL $name: got '$got', want '$want'"; fail=1; }; }

# A PR by reviewer (so ada can approve it) and a branch for ada to open from the branches page.
for b in tw-$T-a tw-$T-b; do
	api POST $R/contents/$b.txt -d "{\"content\":\"$(printf 'one\ntwo\nthree\n' | base64 -w0)\",\"message\":\"Throwaway $b\",\"new_branch\":\"$b\"}" >/dev/null
done
A=$(rapi POST $R/pulls -d "{\"head\":\"tw-$T-a\",\"base\":\"main\",\"title\":\"Throwaway $T\"}" | py "d['number']")
P=/ada/sample/pulls/$A

check comment "$(act "$P?/comment" body="hello from writes.sh")" success
check 'line comment' "$(act "$P/files?/comment" path=tw-$T-a.txt line=new:2 body="line note")" success
check 'line comment landed' "$(api GET $R/pulls/$A/reviews | py "len(d)")" 1
check approve "$(act "$P?/approve")" success
check 'approve landed' "$(api GET $R/pulls/$A/reviews | py "[r['state'] for r in d]")" APPROVED
check 'pending review' "$(act "$P/files?/review" event=COMMENT body=summary comments='[{"path":"tw-'$T'-a.txt","line":"new:1","body":"draft"}]')" success
LABEL=$(api GET $R/labels | py "d[0]['id']") MS=$(api GET "$R/milestones?state=open" | py "d[0]['id']")
check label "$(act "$P?/label" id=$LABEL)" success
check 'label landed' "$(api GET $R/issues/$A | py "len(d['labels'])")" 1
check unlabel "$(act "$P?/label" id=$LABEL remove=1)" success
check assign "$(act "$P?/assign" login=ada)" success
check 'assign landed' "$(api GET $R/issues/$A | py "[a['login'] for a in d['assignees'] or []]")" ada
check milestone "$(act "$P?/milestone" id=$MS)" success
check 'milestone landed' "$(api GET $R/issues/$A | py "(d['milestone'] or {}).get('id')")" $MS
check 'edit title' "$(act "$P?/edit" title="Throwaway $T edited")" success
check 'edit body' "$(act "$P?/edit" body="new body")" success
check 'edit landed' "$(api GET $R/issues/$A | py "d['title'] + '|' + d['body']")" "Throwaway $T edited|new body"

STATUS=$(api GET $R/commits/tw-$T-a/status | py "d['state']")
echo "     head status: $STATUS"
if [ "$STATUS" = pending ]; then
	check 'auto-merge' "$(act "$P?/merge" style=merge when_checks_pass=1)" success
	check 'auto-merge scheduled' "$(api GET $R/issues/$A/timeline | py "[e['type'] for e in d or [] if 'scheduled' in e['type']]")" pull_scheduled_merge
	check 'cancel auto-merge' "$(act "$P?/cancelAutoMerge")" success
fi
check merge "$(act "$P?/merge" style=squash delete_branch=1)" success
check 'merge landed' "$(api GET $R/pulls/$A | py "d['merged']")" True

# Open a PR from the branches page, close and reopen it, then delete its branch.
B=$(act "/ada/sample/branches?/openPr" branch=tw-$T-b)
check 'open PR from branches' "$B" redirect
N=$(echo "$B" | command grep -oP 'pulls/\K\d+')
check 'edit PR title' "$(act "/ada/sample/pulls/$N?/edit" title="Throwaway $T b")" success
api PATCH $R/pulls/$N -d '{"state":"closed"}' >/dev/null
check 'delete branch' "$(act "/ada/sample/branches?/delete" branch=tw-$T-b)" success
check 'branch gone' "$(api GET $R/branches/tw-$T-b -o /dev/null -w '%{http_code}')" 404

# New issue, comment, close with comment, reopen.
I=$(act "/ada/sample/issues/new" title="Throwaway issue $T" body="from writes.sh")
check 'new issue' "$I" redirect
I=$(echo "$I" | command grep -oP 'issues/\K\d+')
check 'issue comment' "$(act "/ada/sample/issues/$I?/comment" body="note")" success
check 'close with comment' "$(act "/ada/sample/issues/$I?/state" to=closed body="closing")" success
check 'closed' "$(api GET $R/issues/$I | py "d['state']")" closed
check reopen "$(act "/ada/sample/issues/$I?/state" to=open)" success
check 'reopened' "$(api GET $R/issues/$I | py "d['state']")" open
api PATCH $R/issues/$I -d '{"state":"closed"}' >/dev/null
exit $fail
