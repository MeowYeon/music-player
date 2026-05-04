# Project Agent Guide

## Environment

- Work in Debian WSL by default.
- Preferred command shape:
  `wsl -d Debian --cd /home/ghp/space/ai/music-backend <command>`
- This worktree is for backend development on branch `backend`.

## Project

- Product name: Ayan / 阿言.
- Backend language: Go.
- Keep the MVP simple and aligned with `design/architecture.md`.
- Do not add database migration tooling, sqlc, desktop shell code, cover art, lyrics, playlists, or realtime file watching in the MVP unless the design is updated first.

## Git

- Keep changes small and commit each complete functional unit.
- Do not modify unrelated frontend worktree files from this backend worktree.

