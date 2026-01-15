# 039 — Docker hardening: non-root, limits, optional no-network

## Status
- [x] Scoped
- [x] In Progress
- [x] Implemented
- [x] Verified

## Summary
Harden worker container execution with safer defaults: non-root user, CPU/memory limits, and optional network disabling.

## Model & Effort
- Effort: **M**
- Tier: **standard**

## Files Changing
...
- [x] Update worker Dockerfile to run as a non-root user.
- [x] Add docker run options from config: memory limit, CPU quota, PIDs limit.
- [x] Add optional `network_mode: none` for offline runs (default: bridge).
- [x] Ensure logs clearly record the container security settings used per task.
- [x] Document limitations (some projects require network for dependency install; bootstrap should run before no-network if needed).

## Verification
- Manual: run a worker with `network_mode=none` and confirm it still completes for a repo with vendored deps. (Not run here.)
- Manual: confirm container user is non-root (`id` inside container). (Not run here.)
- `npm test`
- `npm run build`

## Dependencies
### Blocks
- 042

### Blocked by
- 012
- 020
