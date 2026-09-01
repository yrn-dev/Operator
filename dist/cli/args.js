/**
 * CLI argument parsing and help display
 */
import chalk from "chalk";
import { APP_NAME, CONFIG_DIR_NAME, ENV_AGENT_DIR, ENV_SESSION_DIR } from "../config.js";
const VALID_THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"];
export function isValidThinkingLevel(level) {
    return VALID_THINKING_LEVELS.includes(level);
}
export function parseArgs(args) {
    const result = {
        messages: [],
        fileArgs: [],
        unknownFlags: new Map(),
        diagnostics: [],
    };
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === "--help" || arg === "-h") {
            result.help = true;
        }
        else if (arg === "--version" || arg === "-v") {
            result.version = true;
        }
        else if (arg === "--mode" && i + 1 < args.length) {
            const mode = args[++i];
            if (mode === "text" || mode === "json" || mode === "rpc") {
                result.mode = mode;
            }
        }
        else if (arg === "--continue" || arg === "-c") {
            result.continue = true;
        }
        else if (arg === "--resume" || arg === "-r") {
            result.resume = true;
        }
        else if (arg === "--provider" && i + 1 < args.length) {
            result.provider = args[++i];
        }
        else if (arg === "--model" && i + 1 < args.length) {
            result.model = args[++i];
        }
        else if (arg === "--api-key" && i + 1 < args.length) {
            result.apiKey = args[++i];
        }
        else if (arg === "--system-prompt" && i + 1 < args.length) {
            result.systemPrompt = args[++i];
        }
        else if (arg === "--append-system-prompt" && i + 1 < args.length) {
            result.appendSystemPrompt = result.appendSystemPrompt ?? [];
            result.appendSystemPrompt.push(args[++i]);
        }
        else if (arg === "--name" || arg === "-n") {
            if (i + 1 < args.length) {
                result.name = args[++i];
            }
            else {
                result.diagnostics.push({ type: "error", message: "--name requires a value" });
            }
        }
        else if (arg === "--no-session") {
            result.noSession = true;
        }
        else if (arg === "--session" && i + 1 < args.length) {
            result.session = args[++i];
        }
        else if (arg === "--session-id" && i + 1 < args.length) {
            result.sessionId = args[++i];
        }
        else if (arg === "--fork" && i + 1 < args.length) {
            result.fork = args[++i];
        }
        else if (arg === "--session-dir" && i + 1 < args.length) {
            result.sessionDir = args[++i];
        }
        else if (arg === "--models" && i + 1 < args.length) {
            result.models = args[++i].split(",").map((s) => s.trim());
        }
        else if (arg === "--no-tools" || arg === "-nt") {
            result.noTools = true;
        }
        else if (arg === "--no-builtin-tools" || arg === "-nbt") {
            result.noBuiltinTools = true;
        }
        else if ((arg === "--tools" || arg === "-t") && i + 1 < args.length) {
            result.tools = args[++i]
                .split(",")
                .map((s) => s.trim())
                .filter((name) => name.length > 0);
        }
        else if ((arg === "--exclude-tools" || arg === "-xt") && i + 1 < args.length) {
            result.excludeTools = args[++i]
                .split(",")
                .map((s) => s.trim())
                .filter((name) => name.length > 0);
        }
        else if ((arg === "--thinking" || arg === "--reasoning") && i + 1 < args.length) {
            const level = args[++i];
            if (isValidThinkingLevel(level)) {
                result.thinking = level;
            }
            else {
                result.diagnostics.push({
                    type: "warning",
                    message: `Invalid reasoning level "${level}". Valid values: ${VALID_THINKING_LEVELS.join(", ")}`,
                });
            }
        }
        else if (arg === "--print" || arg === "-p") {
            result.print = true;
            const next = args[i + 1];
            if (next !== undefined && !next.startsWith("@") && (!next.startsWith("-") || next.startsWith("---"))) {
                result.messages.push(next);
                i++;
            }
        }
        else if (arg === "--export" && i + 1 < args.length) {
            result.export = args[++i];
        }
        else if ((arg === "--extension" || arg === "-e") && i + 1 < args.length) {
            result.extensions = result.extensions ?? [];
            result.extensions.push(args[++i]);
        }
        else if (arg === "--no-extensions" || arg === "-ne") {
            result.noExtensions = true;
        }
        else if (arg === "--skill" && i + 1 < args.length) {
            result.skills = result.skills ?? [];
            result.skills.push(args[++i]);
        }
        else if (arg === "--prompt-template" && i + 1 < args.length) {
            result.promptTemplates = result.promptTemplates ?? [];
            result.promptTemplates.push(args[++i]);
        }
        else if (arg === "--theme" && i + 1 < args.length) {
            result.themes = result.themes ?? [];
            result.themes.push(args[++i]);
        }
        else if (arg === "--no-skills" || arg === "-ns") {
            result.noSkills = true;
        }
        else if (arg === "--no-prompt-templates" || arg === "-np") {
            result.noPromptTemplates = true;
        }
        else if (arg === "--no-themes") {
            result.noThemes = true;
        }
        else if (arg === "--no-context-files" || arg === "-nc") {
            result.noContextFiles = true;
        }
        else if (arg === "--list-models") {
            // Check if next arg is a search pattern (not a flag or file arg)
            if (i + 1 < args.length && !args[i + 1].startsWith("-") && !args[i + 1].startsWith("@")) {
                result.listModels = args[++i];
            }
            else {
                result.listModels = true;
            }
        }
        else if (arg === "--verbose") {
            result.verbose = true;
        }
        else if (arg === "--approve" || arg === "-a") {
            result.projectTrustOverride = true;
        }
        else if (arg === "--no-approve" || arg === "-na") {
            result.projectTrustOverride = false;
        }
        else if (arg === "--offline") {
            result.offline = true;
        }
        else if (arg.startsWith("@")) {
            result.fileArgs.push(arg.slice(1)); // Remove @ prefix
        }
        else if (arg.startsWith("--")) {
            const eqIndex = arg.indexOf("=");
            if (eqIndex !== -1) {
                result.unknownFlags.set(arg.slice(2, eqIndex), arg.slice(eqIndex + 1));
            }
            else {
                const flagName = arg.slice(2);
                const next = args[i + 1];
                if (next !== undefined && !next.startsWith("-") && !next.startsWith("@")) {
                    result.unknownFlags.set(flagName, next);
                    i++;
                }
                else {
                    result.unknownFlags.set(flagName, true);
                }
            }
        }
        else if (arg.startsWith("-") && !arg.startsWith("--")) {
            result.diagnostics.push({ type: "error", message: `Unknown option: ${arg}` });
        }
        else if (!arg.startsWith("-")) {
            result.messages.push(arg);
        }
    }
    return result;
}
export function printHelp(extensionFlags) {
    const extensionFlagsText = extensionFlags && extensionFlags.length > 0
        ? `\n${chalk.bold("Extension CLI Flags:")}\n${extensionFlags
            .map((flag) => {
            const value = flag.type === "string" ? " <value>" : "";
            const description = flag.description ?? `Registered by ${flag.extensionPath}`;
            return `  --${flag.name}${value}`.padEnd(30) + description;
        })
            .join("\n")}\n`
        : "";
    console.log(`${chalk.bold(APP_NAME)} - terminal coding agent with TUI, tools, and session management

${chalk.bold("Usage:")}
  ${APP_NAME} [options] [@files...] [messages...]

${chalk.bold("Commands:")}
  ${APP_NAME} install <source> [-l]     Install extension source and add to settings
  ${APP_NAME} remove <source> [-l]      Remove extension source from settings
  ${APP_NAME} uninstall <source> [-l]   Alias for remove
  ${APP_NAME} update [source|self|opr]  Update opr (use --all for opr and extensions)
  ${APP_NAME} list                      List installed extensions from settings
  ${APP_NAME} config                    Open TUI to enable/disable package resources
  ${APP_NAME} <command> --help          Show help for install/remove/uninstall/update/list

${chalk.bold("Options:")}
  --provider <name>              Provider name (default: alem-ai)
  --model <pattern>              Model pattern or ID (default: qwen3-8)
  --api-key <key>                API key override
  --system-prompt <text>         System prompt override
  --append-system-prompt <text>  Append text or file contents to the system prompt (can be used multiple times)
  --mode <mode>                  Output mode: text (default), json, or rpc
  --print, -p                    Non-interactive mode: process prompt and exit
  --continue, -c                 Continue previous session
  --resume, -r                   Select a session to resume
  --session <path|id>            Use specific session file or partial UUID
  --session-id <id>              Use exact project session ID, creating it if missing
  --fork <path|id>               Fork specific session file or partial UUID into a new session
  --session-dir <dir>            Directory for session storage and lookup
  --no-session                   Don't save session (ephemeral)
  --name, -n <name>              Set session display name
  --models <patterns>            Comma-separated model patterns for Ctrl+P cycling
                                 Supports exact IDs and fuzzy matching
  --no-tools, -nt                Disable all tools by default (built-in and extension)
  --no-builtin-tools, -nbt       Disable built-in tools by default but keep extension/custom tools enabled
  --tools, -t <tools>            Comma-separated allowlist of tool names to enable
                                 Applies to built-in, extension, and custom tools
  --exclude-tools, -xt <tools>   Comma-separated denylist of tool names to disable
                                 Applies to built-in, extension, and custom tools
  --reasoning <level>            Set reasoning level: off, minimal, low, medium, high, xhigh
  --extension, -e <path>         Load an extension file (can be used multiple times)
  --no-extensions, -ne           Disable extension discovery (explicit -e paths still work)
  --skill <path>                 Load a skill file or directory (can be used multiple times)
  --no-skills, -ns               Disable skills discovery and loading
  --prompt-template <path>       Load a prompt template file or directory (can be used multiple times)
  --no-prompt-templates, -np     Disable prompt template discovery and loading
  --theme <path>                 Load a theme file or directory (can be used multiple times)
  --no-themes                    Disable theme discovery and loading
  --no-context-files, -nc        Disable AGENTS.md and CLAUDE.md discovery and loading
  --export <file>                Export session file to HTML and exit
  --list-models [search]         List available models (with optional fuzzy search)
  --verbose                      Force verbose startup (overrides quietStartup setting)
  --approve, -a                  Trust project-local files for this run
  --no-approve, -na              Ignore project-local files for this run
  --offline                      Disable startup network operations (same as OPR_OFFLINE=1)
  --help, -h                     Show this help
  --version, -v                  Show version number

Extensions can register additional flags.${extensionFlagsText}

${chalk.bold("Examples:")}
  # Interactive mode
  ${APP_NAME}

  # Interactive mode with initial prompt
  ${APP_NAME} "List all .ts files in src/"

  # Include files in initial message
  ${APP_NAME} @prompt.md @image.png "What color is the sky?"

  # Non-interactive mode (process and exit)
  ${APP_NAME} -p "List all .ts files in src/"

  # Multiple messages (interactive)
  ${APP_NAME} "Read package.json" "What dependencies do we have?"

  # Continue previous session
  ${APP_NAME} --continue "What did we discuss?"

  # Start a named session
  ${APP_NAME} --name "Refactor auth module"

  # Use the fixed qwen3-8 model explicitly
  ${APP_NAME} --provider alem-ai --model qwen3-8 "Help me refactor this code"

  # Read-only mode (no file modifications possible)
  ${APP_NAME} --tools read,grep,find,ls -p "Review the code in src/"

  # Disable one tool while keeping the rest available
  ${APP_NAME} --exclude-tools ask_question

  # Export a session file to HTML
  ${APP_NAME} --export ~/${CONFIG_DIR_NAME}/agent/sessions/--path--/session.jsonl
  ${APP_NAME} --export session.jsonl output.html

${chalk.bold("Environment Variables:")}
  ${ENV_AGENT_DIR.padEnd(32)} - Config directory (default: ~/${CONFIG_DIR_NAME}/agent)
  ${ENV_SESSION_DIR.padEnd(32)} - Session storage directory (overridden by --session-dir)
  OPR_PACKAGE_DIR                  - Override package directory (for Nix/Guix store paths)
  OPR_OFFLINE                      - Disable startup network operations when set to 1/true/yes
  OPR_TELEMETRY                    - Override install telemetry when set to 1/true/yes or 0/false/no
  OPR_SHARE_VIEWER_URL             - Base URL for /share command (default: https://opr.local/session/)

${chalk.bold("Built-in Tool Names:")}
  read             - Read file contents
  bash             - Execute bash commands
  edit             - Edit files with find/replace
  write            - Write files (creates/overwrites)

  grep             - Search file contents (read-only, off by default)
  find             - Find files by glob pattern (read-only, off by default)
  ls               - List directory contents (read-only, off by default)
`);
}
//# sourceMappingURL=args.js.map
