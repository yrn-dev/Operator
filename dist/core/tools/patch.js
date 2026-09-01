import { mkdir as fsMkdir, readFile as fsReadFile, rm as fsRm, writeFile as fsWriteFile } from "fs/promises";
import { dirname } from "path";
import { Text } from "@earendil-works/pi-tui";
import { applyPatch, parsePatch } from "diff";
import { Type } from "typebox";
import { keyHint } from "../../modes/interactive/components/keybinding-hints.js";
import { withFileMutationQueue } from "./file-mutation-queue.js";
import { resolveToCwd } from "./path-utils.js";
import { getTextOutput, invalidArgText, normalizeDisplayText, replaceTabs, str } from "./render-utils.js";
import { wrapToolDefinition } from "./tool-definition-wrapper.js";

const patchSchema = Type.Object({
    patch: Type.String({
        description: "Unified diff patch to apply. Supports one or more file patches. Use standard ---/+++ and @@ hunks.",
    }),
}, { additionalProperties: false });

const defaultPatchOperations = {
    readFile: (path) => fsReadFile(path, "utf-8"),
    writeFile: (path, content) => fsWriteFile(path, content, "utf-8"),
    mkdir: (dir) => fsMkdir(dir, { recursive: true }).then(() => { }),
    rm: (path) => fsRm(path),
};

function normalizePatchPath(value) {
    if (!value || value === "/dev/null") {
        return null;
    }
    const trimmed = value.trim();
    if (trimmed.startsWith("a/") || trimmed.startsWith("b/")) {
        return trimmed.slice(2);
    }
    return trimmed;
}

function formatPatchCall(args, theme, expanded) {
    const patchText = str(args?.patch);
    if (patchText === null) {
        return `${theme.fg("toolTitle", theme.bold("file.patchset"))} ${invalidArgText(theme)}`;
    }
    const lines = normalizeDisplayText(patchText).split("\n");
    const header = `${theme.fg("toolTitle", theme.bold("file.patchset"))} ${theme.fg("accent", `${lines.filter((line) => line.startsWith("diff --git") || line.startsWith("--- ") || line.startsWith("+++ ")).length || 1} patch input`)}`;
    const maxLines = expanded ? lines.length : 12;
    const shown = lines.slice(0, maxLines).map((line) => theme.fg("toolOutput", replaceTabs(line)));
    const remaining = lines.length - maxLines;
    let text = header;
    if (shown.length > 0) {
        text += `\n\n${shown.join("\n")}`;
    }
    if (remaining > 0) {
        text += `${theme.fg("muted", `\n... (${remaining} more lines,`)} ${keyHint("app.tools.expand", "to expand")})`;
    }
    return text;
}

function formatPatchResult(result, options, theme, showImages) {
    const output = getTextOutput(result, showImages).trim();
    if (!output) {
        return "";
    }
    const lines = output.split("\n");
    const maxLines = options.expanded ? lines.length : 12;
    const shown = lines.slice(0, maxLines).map((line) => theme.fg("toolOutput", line));
    const remaining = lines.length - maxLines;
    let text = `\n${shown.join("\n")}`;
    if (remaining > 0) {
        text += `${theme.fg("muted", `\n... (${remaining} more lines,`)} ${keyHint("app.tools.expand", "to expand")})`;
    }
    return text;
}

export function createPatchToolDefinition(cwd, options) {
    const ops = options?.operations ?? defaultPatchOperations;
    return {
        name: "patch",
        label: "file.patchset",
        description: "Apply a unified diff patch to one or more files. Best for multi-line or multi-file edits where exact text replacement is too brittle.",
        promptSnippet: "Apply unified diff patches for multi-line or multi-file code changes",
        promptGuidelines: [
            "Use patch for coordinated edits across multiple files or large contiguous code blocks.",
            "Read the relevant file sections before generating a patch if the current contents may have changed.",
            "Prefer patch over write when modifying existing files substantially but not fully rewriting them.",
            "If a patch fails, re-read the affected file and build a fresh patch instead of guessing.",
        ],
        parameters: patchSchema,
        async execute(_toolCallId, { patch }, signal, _onUpdate, _ctx) {
            const entries = parsePatch(patch);
            if (!Array.isArray(entries) || entries.length === 0) {
                throw new Error("Patch tool input is invalid. Provide a unified diff with at least one file patch.");
            }
            const summaries = [];
            for (const entry of entries) {
                if (signal?.aborted) {
                    throw new Error("Operation aborted");
                }
                const oldPath = normalizePatchPath(entry.oldFileName);
                const newPath = normalizePatchPath(entry.newFileName);
                if (oldPath && newPath && oldPath !== newPath) {
                    throw new Error(`Patch tool does not support renames yet: ${oldPath} -> ${newPath}`);
                }
                const targetPath = newPath ?? oldPath;
                if (!targetPath) {
                    throw new Error("Patch entry does not reference a valid file path.");
                }
                const absolutePath = resolveToCwd(targetPath, cwd);
                const isDelete = newPath === null;
                const isCreate = oldPath === null;
                await withFileMutationQueue(absolutePath, async () => {
                    const source = isCreate ? "" : await ops.readFile(absolutePath);
                    const applied = applyPatch(source, entry, { fuzzFactor: 1 });
                    if (applied === false) {
                        throw new Error(`Failed to apply patch for ${targetPath}. Re-read the file and regenerate the patch.`);
                    }
                    if (isDelete) {
                        await ops.rm(absolutePath);
                        summaries.push(`deleted ${targetPath}`);
                        return;
                    }
                    await ops.mkdir(dirname(absolutePath));
                    await ops.writeFile(absolutePath, applied);
                    summaries.push(`${isCreate ? "created" : "patched"} ${targetPath}`);
                });
            }
            return {
                content: [
                    {
                        type: "text",
                        text: `Applied ${entries.length} patch entr${entries.length === 1 ? "y" : "ies"}.\n${summaries.map((line) => `- ${line}`).join("\n")}`,
                    },
                ],
                details: { diff: patch },
            };
        },
        renderCall(args, theme, context) {
            const text = context.lastComponent ?? new Text("", 0, 0);
            text.setText(formatPatchCall(args, theme, context.expanded));
            return text;
        },
        renderResult(result, options, theme, context) {
            const text = context.lastComponent ?? new Text("", 0, 0);
            text.setText(formatPatchResult(result, options, theme, context.showImages));
            return text;
        },
    };
}

export function createPatchTool(cwd, options) {
    return wrapToolDefinition(createPatchToolDefinition(cwd, options));
}
