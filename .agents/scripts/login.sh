#!/usr/bin/env bash
# Logs curl cookie jars into the app via the real Forgejo OAuth flow (incl. consent screen).
# Writes .agents/tmp/app.jar (app session) and fj.jar (Forgejo session).
# Forgejo may or may not render _csrf fields (it also checks Origin), so the token is optional.
set -euo pipefail
csrf() { command grep -oP 'name="_csrf" value="\K[^"]+' | head -1 || true; }
O=(-H 'Origin: http://localhost:3000')
cd "$(dirname "$0")/.." && mkdir -p tmp && cd tmp
# Reuse a session that still works, so test runs don't pile up sign-ins on Settings → Account. FRESH=1 forces a new one.
if [ -z "${FRESH:-}" ] && [ -f app.jar ] && [ "$(curl -s -b app.jar -o /dev/null -w '%{http_code}' localhost:5173/settings/account)" = 200 ]; then
  echo "logged in (reused): $(pwd)/app.jar"; exit 0
fi
rm -f fj.jar app.jar
PW=$(cat ../../dev/forgejo/.admin-password)
CSRF=$(curl -s -c fj.jar localhost:3000/user/login | csrf)
curl -s "${O[@]}" -b fj.jar -c fj.jar -o /dev/null localhost:3000/user/login --data-urlencode "_csrf=$CSRF" --data-urlencode user_name=ada --data-urlencode "password=$PW"
AUTH=$(curl -s -c app.jar -o /dev/null -w '%{redirect_url}' localhost:5173/login)
PAGE=$(curl -s -b fj.jar -c fj.jar "$AUTH")
LOC=$(curl -s -b fj.jar -o /dev/null -w '%{redirect_url}' "$AUTH")
if [ -z "$LOC" ]; then
  CSRF=$(echo "$PAGE" | csrf)
  ARGS=(); while IFS= read -r l; do ARGS+=(--data-urlencode "$l"); done < <(echo "$PAGE" | command grep -oP '<input type="hidden" name="\K[^"]+" value="[^"]*' | command grep -v _csrf | sed 's/" value="/=/; s/&amp;/\&/g')
  LOC=$(curl -s "${O[@]}" -b fj.jar -o /dev/null -w '%{redirect_url}' localhost:3000/login/oauth/grant --data-urlencode "_csrf=$CSRF" "${ARGS[@]}" --data-urlencode granted=true)
fi
curl -s -b app.jar -c app.jar -o /dev/null "$LOC"
command grep -q forge_session app.jar && echo "logged in: $(pwd)/app.jar" || { echo "login FAILED"; exit 1; }
