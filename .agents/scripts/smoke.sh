#!/usr/bin/env bash
# Hits every route against the ada/sample test repo and checks for expected content.
# Run login.sh first. Needs Forgejo on :3000 and `bun run dev` on :5173.
cd "$(dirname "$0")/../tmp"
fail=0
t() {
  local url=$1; shift
  local code; code=$(curl -s -b app.jar -o body.html -w '%{http_code}' "localhost:5173$url")
  local out="$code"
  for p in "$@"; do command grep -qF -- "$p" body.html && out+=" ✓$p" || { out+=" ✗$p"; fail=1; }; done
  printf '%-48s %s\n' "$url" "$out"
}
t /ada/sample 'README.md' 'Pull requests'
t /ada/sample/tree/main/src/routes '..</a>'
t /ada/sample/blob/main/src/lib/server/auth.ts 'class="shiki'
t /ada/sample/blob/main/README.md '<table' 'Source</a>'
t /ada/sample/blob/main/logo.png '<img'
t /ada/sample/blob/main/blob.bin 'Binary file'
t /ada/sample/raw/main/logo.png
t /ada/sample/commits/main '/commit/'
t /ada/sample/tree/feature%2Fapi-retries/src/lib/server 'retry.ts'
t /ada/sample/pulls 'Retry Forgejo API calls'
t '/ada/sample/pulls?state=closed' 'Closed test'
t /ada/sample/pulls/1 'Drop this before merging'
t /ada/sample/pulls/3/files 'retry.ts' '--shiki-dark' 'aria-label="Comment on this line"'
t /ada/sample/pulls/3/commits '/commit/'
exit $fail
