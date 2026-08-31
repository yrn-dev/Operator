# Changelog

All notable changes to **operator** are documented here.

## [Unreleased]

### Added
- Core `enable_notifications` config option (default `false`) for opt-in notifications.
- `searchItems` helper with edge-case handling for empty queries, non-string input, regex metacharacters, and result truncation.

## [0.81.0] - 2026-07

Initial release of `operator` — a terminal AI coding agent for development,
supporting Alem AI + local Ollama as model providers.

### Added
- Alem AI (`llm.alem.ai`) and local Ollama as model providers.
- Simplified system prompt and a beginner-friendly tool set.
- Session export/import, model switching, persistent memory.

### Notes
- Built on the operator-core / operator-ai / operator-tui runtime packages.
