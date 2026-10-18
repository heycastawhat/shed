FROM oven/bun:1.3 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
# SvelteKit 3 validates env vars while analysing routes; they're read again at runtime, not baked in.
RUN FORGEJO_URL=http://build FORGEJO_CLIENT_ID=- FORGEJO_CLIENT_SECRET=- FORGE_SECRET=- bun --bun run build

FROM oven/bun:1.3
ARG AGENTS=claude
RUN apt-get update && apt-get install -y --no-install-recommends git openssh-client ca-certificates libatomic1 && rm -rf /var/lib/apt/lists/* \
	&& { command -v node || ln -s "$(command -v bun)" /usr/local/bin/node; }
WORKDIR /opt/agents
RUN case "$AGENTS" in claude) p=@anthropic-ai/claude-code ;; codex) p=@openai/codex ;; both) p='@anthropic-ai/claude-code @openai/codex' ;; *) echo "AGENTS must be claude, codex or both" >&2; exit 1 ;; esac \
	&& echo '{}' > package.json && bun add t3@0.1.0 $p \
	&& ln -s /opt/agents/node_modules/@t3code/t3-linux-*/t3 /usr/local/bin/t3
ENV PATH=$PATH:/opt/agents/node_modules/.bin

WORKDIR /app
COPY --from=build /app/build build
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/
RUN mkdir -p /data /home/bun/.t3/projects /home/bun/.claude /home/bun/.codex && chown -R bun:bun /data /home/bun
USER bun
RUN git config --global credential.helper 'store --file /home/bun/.t3/git-credentials'
ENV NODE_ENV=production PORT=3000 FORGE_DATA=/data CLAUDE_CONFIG_DIR=/home/bun/.claude
EXPOSE 3000
ENTRYPOINT ["docker-entrypoint.sh"]
