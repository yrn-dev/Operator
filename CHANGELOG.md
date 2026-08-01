# Changelog

All notable changes to **operator** are documented here.

## [Unreleased]

### Changed
- Refactored core utilities for better readability and maintainability.
- Improved error handling with detailed, descriptive error messages across utils.
- Enhanced debugging experience with more informative error output.

## [0.81.0] - 2026-07

Initial release of `operator` — a terminal AI coding agent for development,
supporting Alem AI + local Ollama as model providers.

### Added
- Alem AI (`llm.alem.ai`) and local Ollama as model providers.
- Simplified system prompt and a beginner-friendly tool set.
- Session export/import, model switching, persistent memory.

### Notes
- Built on the operator-core / operator-ai / operator-tui runtime packages.