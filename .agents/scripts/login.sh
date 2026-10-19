#!/usr/bin/env bash
# Logs curl cookie jars into the app via the real Forgejo OAuth flow (incl. consent screen).
# Writes .agents/tmp/app.jar (app session) and fj.jar (Forgejo session).
# For the Forgejo 15 instance: APP=localhost:5174 FJ=localhost:3001 FJDIR=forgejo15 JAR=app15 (writes app15.jar, fj15.jar).
# Forgejo may or may not render _csrf fields (it also checks Origin), so the token is optional.
set -euo pipefail
csrf() { command grep -oP 'name="_csrf" value="\K[^"]+' | head -1 || true; }
APP=${APP:-localhost:5173} FJ=${FJ:-localhost:3000} FJDIR=${FJDIR:-forgejo} JAR=${JAR:-app}
O=(-H "Origin: http://$FJ")
cd "$(dirname "$0")/.." && mkdir -p tmp && cd tmp
# Reuse a session that still works, so test runs don't pile up sign-ins on Settings → Account. FRESH=1 forces a new one.
if [ -z "${FRESH:-}" ] && [ -f $JAR.jar ] && [ "$(curl -s -b $JAR.jar -o /dev/null -w '%{http_code}' $APP/settings/account)" = 200 ]; then
  echo "logged in (reused): $(pwd)/$JAR.jar"; exit 0
fi
FJJAR=fj${JAR#app}.jar
rm -f $FJJAR $JAR.jar
PW=$(cat ../../dev/$FJDIR/.admin-password)
CSRF=$(curl -s -c $FJJAR $FJ/user/login | csrf)
curl -s "${O[@]}" -b $FJJAR -c $FJJAR -o /dev/null $FJ/user/login --data-urlencode "_csrf=$CSRF" --data-urlencode user_name=ada --data-urlencode "password=$PW"
AUTH=$(curl -s -c $JAR.jar -o /dev/null -w '%{redirect_url}' $APP/login)
PAGE=$(curl -s -b $FJJAR -c $FJJAR "$AUTH")
LOC=$(curl -s -b $FJJAR -o /dev/null -w '%{redirect_url}' "$AUTH")
if [ -z "$LOC" ]; then
  CSRF=$(echo "$PAGE" | csrf)
  ARGS=(); while IFS= read -r l; do ARGS+=(--data-urlencode "$l"); done < <(echo "$PAGE" | command grep -oP '<input type="hidden" name="\K[^"]+" value="[^"]*' | command grep -v _csrf | sed 's/" value="/=/; s/&amp;/\&/g')
  LOC=$(curl -s "${O[@]}" -b $FJJAR -o /dev/null -w '%{redirect_url}' $FJ/login/oauth/grant --data-urlencode "_csrf=$CSRF" "${ARGS[@]}" --data-urlencode granted=true)
fi
curl -s -b $JAR.jar -c $JAR.jar -o /dev/null "$LOC"
command grep -q forge_session $JAR.jar && echo "logged in: $(pwd)/$JAR.jar" || { echo "login FAILED"; exit 1; }
