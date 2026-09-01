# Changelog

## [Unreleased]

### Added
- Core `enable_notifications` config option (default `false`) for opt-in notifications.
- `searchItems` helper with edge-case handling for empty queries, non-string input, regex metacharacters, and result truncation.

## [1.2.2] - 2026-08-19

### Added
- Новая модель Alem AI: `qwen3-8` (мультимодальная, 262K контекст)
- Доступна через `--model qwen3-8` или в TUI-селекторе моделей

### Removed
- Модель `qwen3-6` — заменена на `qwen3-8` (тот же провайдер, вдвое больше контекст: 262K вместо 131K)

## [1.2.1] - 2026-08-09

### Fixed
- Новые инструменты теперь действительно активируются по умолчанию в `createAgentSession` SDK (была пропущена точка входа SDK)
- `task_plan`, `task_update`, `task_list`, `memory_store`, `memory_recall`, `test_run`, `git_status`, `git_diff`, `git_commit` доступны в интерактивном и print-режиме

## [1.2.0] - 2026-08-09

### Added
- Новые инструменты агента:
  - `task_plan` / `task_update` / `task_list` — управление планом задач, хранится в `~/.opr/agent/tasks.json`
  - `memory_store` / `memory_recall` — долговременная память в `~/.opr/agent/memory/<slug>.md`
  - `test_run` — запуск тестов с автоопределением фреймворка (npm/pytest/cargo/go/gradle/dotnet)
  - `git_status` / `git_diff` / `git_commit` — нативные git-инструменты
- Инструменты активны по умолчанию и описаны в системном промпте

## [1.1.3] - 2026-08-06

### Fixed
- Убраны хардкодные API-ключи (были в 1.1.1 — deprecated)
- Ключ читается из `~/.opr/agent/auth.json` или `ALEM_AI_API_KEY`
- Удалён только реально мёртвый код (reasoning-selector, operator-announcement, rpc-types, bun/)

### Changed
- Названия моделей: `qwen3-6`, `gemma4`, `gpt-oss` (без переименований)

## [1.1.0] - 2026-08-06

### Changed
- Удалены все сторонние провайдеры
- Только Alem AI + Ollama

### Added
- 3 модели Alem AI: `qwen3-6`, `gemma4`, `gpt-oss` (128K)
