#!/bin/bash
set -e
t3dir=$HOME/.t3
port=${T3_PORT:-3773}

t3 serve --no-browser --host "${T3_HOST:-127.0.0.1}" --port "$port" --base-dir "$t3dir" "$t3dir/projects" &
until bun -e "await fetch('http://127.0.0.1:$port')" 2>/dev/null; do kill -0 $! || exit 1; sleep 1; done

# forge's built-in host is always this bundled T3, so it gets its own long-lived token, minted once.
[ -s "$t3dir/forge-token" ] || t3 auth session issue --base-dir "$t3dir" --scope orchestration:read --scope orchestration:operate --scope source-control:write \
	--label forge --ttl 3650d --token-only > "$t3dir/forge-token"
export T3_URL=http://127.0.0.1:$port T3_TOKEN=$(cat "$t3dir/forge-token")

bun build/index.js &
trap 'kill $(jobs -p) 2>/dev/null' TERM INT
wait -n
