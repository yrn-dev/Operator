# operator

[![npm version](https://img.shields.io/npm/v/pzero-operator.svg)](https://www.npmjs.com/package/pzero-operator)
[![downloads last month](https://img.shields.io/npm/dm/pzero-operator.svg)](https://www.npmjs.com/package/pzero-operator)

Личный агент для работы с кодом в терминале — свой аналог Claude Code, но на моделях Alem AI (`llm.alem.ai`) плюс всё, что крутится локально в Ollama. Читает и правит файлы, гоняет bash, помнит задачи и факты между сессиями, коммитит в git. Пакет называется `pzero-operator`, бинарник — `operator` (или короче: `opr`).

```bash
npm install -g pzero-operator
operator
```

Пакет: [pzero-operator](https://www.npmjs.com/package/pzero-operator) · репозиторий: [yrn-dev/Operator](https://github.com/yrn-dev/Operator)

## Запуск

```bash
operator                          # интерактивный TUI
operator -p "напиши тесты"        # одноразовый запрос, без TUI
operator --continue                # продолжить последнюю сессию
operator --resume                  # выбрать сессию из списка
operator --list-models             # что вообще доступно
```

## Модели

По умолчанию — `qwen3-8`, 262K контекста, тянет картинки. И по вайб-кодингу и качеству кода сейчас реально обходит Opus 4.6 (max) — не маркетинг, проверено на своих задачах.

| Модель | Контекст | Картинки |
|---|---|---|
| `qwen3-8` | 262K | да |
| `gemma4` | 252K | да |
| `gpt-oss` | 128K | нет |

Плюс всё, что найдётся на `localhost:11434` — это Ollama, и не только локальные веса: с недавних пор она сама умеет проксировать облачные модели (`ollama signin`, модели с суффиксом `:cloud`) через тот же локальный API, так что список моделей может быть внушительным, даже если у тебя не крутится ничего тяжелее ноутбука. Подхватывается сам при старте, без конфига — и локальное, и облачное одинаково.

Ключ Alem AI лежит в `~/.opr/agent/auth.json`:

```json
{"alem-ai":{"type":"api_key","key":"sk-..."}}
```

или просто `export ALEM_AI_API_KEY=sk-...`. Модельный реестр и переопределения контекстов — в `~/.opr/agent/models.json`, если что-то надо докрутить руками (провайдер, свой `baseUrl`, лимиты).

## В интерактиве

- `/model` — переключить модель на лету
- `/status` — модель, провайдер, шкала заполнения контекста и реальный расход токенов (вход/выход/кэш) за сессию
- `/new`, `/resume` — новая сессия / выбрать старую
- `/export`, `/import` — сессия в JSON и обратно
- `!команда` — bash прямо из чата, `!!команда` — то же самое, но не попадёт в контекст

## Инструменты агента

Из коробки: `read` / `write` / `edit` файлов, `bash`, `git_status` / `git_diff` / `git_commit`, `test_run` (сам определяет фреймворк — npm/pytest/cargo/go/gradle/dotnet), веб-поиск, и пара штук для долгой памяти между сессиями — `task_plan`/`task_update`/`task_list` под план работы, `memory_store`/`memory_recall` под факты (`~/.opr/agent/memory/*.md`, `~/.opr/agent/tasks.json`).

Системный промпт можно полностью заменить: `~/.opr/agent/SYSTEM.md` — глобально, `<проект>/.opr/SYSTEM.md` — под конкретный репозиторий (только для trusted-проектов). `APPEND_SYSTEM.md` рядом — не заменяет, а дописывает поверх.

## Флаги, которые реально нужны

| Флаг | Что делает |
|---|---|
| `--model <id>` | конкретная модель вместо дефолтной |
| `--provider ollama` | всё через локальную Ollama |
| `-p`, `--print` | без TUI, разовый прогон |
| `-c`, `--continue` | продолжить сессию |
| `--name "..."` | назвать сессию, чтобы потом найти |
| `--offline` | без сети вообще (проверки апдейтов, веб-поиск и т.п. отключены) |

Остальное — `operator --help`.

## Сессии

Лежат в `~/.opr/agent/sessions/`, по одному jsonl-файлу на сессию, автосейв на каждом шаге. `--fork` берёт существующую сессию и продолжает её в новую, не трогая оригинал.

## Настройки

В `~/.opr/agent/settings.json` можно включить `enable_notifications` (по умолчанию `false`). Пример — `examples/core-settings.json`.

## Лицензия

MIT © Yernur
