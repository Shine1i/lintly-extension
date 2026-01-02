# Repository Guidelines

## Project Structure & Module Organization
- `entrypoints/` holds WXT extension entrypoints (background service worker, offscreen document, content script UI).
- `lib/` contains shared types, cache helpers, and text positioning utilities used across entrypoints.
- `components/` is split into `components/ui/` (Radix/shadcn-style primitives) and `components/typix/` (feature UI).
- `tests/` contains Bun tests, named `*.test.ts`.
- `public/` contains static assets; generated output lives in `.wxt/` and `.output/`.

## Build, Test, and Development Commands
- `pnpm i` installs dependencies.
- `pnpm dev` runs the WXT dev server with hot reload.
- `pnpm zip` builds a packaged extension zip.
- `pnpm typecheck` runs `tsc --noEmit` via Bun.
- `pnpm lint` runs ESLint over the repo.
- `pnpm test` runs Bun tests in `tests/`.
- Avoid `pnpm build` unless explicitly requested (project rule in `CLAUDE.md`).

## Coding Style & Naming Conventions
- TypeScript + React, ESM modules; follow existing 2-space indentation and formatting.
- Use path alias `@/*` for project-root imports.
- Keep comments minimal and code KISS/DRY; prefer small, focused helpers.
- Test files should end with `.test.ts` and live in `tests/`.

## Testing Guidelines
- Framework: Bun test runner (`bun test`).
- No explicit coverage targets documented; focus on logic-heavy utilities (e.g., `lib/`).
- Run `pnpm test` locally before PRs touching core logic.

## Commit & Pull Request Guidelines
- Commit messages follow short prefixes like `fix:` or `debug:` from recent history; keep them imperative and scoped.
- PRs should include a clear summary, testing notes (commands run), and screenshots/GIFs for UI changes.
- Link related issues or discussions when applicable.

## Agent-Specific Notes
- The offscreen document pattern routes content script messages through background to offscreen; keep message types in `lib/types.ts` aligned.
- Do not add noisy logging unless debugging is requested.
