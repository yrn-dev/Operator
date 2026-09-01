import { APP_NAME } from "../config.js";
export const BUILTIN_SLASH_COMMANDS = [
    { name: "model", description: "Select model (Alem AI: qwen3-8, gemma4, gpt-oss)" },
    { name: "status", description: "Show model, provider, context usage and token stats" },
    { name: "export", description: "Export session as JSON (shareable with another user)" },
    { name: "import", description: "Import and resume a session from a JSON file" },
    { name: "new", description: "Start a new session" },
    { name: "resume", description: "Resume a different session" },
    { name: "quit", description: `Quit ${APP_NAME}` },
];
//# sourceMappingURL=slash-commands.js.map