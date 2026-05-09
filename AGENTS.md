# Project Agent Guide

## Environment

- Codex already runs inside the target development environment.
- Run commands directly from the project root: `/home/ghp/space/ai/music`.

## Project

- Product name: 聆听.
- Backend language: Go.
- Frontend code lives in `web/`.
- v0.5 closed the MVP phase. v0.6 starts the mature product direction.
- Current architecture source of truth: `docs/design/architecture.md`.
- Project memory and documentation map: `docs/memory.md` and `docs/README.md`.

## Dev services

- Start services with `npm run services:start`.
- Stop services with `npm run services:stop`.
- Check services with `npm run services:status`.
