import { Text } from "@earendil-works/pi-tui";
import { spawn } from "child_process";
import { existsSync } from "fs";
import { homedir } from "os";
import { Type } from "typebox";
import { keyHint } from "../../modes/interactive/components/keybinding-hints.js";
import { getTextOutput, invalidArgText, str } from "./render-utils.js";
import { wrapToolDefinition } from "./tool-definition-wrapper.js";
import { DEFAULT_MAX_BYTES, formatSize, truncateHead } from "./truncate.js";
const WEB_SEARCH_HELPER = `${homedir()}/.tools/web_search/search.cjs`;
const webSearchSchema = Type.Object({
    query: Type.Optional(Type.String({ description: "Search query for full, ddg, instant, or wiki modes" })),
    url: Type.Optional(Type.String({ description: "Page URL to extract when mode is 'page'" })),
    mode: Type.Optional(Type.Union([
        Type.Literal("full"),
        Type.Literal("ddg"),
        Type.Literal("instant"),
        Type.Literal("wiki"),
        Type.Literal("page"),
    ], { description: "Search mode (default: full)" })),
    limit: Type.Optional(Type.Number({ description: "Maximum number of results for ddg/wiki/full (default: 5)" })),
});
function formatWebSearchCall(args, theme) {
    const mode = str(args?.mode) || "full";
    const query = str(args?.query);
    const url = str(args?.url);
    const target = mode === "page" ? url : query;
    const invalidArg = invalidArgText(theme);
    return `${theme.fg("toolTitle", theme.bold("web.search"))} ${theme.fg("toolOutput", `[${mode}] `)}${target === null ? invalidArg : theme.fg("accent", target || "...")}`;
}
function formatWebSearchResult(result, options, theme, showImages) {
    const output = getTextOutput(result, showImages).trim();
    if (!output) {
        return "";
    }
    const lines = output.split("\n");
    const maxLines = options.expanded ? lines.length : 20;
    const displayLines = lines.slice(0, maxLines);
    const remaining = lines.length - maxLines;
    let text = `\n${displayLines.map((line) => theme.fg("toolOutput", line)).join("\n")}`;
    if (remaining > 0) {
        text += `${theme.fg("muted", `\n... (${remaining} more lines,`)} ${keyHint("app.tools.expand", "to expand")})`;
    }
    const truncation = result.details?.truncation;
    if (truncation?.truncated) {
        text += `\n${theme.fg("warning", `[Truncated: ${formatSize(truncation.maxBytes ?? DEFAULT_MAX_BYTES)} limit]`)}`;
    }
    return text;
}
export function createWebSearchToolDefinition(_cwd, _options) {
    return {
        name: "web_search",
        label: "web.search",
        description: `Search the web using DuckDuckGo and Wikipedia, or extract readable text from a web page. Best for current external information, documentation, and quick validation. Output is truncated to ${DEFAULT_MAX_BYTES / 1024}KB if needed.`,
        promptSnippet: "Search the web for current external information or extract text from a URL",
        promptGuidelines: [
            "Use web_search when the user asks for current external information, recent updates, or public web content.",
        ],
        parameters: webSearchSchema,
        async execute(_toolCallId, { query, url, mode, limit }, signal, _onUpdate, _ctx) {
            return new Promise((resolve, reject) => {
                if (signal?.aborted) {
                    reject(new Error("Operation aborted"));
                    return;
                }
                if (!existsSync(WEB_SEARCH_HELPER)) {
                    reject(new Error(`Web search helper not found: ${WEB_SEARCH_HELPER}`));
                    return;
                }
                const effectiveMode = mode || "full";
                const target = effectiveMode === "page" ? url : query;
                if (!target) {
                    reject(new Error(effectiveMode === "page" ? "url is required for page mode" : "query is required for search mode"));
                    return;
                }
                const args = [WEB_SEARCH_HELPER, "--json"];
                if (effectiveMode === "page") {
                    args.push("--page", target);
                }
                else if (effectiveMode === "ddg") {
                    args.push("--ddg", target);
                }
                else if (effectiveMode === "instant") {
                    args.push("--instant", target);
                }
                else if (effectiveMode === "wiki") {
                    args.push("--wiki", target);
                }
                else {
                    args.push(target);
                }
                if (limit !== undefined && effectiveMode !== "page" && effectiveMode !== "instant") {
                    args.push("--limit", String(limit));
                }
                const child = spawn(process.execPath, args, {
                    stdio: ["ignore", "pipe", "pipe"],
                });
                let stdout = "";
                let stderr = "";
                let settled = false;
                const settle = (fn) => {
                    if (settled)
                        return;
                    settled = true;
                    signal?.removeEventListener("abort", onAbort);
                    fn();
                };
                const onAbort = () => {
                    if (!child.killed) {
                        child.kill();
                    }
                    settle(() => reject(new Error("Operation aborted")));
                };
                signal?.addEventListener("abort", onAbort, { once: true });
                child.stdout?.on("data", (chunk) => {
                    stdout += chunk.toString();
                });
                child.stderr?.on("data", (chunk) => {
                    stderr += chunk.toString();
                });
                child.on("error", (error) => {
                    settle(() => reject(new Error(`Failed to run web search helper: ${error.message}`)));
                });
                child.on("close", (code) => {
                    if (signal?.aborted) {
                        settle(() => reject(new Error("Operation aborted")));
                        return;
                    }
                    if (code !== 0) {
                        settle(() => reject(new Error(stderr.trim() || `web_search exited with code ${code}`)));
                        return;
                    }
                    const output = stdout.trim();
                    if (!output) {
                        settle(() => resolve({
                            content: [{ type: "text", text: "No web search results returned" }],
                            details: undefined,
                        }));
                        return;
                    }
                    const truncation = truncateHead(output, { maxLines: Number.MAX_SAFE_INTEGER });
                    settle(() => resolve({
                        content: [{ type: "text", text: truncation.content }],
                        details: truncation.truncated ? { truncation } : undefined,
                    }));
                });
            });
        },
        renderCall(args, theme, context) {
            const text = context.lastComponent ?? new Text("", 0, 0);
            text.setText(formatWebSearchCall(args, theme));
            return text;
        },
        renderResult(result, options, theme, context) {
            const text = context.lastComponent ?? new Text("", 0, 0);
            text.setText(formatWebSearchResult(result, options, theme, context.showImages));
            return text;
        },
    };
}
export function createWebSearchTool(cwd, options) {
    return wrapToolDefinition(createWebSearchToolDefinition(cwd, options));
}
