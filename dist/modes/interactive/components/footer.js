import { readFileSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { getAgentDir } from "../../../config.js";
import { areExperimentalFeaturesEnabled } from "../../../core/experimental.js";
import { theme } from "../theme/theme.js";

// ── Plan strip ──
// task_plan writes the plan to disk, but it is only visible when something prints
// it. Keeping progress on one always-visible line means a long session never loses
// the thread — and a plan that stops advancing is immediately obvious.
const PLAN_CACHE_TTL_MS = 1000;
// A plan older than this belongs to some earlier session; showing it is noise.
const PLAN_MAX_AGE_MS = 24 * 60 * 60 * 1000;
// Keep a finished plan up briefly so the final task ticking over is visible.
const PLAN_COMPLETED_LINGER_MS = 5 * 60 * 1000;
const PLAN_DONE_STATUSES = new Set(["done", "skipped"]);

let planCache = { checkedAt: 0, mtimeMs: 0, state: null };

function readPlanState() {
    const now = Date.now();
    if (now - planCache.checkedAt < PLAN_CACHE_TTL_MS) {
        return planCache.state;
    }
    planCache.checkedAt = now;
    const path = join(getAgentDir(), "tasks.json");
    try {
        const { mtimeMs } = statSync(path);
        if (mtimeMs === planCache.mtimeMs) {
            return planCache.state;
        }
        planCache.mtimeMs = mtimeMs;
        const parsed = JSON.parse(readFileSync(path, "utf-8"));
        planCache.state = Array.isArray(parsed?.tasks) ? parsed : null;
    }
    catch {
        // Missing, unreadable or mid-write: just show nothing this tick.
        planCache.state = null;
    }
    return planCache.state;
}

function formatPlanStrip(width) {
    const state = readPlanState();
    const tasks = state?.tasks;
    if (!tasks || tasks.length === 0) {
        return null;
    }
    const updatedAt = Date.parse(state.updatedAt ?? "");
    const age = Number.isFinite(updatedAt) ? Date.now() - updatedAt : Number.POSITIVE_INFINITY;
    if (age > PLAN_MAX_AGE_MS) {
        return null;
    }
    const done = tasks.filter((task) => PLAN_DONE_STATUSES.has(task.status)).length;
    if (done === tasks.length && age > PLAN_COMPLETED_LINGER_MS) {
        return null;
    }
    const blocked = tasks.filter((task) => task.status === "blocked").length;
    const current = tasks.find((task) => task.status === "doing")
        ?? tasks.find((task) => task.status === "pending");
    const counter = `plan ${done}/${tasks.length}`;
    const parts = [theme.fg("dim", counter)];
    if (blocked > 0) {
        parts.push(theme.fg("error", `${blocked} blocked`));
    }
    if (current?.title) {
        parts.push(theme.fg("dim", "now: ") + theme.fg("accent", sanitizeStatusText(current.title)));
    }
    else if (done === tasks.length) {
        parts.push(theme.fg("success", "complete"));
    }
    return truncateToWidth(parts.join(theme.fg("dim", " · ")), width, theme.fg("dim", "..."));
}
/**
 * Sanitize text for display in a single-line status.
 * Removes newlines, tabs, carriage returns, and other control characters.
 */
function sanitizeStatusText(text) {
    // Replace newlines, tabs, carriage returns with space, then collapse multiple spaces
    return text
        .replace(/[\r\n\t]/g, " ")
        .replace(/ +/g, " ")
        .trim();
}
/**
 * Format token counts for compact footer display.
 */
function formatTokens(count) {
    if (count < 1000)
        return count.toString();
    if (count < 10000)
        return `${(count / 1000).toFixed(1)}k`;
    if (count < 1000000)
        return `${Math.round(count / 1000)}k`;
    if (count < 10000000)
        return `${(count / 1000000).toFixed(1)}M`;
    return `${Math.round(count / 1000000)}M`;
}
export function formatCwdForFooter(cwd, home) {
    if (!home)
        return cwd;
    const resolvedCwd = resolve(cwd);
    const resolvedHome = resolve(home);
    const relativeToHome = relative(resolvedHome, resolvedCwd);
    const isInsideHome = relativeToHome === "" ||
        (relativeToHome !== ".." && !relativeToHome.startsWith(`..${sep}`) && !isAbsolute(relativeToHome));
    if (!isInsideHome)
        return cwd;
    return relativeToHome === "" ? "~" : `~${sep}${relativeToHome}`;
}
/**
 * Footer component that shows pwd, token stats, and context usage.
 * Computes token/context stats from session, gets git branch and extension statuses from provider.
 */
export class FooterComponent {
    autoCompactEnabled = true;
    session;
    footerData;
    constructor(session, footerData) {
        this.session = session;
        this.footerData = footerData;
    }
    setSession(session) {
        this.session = session;
    }
    setAutoCompactEnabled(enabled) {
        this.autoCompactEnabled = enabled;
    }
    /**
     * No-op: git branch caching now handled by provider.
     * Kept for compatibility with existing call sites in interactive-mode.
     */
    invalidate() {
        // No-op: git branch is cached/invalidated by provider
    }
    /**
     * Clean up resources.
     * Git watcher cleanup now handled by provider.
     */
    dispose() {
        // Git watcher cleanup handled by provider
    }
    render(width) {
        const state = this.session.state;
        // Calculate cumulative usage from ALL session entries (not just post-compaction messages)
        let totalInput = 0;
        let totalOutput = 0;
        let totalCacheRead = 0;
        let totalCacheWrite = 0;
        let totalCost = 0;
        let latestCacheHitRate;
        for (const entry of this.session.sessionManager.getEntries()) {
            if (entry.type === "message" && entry.message.role === "assistant") {
                totalInput += entry.message.usage.input;
                totalOutput += entry.message.usage.output;
                totalCacheRead += entry.message.usage.cacheRead;
                totalCacheWrite += entry.message.usage.cacheWrite;
                totalCost += entry.message.usage.cost.total;
                const latestPromptTokens = entry.message.usage.input + entry.message.usage.cacheRead + entry.message.usage.cacheWrite;
                latestCacheHitRate =
                    latestPromptTokens > 0 ? (entry.message.usage.cacheRead / latestPromptTokens) * 100 : undefined;
            }
        }
        // Calculate context usage from session (handles compaction correctly).
        // After compaction, tokens are unknown until the next LLM response.
        const contextUsage = this.session.getContextUsage();
        const contextWindow = contextUsage?.contextWindow ?? state.model?.contextWindow ?? 0;
        const contextPercentValue = contextUsage?.percent ?? 0;
        const contextPercent = contextUsage?.percent !== null ? contextPercentValue.toFixed(1) : "?";
        // Replace home directory with ~
        let pwd = formatCwdForFooter(this.session.sessionManager.getCwd(), process.env.HOME || process.env.USERPROFILE);
        // Add git branch if available
        const branch = this.footerData.getGitBranch();
        if (branch) {
            pwd = `${pwd} // ${branch}`;
        }
        // Add session name if set
        const sessionName = this.session.sessionManager.getSessionName();
        if (sessionName) {
            pwd = `${pwd} // ${sessionName}`;
        }
        // Build stats line
        const statsParts = [];
        if (totalInput)
            statsParts.push(`in ${formatTokens(totalInput)}`);
        if (totalOutput)
            statsParts.push(`out ${formatTokens(totalOutput)}`);
        if (totalCacheRead)
            statsParts.push(`cache-r ${formatTokens(totalCacheRead)}`);
        if (totalCacheWrite)
            statsParts.push(`cache-w ${formatTokens(totalCacheWrite)}`);
        if ((totalCacheRead > 0 || totalCacheWrite > 0) && latestCacheHitRate !== undefined) {
            statsParts.push(`hit ${latestCacheHitRate.toFixed(1)}%`);
        }
        // Show cost with "(sub)" indicator if using OAuth subscription
        const usingSubscription = state.model ? this.session.modelRegistry.isUsingOAuth(state.model) : false;
        if (totalCost || usingSubscription) {
            const costStr = `$${totalCost.toFixed(3)}${usingSubscription ? " sub" : ""}`;
            statsParts.push(costStr);
        }
        // Colorize context percentage based on usage
        let contextPercentStr;
        const autoIndicator = this.autoCompactEnabled ? " (auto)" : "";
        const contextPercentDisplay = contextPercent === "?"
            ? `?/${formatTokens(contextWindow)}${autoIndicator}`
            : `${contextPercent}%/${formatTokens(contextWindow)}${autoIndicator}`;
        if (contextPercentValue > 90) {
            contextPercentStr = theme.fg("error", contextPercentDisplay);
        }
        else if (contextPercentValue > 70) {
            contextPercentStr = theme.fg("warning", contextPercentDisplay);
        }
        else {
            contextPercentStr = contextPercentDisplay;
        }
        statsParts.push(contextPercentStr);
        if (areExperimentalFeaturesEnabled()) {
            statsParts.push(`${theme.fg("accent", "xp")}`);
        }
        let statsLeft = `${theme.fg("accent", "operator")}`;
        // Add model name on the right side, plus thinking level if model supports it
        let modelName = state.model?.name || state.model?.id || "no-model";
        let statsLeftWidth = visibleWidth(statsLeft);
        // If statsLeft is too wide, truncate it
        if (statsLeftWidth > width) {
            statsLeft = truncateToWidth(statsLeft, width, "...");
            statsLeftWidth = visibleWidth(statsLeft);
        }
        // Calculate available space for padding (minimum 2 spaces between stats and model)
        const minPadding = 2;
        // Add reasoning level indicator if model supports reasoning
        let rightSideWithoutProvider = modelName;
        if (state.model?.reasoning) {
            const thinkingLevel = state.thinkingLevel || "off";
            rightSideWithoutProvider =
                thinkingLevel === "off" ? `${modelName} · reasoning` : `${modelName} · reasoning ${thinkingLevel}`;
        }
        // Prepend the provider in parentheses if there are multiple providers and there's enough room
        let rightSide = rightSideWithoutProvider;
        if (this.footerData.getAvailableProviderCount() > 1 && state.model) {
            rightSide = `[${state.model.provider}] ${rightSideWithoutProvider}`;
            if (statsLeftWidth + minPadding + visibleWidth(rightSide) > width) {
                // Too wide, fall back
                rightSide = rightSideWithoutProvider;
            }
        }
        const rightSideWidth = visibleWidth(rightSide);
        const totalNeeded = statsLeftWidth + minPadding + rightSideWidth;
        let statsLine;
        if (totalNeeded <= width) {
            // Both fit - add padding to right-align model
            const padding = " ".repeat(width - statsLeftWidth - rightSideWidth);
            statsLine = statsLeft + padding + rightSide;
        }
        else {
            // Need to truncate right side
            const availableForRight = width - statsLeftWidth - minPadding;
            if (availableForRight > 0) {
                const truncatedRight = truncateToWidth(rightSide, availableForRight, "");
                const truncatedRightWidth = visibleWidth(truncatedRight);
                const padding = " ".repeat(Math.max(0, width - statsLeftWidth - truncatedRightWidth));
                statsLine = statsLeft + padding + truncatedRight;
            }
            else {
                // Not enough space for right side at all
                statsLine = statsLeft;
            }
        }
        // Apply dim to each part separately. statsLeft may contain color codes (for context %)
        // that end with a reset, which would clear an outer dim wrapper. So we dim the parts
        // before and after the colored section independently.
        const dimStatsLeft = theme.fg("dim", statsLeft);
        const remainder = statsLine.slice(statsLeft.length); // padding + rightSide
        const dimRemainder = theme.fg("dim", remainder);
        const pwdLine = truncateToWidth(theme.fg("dim", pwd), width, theme.fg("dim", "..."));
        const lines = [dimStatsLeft + dimRemainder, pwdLine];
        const planLine = formatPlanStrip(width);
        if (planLine) {
            lines.push(planLine);
        }
        // Add extension statuses on a single line, sorted by key alphabetically
        const extensionStatuses = this.footerData.getExtensionStatuses();
        if (extensionStatuses.size > 0) {
            const sortedStatuses = Array.from(extensionStatuses.entries())
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([, text]) => sanitizeStatusText(text));
            const statusLine = sortedStatuses.join(" ");
            // Truncate to terminal width with dim ellipsis for consistency with footer style
            lines.push(truncateToWidth(statusLine, width, theme.fg("dim", "...")));
        }
        return lines;
    }
}
//# sourceMappingURL=footer.js.map
