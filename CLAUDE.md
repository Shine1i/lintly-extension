# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Typix is a Chrome extension that provides AI-powered writing assistance (grammar, spelling, style corrections) using WXT framework with React. It uses an offscreen document pattern to run API calls in a separate context.

## Commands

- `pnpm dev` - Start development mode with hot reload
- `pnpm typecheck` - Run TypeScript type checking
- `pnpm lint` - Run ESLint
- `pnpm test` - Run tests with Bun
- Never run `pnpm build` (per project rules)

## Architecture

### Extension Structure (WXT Framework)
- `entrypoints/background.ts` - Service worker that routes messages between content script and offscreen document, with caching via `ExtensionQueryClient`
- `entrypoints/offscreen/main.ts` - Offscreen document that handles API calls to the AI model endpoint, processes text sentence-by-sentence in parallel
- `entrypoints/content/` - Content script with React UI injected via shadow DOM

### Message Flow
1. Content script sends `PROCESS_TEXT` messages to background
2. Background forwards as `GENERATE` messages to offscreen document
3. Offscreen calls external API (`vllm.kernelvm.xyz`) and returns results
4. Types defined in `lib/types.ts`: `Action`, `ProcessRequest`, `OffscreenMessage`, `AnalyzeResult`

### Key Directories
- `lib/` - Shared utilities, types, hooks, and state management (Jotai)
- `lib/textPositioning/` - Text manipulation, editor detection, issue highlighting
- `lib/cache/` - Query caching for ML model responses
- `components/ui/` - Shadcn-style Radix UI components
- `components/typix/` - Feature components (modals, overlays, toolbars)

### Content Script UI
Uses shadow DOM isolation via `createShadowRootUi`. The `ShadowDOMProvider` context provides access to the shadow root for styling. Text positioning relies on mirror elements for accurate overlay placement.

## Code Style

- Prioritize KISS and DRY
- Minimal comments
- Path alias: `@/*` maps to project root
