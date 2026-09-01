import { spawn } from "node:child_process";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { waitForChildProcess } from "../../utils/child-process.js";
import { getShellEnv } from "../../utils/shell.js";
import { resolveToCwd } from "./path-utils.js";
import { getTextOutput, str } from "./render-utils.js";
import { wrapToolDefinition } from "./tool-definition-wrapper.js";
const DEFAULT_TIMEOUT = 30;
const gitStatusSchema = Type.Object({}, { additionalProperties: false });
const gitDiffSchema = Type.Object({
    files: Type.Optional(Type.Array(Type.String({ description: "Paths to diff (default: all unstaged/staged changes)" }))),
    staged: Type.Optional(Type.Boolean({ description: "Show staged diff instead of unstaged" })),
}, { additionalProperties: false });
const gitCommitSchema = Type.Object({
    message: Type.String({ description: "Commit message (Conventional Commits recommended)" }),
    files: Type.Array(Type.String({ description: "Files to stage and commit" }), { minItems: 1 }),
}, { additionalProperties: false });
async function runGit(cwd, args, { env = getShellEnv(), timeout = DEFAULT_TIMEOUT, signal } = {}) {
    const child = spawn("git", args, {
        cwd,
        env,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let timeoutHandle;
    const onAbort = () => {
        if (child.pid) {
            try {
                process.kill(child.pid, "SIGTERM");
            }
            catch { }
        }
    };
    if (signal) {
        if (signal.aborted)
            onAbort();
        else
            signal.addEventListener("abort", onAbort, { once: true });
    }
    if (timeout > 0) {
        timeoutHandle = setTimeout(() => {
            timedOut = true;
            onAbort();
        }, timeout * 1000);
    }
    try {
        child.stdout?.on("data", (d) => { stdout += d.toString("utf-8"); });
        child.stderr?.on("data", (d) => { stderr += d.toString("utf-8"); });
        const exitCode = await waitForChildProcess(child);
        if (signal?.aborted) {
            throw new Error("Operation aborted");
        }
        if (timedOut) {
            throw new Error(`git ${args.join(" ")} timed out after ${timeout}s.\n\n${stderr || stdout}`);
        }
        return { exitCode, stdout, stderr };
    }
    finally {
        if (timeoutHandle)
            clearTimeout(timeoutHandle);
        if (signal)
            signal.removeEventListener("abort", onAbort);
    }
}
function formatGitOutput(result, args) {
    const out = [result.stdout, result.stderr].filter(Boolean).join("\n").trim() || "(no output)";
    if (result.exitCode !== 0) {
        throw new Error(`git ${args.join(" ")} exited with code ${result.exitCode}.\n\n${out}`);
    }
    return out;
}
export function createGitStatusToolDefinition(cwd, options) {
    const env = options?.env ?? getShellEnv();
    return {
        name: "git_status",
        label: "git_status",
        description: "Show the current git working tree status in short format (git status --short --branch). Useful before committing to see what changed.",
        promptSnippet: "Show git status",
        promptGuidelines: [
            "Use git_status before git_commit to verify what will be committed",
            "If repository is not a git repo, the tool will report the error",
        ],
        parameters: gitStatusSchema,
        async execute(_toolCallId, _input, signal, _onUpdate, _ctx) {
            const result = await runGit(cwd, ["status", "--short", "--branch"], { env, signal });
            return {
                content: [{ type: "text", text: formatGitOutput(result, ["status", "--short", "--branch"]) }],
                details: { exitCode: result.exitCode },
            };
        },
        renderCall(_args, theme, _context) {
            const text = new Text("", 0, 0);
            text.setText(theme.fg("toolTitle", theme.bold("git_status")));
            return text;
        },
        renderResult(result, _options, _theme, _context) {
            const text = new Text("", 0, 0);
            text.setText(getTextOutput(result, false));
            return text;
        },
    };
}
export function createGitDiffToolDefinition(cwd, options) {
    const env = options?.env ?? getShellEnv();
    return {
        name: "git_diff",
        label: "git_diff",
        description: "Show git diff for selected files or all changes. By default shows unstaged changes; set staged=true to see staged changes.",
        promptSnippet: "Show git diff",
        promptGuidelines: [
            "Use git_diff to review changes before committing",
            "Specify files to keep diff focused",
        ],
        parameters: gitDiffSchema,
        async execute(_toolCallId, input, signal, _onUpdate, _ctx) {
            const { files, staged } = input || {};
            const args = ["diff"];
            if (staged)
                args.push("--staged");
            if (files && files.length > 0) {
                args.push("--");
                for (const f of files) {
                    args.push(resolveToCwd(f, cwd));
                }
            }
            const result = await runGit(cwd, args, { env, signal });
            return {
                content: [{ type: "text", text: formatGitOutput(result, args) }],
                details: { exitCode: result.exitCode },
            };
        },
        renderCall(args, theme, _context) {
            const text = new Text("", 0, 0);
            const files = Array.isArray(args?.files) ? args.files.join(", ") : "all";
            text.setText(theme.fg("toolTitle", theme.bold("git_diff")) +
                theme.fg("accent", ` ${args?.staged ? "staged" : "unstaged"} (${files})`));
            return text;
        },
        renderResult(result, _options, _theme, _context) {
            const text = new Text("", 0, 0);
            text.setText(getTextOutput(result, false));
            return text;
        },
    };
}
export function createGitCommitToolDefinition(cwd, options) {
    const env = options?.env ?? getShellEnv();
    return {
        name: "git_commit",
        label: "git_commit",
        description: "Stage the specified files and create a git commit with the provided message. Equivalent to: git add <files> && git commit -m <message>.",
        promptSnippet: "Stage files and create a git commit",
        promptGuidelines: [
            "Use git_commit after verifying changes with git_status/git_diff",
            "Conventional commits: feat(scope): description",
            "Only commit files explicitly listed in the files parameter",
        ],
        parameters: gitCommitSchema,
        async execute(_toolCallId, input, signal, _onUpdate, _ctx) {
            const { message, files } = input;
            const absoluteFiles = files.map((f) => resolveToCwd(f, cwd));
            const addResult = await runGit(cwd, ["add", "--", ...absoluteFiles], { env, signal });
            if (addResult.exitCode !== 0) {
                throw new Error(`git add failed with code ${addResult.exitCode}.\n\n${[addResult.stdout, addResult.stderr].filter(Boolean).join("\n")}`);
            }
            const commitResult = await runGit(cwd, ["commit", "-m", message], { env, signal });
            return {
                content: [{ type: "text", text: formatGitOutput(commitResult, ["commit", "-m", message]) }],
                details: { exitCode: commitResult.exitCode, files: absoluteFiles },
            };
        },
        renderCall(args, theme, _context) {
            const text = new Text("", 0, 0);
            const files = Array.isArray(args?.files) ? args.files.join(", ") : "...";
            const msg = str(args?.message);
            text.setText(theme.fg("toolTitle", theme.bold("git_commit")) +
                theme.fg("accent", ` ${files}`) +
                (msg ? theme.fg("toolOutput", ` — ${msg}`) : ""));
            return text;
        },
        renderResult(result, _options, _theme, _context) {
            const text = new Text("", 0, 0);
            text.setText(getTextOutput(result, false));
            return text;
        },
    };
}
export function createGitStatusTool(cwd, options) {
    return wrapToolDefinition(createGitStatusToolDefinition(cwd, options));
}
export function createGitDiffTool(cwd, options) {
    return wrapToolDefinition(createGitDiffToolDefinition(cwd, options));
}
export function createGitCommitTool(cwd, options) {
    return wrapToolDefinition(createGitCommitToolDefinition(cwd, options));
}
//# sourceMappingURL=git-tools.js.map
