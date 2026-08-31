# operator — Terminal AI Coding Agent

Autonomous AI agent for the terminal. Not just for code — also for research, automation, DevOps, data analysis, and content generation.

Runs locally. Minimum words, maximum action.

## What operator can do

### 💻 Development
- Write code in any language (Python, JS/TS, Go, Rust, etc.)
- Read, edit, and patch files
- Find bugs and suggest fixes
- Run tests and verify results
- Git operations (status, diff, commit, branches)
- UI library integration: shadcn/ui, MUI, PrimeReact, Tailwind

### 🖼️ Image Generation
- **Alem AI Plus** integration for text-to-image generation
- Install skill: `operator install https://github.com/yrn-dev/operator-alem-image-plus`
- Supports portraits, product shots, storyboards, posters, infographics

### 🔬 Research & Analysis
- **Deep Research** — web search, Wikipedia, DuckDuckGo with cross-verification
- Collects data from multiple sources, compares, assesses credibility
- Generates structured reports with facts and references
- Suitable for scientific papers, journalism, business analysis

### 🤖 Automation
- Run bash commands, scripts, pipelines
- File processing: search, replace, convert, parse
- Cron-based scheduling, process monitoring
- Web scraping via Puppeteer (navigation, screenshots, form filling)
- Server management via SSH, PM2, ports

### 🖥️ DevOps & System Administration
- Server management: SSH, processes, ports, logs
- PM2 service deployment and management
- Resource monitoring (CPU, RAM, disk)
- Nginx, Docker, environment configuration
- MCP server integration (API connections)

### 📊 Data Work
- Read and analyze CSV, JSON, logs
- Database queries via MCP tools
- Extract text from PDF, DOCX
- Report and documentation generation

### ✍️ Content & Writing
- Articles, reports, technical documentation
- Translation and summarization
- Social media post generation
- Scientific and analytical writing

### 📚 Learning
- Explain complex topics in simple terms
- Help with homework and projects
- Generate tests and quiz questions
- Lecture and article note-taking

### 🧠 Task Management
- Task planning (task_plan → task_update → task_list)
- Persistent memory (memory_store → memory_recall)
- Track progress across projects

## Models

| Provider | Description | API Key |
|----------|-------------|---------|
| **Alem AI** (`llm.alem.ai`) | Cloud models: Qwen 3, Gemma 4, GPT-oss | Yes (API key) |
| **Ollama** | Local models on your hardware | No (free) |

## Installation

```bash
# Clone and build
git clone https://github.com/yrn-dev/operator.git
cd operator
npm install
npm run build

# Or install via npm
npm install -g @yernur/operator
```

## Quick Start

```bash
# Launch
opr

# Select model
/model

# Alem AI → enter API key → done
# Ollama → works out of the box (no key needed)
```

## In-Interface Commands

| Command | Description |
|---------|-------------|
| `/model` | Switch model (Alem AI + Ollama) |
| `/export` | Export session to JSON |
| `/import` | Import session from JSON |
| `/new` | New session |
| `/resume` | Resume another session |
| `/quit` | Exit |

## Tools

| Tool | Description |
|------|-------------|
| `read` / `write` / `edit` / `patch` | File operations |
| `bash` | Execute commands |
| `find` / `grep` / `ls` | File system navigation |
| `git_status` / `git_commit` / `git_log` / `git_diff` / `git_branch` | Git operations |
| `web_search` / `deep_research` | Web search |
| `memory_store` / `memory_recall` | Persistent memory |
| `task_plan` / `task_list` / `task_update` | Task planning |
| `test_run` / `test_coverage` | Run tests |
| `puppeteer_*` | Browser automation |
| MCP tools | External API server integration |

## Skills

Extend operator with additional capabilities:

```bash
# Image generation (Alem AI Plus)
operator install https://github.com/yrn-dev/operator-alem-image-plus
```

Available skills:
- **Alem Image Plus** — text-to-image generation (portraits, product shots, posters, etc.)

## Usage Examples

```
# Write a script
"write a python script to parse CSV and plot a graph"

# Generate an image
"create a cyberpunk city poster with neon lights"

# Research
deep_research(query="comparison of neural networks for computer vision 2025")

# Automation
"find all log files older than 7 days in /var/log and delete them"

# DevOps
"SSH to the server, check PM2 processes, restart any that are down"

# Analysis
"read /data/report.pdf and give me a brief summary in English"

# UI Development
"find the PrimeReact DataTable component, show me props and usage example"

# Content
"write an article about artificial intelligence trends for habr.com"
```

## Configuration

| File | Description |
|------|-------------|
| `~/.opr/agent/settings.json` | Main settings |
| `~/.opr/agent/auth.json` | API keys |
| `~/.opr/agent/sessions/` | Session history |

Core settings support `enable_notifications` (default `false`). See `examples/core-settings.json`.

## Requirements

- **Node.js** >= 22.19.0
- **Alem AI API key** (for cloud models, optional)
- **Ollama** (for local models, optional)

## License

MIT
