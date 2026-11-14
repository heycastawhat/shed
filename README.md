# forge

A faster UI for [Forgejo](https://forgejo.org), with better code review and coding agents built in. Forgejo stays the backend (git, auth, CI); forge only talks to its REST API.

- Develop: see "Running locally" in [.agents/NOTES.md](.agents/NOTES.md). A fresh local Forgejo can be seeded with `.agents/scripts/seed.sh`.
- Deploy: [DEPLOY.md](DEPLOY.md).
- Check: `bun run check && bun run test`.
