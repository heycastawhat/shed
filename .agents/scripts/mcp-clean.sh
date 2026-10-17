#!/usr/bin/env bash
# Revokes the throwaway keys the mcp*.sh test scripts leave behind (by name). Same requirements as mcp-tools.sh.
cd "$(dirname "$0")/../.."

.agents/scripts/login.sh >/dev/null || exit 1

python3 - <<'EOF'
import json, subprocess
d = json.load(open('data/forge.json'))
test = {'test-agent', 'write-test', 'tools-test', 'ask-test', 'rules-test', 'hdr-test', 'rules-test renamed', 'other', 'Claude Code · laptop'}
for k in d['keys']:
    if k['name'] in test:
        out = subprocess.run(['curl', '-s', '-H', 'Origin: http://localhost:5173', '-H', 'x-sveltekit-action: true', '-b', '.agents/tmp/app.jar',
                              '-F', f"id={k['id']}", 'localhost:5173/settings/agents?/revoke'], capture_output=True, text=True).stdout
        print('revoked', k['name'], out[:30])
EOF
