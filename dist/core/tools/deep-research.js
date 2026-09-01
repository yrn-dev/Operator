import { completeSimple } from "@earendil-works/pi-ai/compat";
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
const SCORE_MAX = 40;
const CLAIM_CONFIDENCE_MAX = 1;
const MAX_RESEARCH_UNITS = 4;
const MAX_RESEARCH_ITERATIONS = 3;
const MAX_FOLLOWUP_UNITS = 2;
const MONTHS = {
    january: 0,
    february: 1,
    march: 2,
    april: 3,
    may: 4,
    june: 5,
    july: 6,
    august: 7,
    september: 8,
    october: 9,
    november: 10,
    december: 11,
};

const deepResearchSchema = Type.Object({
    query: Type.String({ description: "Research question or topic to investigate deeply" }),
    mode: Type.Optional(Type.Union([
        Type.Literal("official_only"),
        Type.Literal("latest_news"),
        Type.Literal("comparison"),
        Type.Literal("fact_check"),
        Type.Literal("deep_profile"),
    ], { description: "Research mode (default: deep_profile)" })),
    claims: Type.Optional(Type.Array(Type.String({ description: "Specific factual claim to verify" }), { description: "Optional explicit claims for claim-level evaluation" })),
    searchLimit: Type.Optional(Type.Number({ description: "How many search results to gather initially (default: 6, max: 8)" })),
    pageLimit: Type.Optional(Type.Number({ description: "How many result pages to extract and include (default: 4, max: 6)" })),
    freshnessDays: Type.Optional(Type.Number({ description: "Freshness window in days for latest/current questions (default depends on mode)" })),
    minSources: Type.Optional(Type.Number({ description: "Minimum supporting sources expected for stronger confidence (default: 2)" })),
    includeInstant: Type.Optional(Type.Boolean({ description: "Include DuckDuckGo instant answer cross-check (default: true except official_only)" })),
    includeWikipedia: Type.Optional(Type.Boolean({ description: "Include Wikipedia cross-check section (default: true except official_only)" })),
    allowedDomains: Type.Optional(Type.Array(Type.String({ description: "Allowed domain suffix such as openai.com or developers.google.com" }), { description: "Restrict research to these domains or subdomains" })),
    blockedDomains: Type.Optional(Type.Array(Type.String({ description: "Blocked domain suffix such as reddit.com" }), { description: "Exclude these domains or subdomains" })),
});

const STOP_WORDS = new Set([
    "the", "and", "for", "with", "that", "this", "from", "into", "about", "what", "when", "where",
    "which", "while", "have", "has", "were", "their", "there", "would", "could", "should", "your",
    "will", "then", "than", "they", "them", "into", "latest", "current", "today", "official",
]);

const JSON_EXTRACTION_RE = /```(?:json)?\s*([\s\S]*?)```|(\{[\s\S]*\})|(\[[\s\S]*\])/i;

function clampInt(value, fallback, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) {
        return fallback;
    }
    return Math.min(max, Math.max(min, Math.floor(n)));
}

function clampUnit(value) {
    return Math.max(0, Math.min(CLAIM_CONFIDENCE_MAX, value));
}

function normalizeWhitespace(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
}

function tokenize(value) {
    return normalizeWhitespace(value)
        .toLowerCase()
        .replace(/[^a-z0-9\s.-]/g, " ")
        .split(/\s+/)
        .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

function overlapScore(aTokens, bTokens) {
    const aSet = new Set(aTokens);
    const bSet = new Set(bTokens);
    if (aSet.size === 0 || bSet.size === 0) {
        return 0;
    }
    let overlap = 0;
    for (const token of aSet) {
        if (bSet.has(token)) {
            overlap++;
        }
    }
    // Recall: match rate vs SMALLER set — short claims score better
    return overlap / Math.min(aSet.size, bSet.size);
}

// Cross-language: extract Latin-only tokens when languages differ
function extractLatinTokens(value) {
    return normalizeWhitespace(value)
        .toLowerCase()
        .replace(/[^a-z0-9\s.-]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length >= 3 && !STOP_WORDS.has(t));
}

function crossLanguageOverlapScore(aTokens, bTokens) {
    const aHasCyrillic = /[а-яё]/i.test(aTokens.join(" "));
    const bHasCyrillic = /[а-яё]/i.test(bTokens.join(" "));
    if (aHasCyrillic === bHasCyrillic) {
        return null; // Same language, use normal overlap
    }
    const aLatin = extractLatinTokens(aTokens.join(" "));
    const bLatin = extractLatinTokens(bTokens.join(" "));
    const aSet = new Set(aLatin);
    const bSet = new Set(bLatin);
    if (aSet.size === 0 || bSet.size === 0) {
        return 0;
    }
    let overlap = 0;
    for (const token of aSet) {
        if (bSet.has(token)) {
            overlap++;
        }
    }
    return overlap / Math.min(aSet.size, bSet.size);
}


function formatDeepResearchCall(args, theme) {
    const query = str(args?.query);
    const mode = str(args?.mode) || "deep_profile";
    const invalidArg = invalidArgText(theme);
    return `${theme.fg("toolTitle", theme.bold("deep.research"))} ${theme.fg("toolOutput", `[${mode}] `)}${query === null ? invalidArg : theme.fg("accent", query || "...")}`;
}

function formatDeepResearchResult(result, options, theme, showImages) {
    const output = getTextOutput(result, showImages).trim();
    if (!output) {
        return "";
    }
    const lines = output.split("\n");
    const maxLines = options.expanded ? lines.length : 34;
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

function runHelper(args, signal) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [WEB_SEARCH_HELPER, "--json", ...args], {
            stdio: ["ignore", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        let settled = false;
        const settle = (fn) => {
            if (settled) {
                return;
            }
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
                settle(() => reject(new Error(stderr.trim() || `web search helper exited with code ${code}`)));
                return;
            }
            const output = stdout.trim();
            if (!output) {
                settle(() => resolve(null));
                return;
            }
            try {
                settle(() => resolve(JSON.parse(output)));
            }
            catch (error) {
                const message = error instanceof Error ? error.message : "invalid JSON";
                settle(() => reject(new Error(`Failed to parse helper output: ${message}`)));
            }
        });
    });
}

function normalizeDomain(value) {
    return String(value || "").trim().toLowerCase().replace(/^\.+/, "");
}

function getHostname(rawUrl) {
    try {
        return new URL(rawUrl).hostname.toLowerCase();
    }
    catch {
        return "";
    }
}

function domainMatches(hostname, suffix) {
    const clean = normalizeDomain(suffix);
    if (!clean || !hostname) {
        return false;
    }
    return hostname === clean || hostname.endsWith(`.${clean}`);
}

function classifySourceType(hostname) {
    if (!hostname) {
        return "unknown";
    }
    if (hostname.endsWith(".gov") || hostname.endsWith(".edu") || hostname.includes("docs.") || hostname.includes("developer.") || hostname.includes("developers.") || hostname.includes("api.") || hostname.includes("support.") || hostname.includes("help.")) {
        return "official";
    }
    if (hostname.includes("wikipedia.org") || hostname.includes("github.com")) {
        return "secondary";
    }
    if (hostname.includes("reddit.com") || hostname.includes("stackexchange.com") || hostname.includes("stackoverflow.com") || hostname.includes("news.ycombinator.com")) {
        return "community";
    }
    return "secondary";
}

function domainScore(hostname) {
    const type = classifySourceType(hostname);
    if (hostname.endsWith(".gov")) {
        return 10;
    }
    if (hostname.endsWith(".edu")) {
        return 9;
    }
    if (type === "official") {
        return 8;
    }
    if (type === "secondary") {
        return 5;
    }
    if (type === "community") {
        return 2;
    }
    return 3;
}

function contentDateCandidates(value) {
    const text = normalizeWhitespace(value);
    const dates = [];
    const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/g) || [];
    for (const item of iso) {
        const d = new Date(item);
        if (!Number.isNaN(d.getTime())) {
            dates.push(d);
        }
    }
    const slash = text.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/g) || [];
    for (const item of slash) {
        const [month, day, year] = item.split("/");
        const d = new Date(Number(year), Number(month) - 1, Number(day));
        if (!Number.isNaN(d.getTime())) {
            dates.push(d);
        }
    }
    const monthNames = text.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+20\d{2}\b/gi) || [];
    for (const item of monthNames) {
        const match = item.match(/\b([A-Za-z]+)\s+(\d{1,2}),\s+(20\d{2})\b/);
        if (!match) {
            continue;
        }
        const month = MONTHS[match[1].toLowerCase()];
        const day = Number(match[2]);
        const year = Number(match[3]);
        const d = new Date(year, month, day);
        if (!Number.isNaN(d.getTime())) {
            dates.push(d);
        }
    }
    return dates;
}

function pickMostRecentDate(source) {
    const dates = [
        ...contentDateCandidates(source.title),
        ...contentDateCandidates(source.snippet),
        ...contentDateCandidates(source.extract),
    ];
    if (dates.length === 0) {
        return null;
    }
    return dates.sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
}

function freshnessWindowForMode(mode, explicitValue) {
    if (explicitValue !== undefined) {
        return clampInt(explicitValue, 30, 1, 3650);
    }
    if (mode === "latest_news") {
        return 30;
    }
    if (mode === "fact_check") {
        return 365;
    }
    return 730;
}

function freshnessScore(publishedAt, now, freshnessWindowDays, mode) {
    if (!publishedAt) {
        return mode === "latest_news" ? 0 : 3;
    }
    const ageDays = Math.max(0, (now.getTime() - publishedAt.getTime()) / 86400000);
    if (ageDays <= freshnessWindowDays * 0.25) {
        return 10;
    }
    if (ageDays <= freshnessWindowDays * 0.5) {
        return 8;
    }
    if (ageDays <= freshnessWindowDays) {
        return 6;
    }
    if (ageDays <= freshnessWindowDays * 2) {
        return 3;
    }
    return 1;
}

function extractEvidenceSnippet(source, queryTokens) {
    const candidates = [source.extract, source.snippet, source.summary, source.title]
        .filter(Boolean)
        .map((value) => normalizeWhitespace(value));
    for (const candidate of candidates) {
        const lower = candidate.toLowerCase();
        const hits = queryTokens.filter((token) => lower.includes(token)).length;
        if (hits >= Math.max(2, Math.min(4, queryTokens.length))) {
            return candidate.slice(0, 340);
        }
    }
    return candidates[0]?.slice(0, 340) || "";
}

function extractNumbersAndDates(value) {
    const text = normalizeWhitespace(value);
    const numeric = text.match(/\b\d+(?:[.,]\d+)?%?\b/g) || [];
    const dates = contentDateCandidates(text).map((item) => item.toISOString().slice(0, 10));
    return [...numeric.slice(0, 8), ...dates.slice(0, 8)];
}

function evidenceScore(queryTokens, source) {
    const sourceTokens = tokenize([source.title, source.snippet, source.extract].filter(Boolean).join(" "));
    const overlap = overlapScore(queryTokens, sourceTokens);
    let score = overlap * 10;
    const evidenceText = [source.extract, source.snippet].filter(Boolean).join(" ");
    if (extractNumbersAndDates(evidenceText).length > 0) {
        score += 2;
    }
    if (source.extract && normalizeWhitespace(source.extract).length > 180) {
        score += 1;
    }
    return Math.min(10, score);
}

function relevanceScore(queryTokens, source) {
    const sourceTokens = tokenize([source.title, source.snippet, source.summary, source.extract].filter(Boolean).join(" "));
    const overlap = overlapScore(queryTokens, sourceTokens);
    return Math.min(10, overlap * 12);
}

function penaltyScore(hostname, source) {
    let penalty = 0;
    if (hostname.includes("reddit.com") || hostname.includes("medium.com") || hostname.includes("quora.com")) {
        penalty += 4;
    }
    if (hostname.includes("scriptbyai.com") || hostname.includes("codewords.ai") || hostname.includes("reintech.io")) {
        penalty += 2;
    }
    const combined = normalizeWhitespace([source.title, source.snippet].filter(Boolean).join(" ")).toLowerCase();
    if (combined.includes("ultimate guide") || combined.includes("workaround") || combined.includes("best")) {
        penalty += 1;
    }
    if (!source.extract && !source.snippet) {
        penalty += 1;
    }
    return Math.min(10, penalty);
}

function uniqueByUrl(items) {
    const seen = new Set();
    const out = [];
    for (const item of items) {
        const key = item?.url || `${item?.title || ""}:${item?._hostname || ""}`;
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        out.push(item);
    }
    return out;
}

function buildDefaultClaims(query, mode, explicitClaims) {
    if (Array.isArray(explicitClaims) && explicitClaims.length > 0) {
        return explicitClaims.map((item) => normalizeWhitespace(item)).filter(Boolean);
    }
    if (mode === "comparison") {
        return [
            normalizeWhitespace(query),
            `Key differences and tradeoffs for: ${normalizeWhitespace(query)}`,
        ];
    }
    return [normalizeWhitespace(query)];
}

function compareEvidenceValues(values) {
    const normalized = values.map((value) => value.trim()).filter(Boolean);
    const unique = [...new Set(normalized)];
    return unique.length > 1;
}

function scoreClaim(claim, sources, options) {
    const claimTokens = tokenize(claim);
    const supporting = [];
    for (const source of sources) {
        const evidenceText = [source.title, source.snippet, source.extract].filter(Boolean).join(" ");
        const sourceTokens = tokenize(evidenceText);
        let overlap = overlapScore(claimTokens, sourceTokens);
        // Cross-language fallback: if overlap is low, try Latin-token matching
        if (overlap < 0.22) {
            const crossLang = crossLanguageOverlapScore(claimTokens, sourceTokens);
            if (crossLang !== null && crossLang > overlap) {
                overlap = crossLang;
            }
        }
        const exactEvidence = extractEvidenceSnippet(source, claimTokens);
        const evidenceValues = extractNumbersAndDates(exactEvidence);
        if (overlap >= 0.18 || (evidenceValues.length > 0 && overlap >= 0.12)) {
            supporting.push({
                ...source,
                _claimOverlap: overlap,
                _claimEvidence: exactEvidence,
                _claimEvidenceValues: evidenceValues,
            });
        }
    }
    const sorted = supporting.sort((a, b) => b._score - a._score);
    const top = sorted.slice(0, Math.max(1, options.minSources + 1));
    const hasOfficial = top.some((item) => item._sourceType === "official");
    const hasFresh = top.some((item) => item._freshnessScore >= 6);
    const sourceQuality = clampUnit((top.reduce((sum, item) => sum + item._score, 0) / Math.max(top.length, 1)) / SCORE_MAX);
    const evidenceDirectness = clampUnit(top.reduce((sum, item) => sum + item._evidenceScore / 10, 0) / Math.max(top.length, 1));
    const freshness = clampUnit(top.reduce((sum, item) => sum + item._freshnessScore / 10, 0) / Math.max(top.length, 1));
    const evidenceValues = top.flatMap((item) => item._claimEvidenceValues || []).slice(0, 12);
    const conflicting = compareEvidenceValues(evidenceValues) && evidenceValues.length >= 2;
    const crossSourceAgreement = conflicting
        ? 0.25
        : clampUnit(top.length >= options.minSources ? 0.85 : top.length >= 1 ? 0.55 : 0.15);
    const confidence = clampUnit(0.35 * sourceQuality + 0.30 * crossSourceAgreement + 0.20 * freshness + 0.15 * evidenceDirectness);
    let status = "unclear";
    if (conflicting) {
        status = "conflicting";
    }
    else if ((options.mode === "official_only" || options.highStakes) && !hasOfficial) {
        status = "unclear";
    }
    else if (options.mode === "latest_news" && !hasFresh) {
        status = "unclear";
    }
    else if (confidence >= 0.78) {
        status = "confirmed";
    }
    else if (confidence >= 0.55) {
        status = "likely";
    }
    return {
        claim,
        status,
        confidence,
        hasOfficial,
        hasFresh,
        conflicting,
        sourceQuality,
        crossSourceAgreement,
        freshness,
        evidenceDirectness,
        supports: top.slice(0, 4),
    };
}

function formatSourceLine(index, source) {
    const parts = [
        `${index}. ${source.title || source.url || `Source ${index}`}`,
        `   URL: ${source.url}`,
        `   Type: ${source._sourceType}`,
        `   Score S = ${source._score.toFixed(2)} = D${source._domainScore} + R${source._relevanceScore.toFixed(2)} + T${source._freshnessScore} + E${source._evidenceScore.toFixed(2)} - C${source._penaltyScore}`,
    ];
    if (source._publishedAt) {
        parts.push(`   Published: ${source._publishedAt.toISOString().slice(0, 10)}`);
    }
    if (source._evidenceSnippet) {
        parts.push(`   Evidence: ${source._evidenceSnippet}`);
    }
    return parts;
}

function renderClaimsSection(claimResults) {
    const lines = ["Claim evaluation"];
    for (const [index, result] of claimResults.entries()) {
        lines.push(`${index + 1}. Claim: ${result.claim}`);
        lines.push(`   Status: ${result.status}`);
        lines.push(`   Confidence: ${(result.confidence * 100).toFixed(1)}%`);
        lines.push(`   Formula: 0.35*${result.sourceQuality.toFixed(2)} + 0.30*${result.crossSourceAgreement.toFixed(2)} + 0.20*${result.freshness.toFixed(2)} + 0.15*${result.evidenceDirectness.toFixed(2)}`);
        lines.push(`   Official support: ${result.hasOfficial ? "yes" : "no"}`);
        lines.push(`   Fresh support: ${result.hasFresh ? "yes" : "no"}`);
        lines.push(`   Conflict detected: ${result.conflicting ? "yes" : "no"}`);
        if (result.supports.length === 0) {
            lines.push("   Supporting sources: none");
            continue;
        }
        lines.push("   Supporting sources:");
        for (const [supportIndex, source] of result.supports.entries()) {
            lines.push(`   - ${supportIndex + 1}. ${source.title || source.url}`);
            lines.push(`     ${source.url}`);
            if (source._claimEvidence) {
                lines.push(`     Evidence: ${source._claimEvidence}`);
            }
        }
    }
    return lines;
}

function renderSummary(mode, claimResults, now) {
    const confirmed = claimResults.filter((item) => item.status === "confirmed").length;
    const likely = claimResults.filter((item) => item.status === "likely").length;
    const unclear = claimResults.filter((item) => item.status === "unclear").length;
    const conflicting = claimResults.filter((item) => item.status === "conflicting").length;
    const dominant = conflicting > 0 ? "conflicting" : confirmed > 0 && unclear === 0 ? "confirmed" : likely > 0 ? "likely" : "unclear";
    return [
        "Research summary",
        `- Verification date: ${now.toISOString().slice(0, 10)}`,
        `- Mode: ${mode}`,
        `- Overall verdict: ${dominant}`,
        `- Claims confirmed: ${confirmed}`,
        `- Claims likely: ${likely}`,
        `- Claims unclear: ${unclear}`,
        `- Claims conflicting: ${conflicting}`,
    ];
}

function renderPolicySection(mode) {
    const lines = ["Anti-error policy"];
    lines.push("- Do not treat Wikipedia as the primary source for operational facts.");
    lines.push("- Do not rank SEO/blog aggregators above official docs when official docs exist.");
    lines.push("- Do not answer with exact dates or numbers unless direct evidence exists in the extracted text.");
    lines.push("- If the query is current/latest and there is no fresh source, the final answer should stay below confident mode.");
    if (mode === "official_only") {
        lines.push("- This mode requires official sources for confidence above unclear.");
    }
    return lines;
}

function renderInstantSection(data) {
    if (!data || typeof data !== "object") {
        return [];
    }
    const lines = [];
    if (data.heading) {
        lines.push(`Heading: ${data.heading}`);
    }
    if (data.answer) {
        lines.push(`Answer: ${data.answer}`);
    }
    if (data.abstract) {
        lines.push(`Abstract: ${data.abstract}`);
    }
    if (data.source || data.sourceUrl) {
        lines.push(`Source: ${data.source || "unknown"}${data.sourceUrl ? ` - ${data.sourceUrl}` : ""}`);
    }
    return lines;
}

function parseJsonResponse(text, fallback) {
    const normalized = String(text || "").trim();
    if (!normalized) {
        return fallback;
    }
    const match = normalized.match(JSON_EXTRACTION_RE);
    const candidate = (match?.[1] || match?.[2] || match?.[3] || normalized).trim();
    try {
        return JSON.parse(candidate);
    }
    catch {
        return fallback;
    }
}

async function callModel(ctx, systemPrompt, userPrompt, signal, maxTokens = 1600) {
    if (!ctx?.model || !ctx?.modelRegistry?.getApiKeyAndHeaders) {
        throw new Error("deep_research requires runtime model context");
    }
    const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
    if (!auth?.ok) {
        throw new Error(auth?.error || "Failed to load model auth");
    }
    const response = await completeSimple(ctx.model, {
        systemPrompt,
        messages: [
            {
                role: "user",
                content: [{ type: "text", text: userPrompt }],
                timestamp: Date.now(),
            },
        ],
    }, {
        signal,
        maxTokens,
        apiKey: auth.apiKey ?? "ollama-local",
        headers: auth.headers,
    });
    if (response.stopReason === "error") {
        throw new Error(response.errorMessage || "Model request failed");
    }
    return response.content
        .filter((item) => item.type === "text")
        .map((item) => item.text)
        .join("\n")
        .trim();
}

async function clarifyWithUser(query, mode, now, ctx, signal) {
    const text = await callModel(ctx, [
        "You are the clarify_with_user node of a deep research graph.",
        "Respond only as valid JSON with keys need_clarification, question, verification.",
        "Ask for clarification only when the query is materially ambiguous or contains undefined acronyms that block the research.",
    ].join("\n"), [
        `Today's date is ${now.toISOString().slice(0, 10)}.`,
        `Mode: ${mode}`,
        `User query: ${query}`,
    ].join("\n"), signal, 500);
    const fallback = { need_clarification: false, question: "", verification: "Sufficient detail detected. Research can begin." };
    const parsed = parseJsonResponse(text, fallback);
    return {
        need_clarification: Boolean(parsed?.need_clarification),
        question: normalizeWhitespace(parsed?.question || ""),
        verification: normalizeWhitespace(parsed?.verification || fallback.verification),
    };
}

async function writeResearchBrief(query, mode, options, now, ctx, signal) {
    const text = await callModel(ctx, [
        "You are the write_research_brief node of a deep research graph.",
        "Rewrite the user's query into a concrete research brief in first person.",
        "Preserve constraints, freshness needs, preferred sources, and unanswered dimensions as open-ended instead of guessing.",
        "Return plain text only.",
    ].join("\n"), [
        `Today's date is ${now.toISOString().slice(0, 10)}.`,
        `Mode: ${mode}`,
        `Query: ${query}`,
        `Allowed domains: ${(options.allowedDomains || []).join(", ") || "none"}`,
        `Blocked domains: ${(options.blockedDomains || []).join(", ") || "none"}`,
        options.claims?.length ? `Claims to verify: ${options.claims.join(" | ")}` : "",
    ].filter(Boolean).join("\n"), signal, 900);
    return normalizeWhitespace(text) || query;
}

async function supervisorPlan(brief, mode, now, ctx, signal) {
    const text = await callModel(ctx, [
        "You are the research_supervisor node of a deep research graph.",
        `Create at most ${MAX_RESEARCH_UNITS} parallel research units.`,
        "Return only JSON with keys strategy, focus_areas, stop_conditions.",
        "focus_areas must be an array of objects with keys topic and goal.",
        "Bias toward one unit unless the topic clearly decomposes into independent lanes.",
    ].join("\n"), [
        `Today's date is ${now.toISOString().slice(0, 10)}.`,
        `Mode: ${mode}`,
        `Research brief: ${brief}`,
    ].join("\n"), signal, 900);
    const fallback = {
        strategy: "Single-lane research on the full brief.",
        focus_areas: [{ topic: brief, goal: "Gather direct evidence and primary sources for the full brief." }],
        stop_conditions: ["Stop when the core claims have direct evidence from multiple relevant sources."],
    };
    const parsed = parseJsonResponse(text, fallback);
    const focusAreas = Array.isArray(parsed?.focus_areas) && parsed.focus_areas.length > 0
        ? parsed.focus_areas.slice(0, MAX_RESEARCH_UNITS).map((item) => ({
            topic: normalizeWhitespace(item?.topic || ""),
            goal: normalizeWhitespace(item?.goal || ""),
        })).filter((item) => item.topic)
        : fallback.focus_areas;
    return {
        strategy: normalizeWhitespace(parsed?.strategy || fallback.strategy),
        focusAreas,
        stopConditions: Array.isArray(parsed?.stop_conditions)
            ? parsed.stop_conditions.map((item) => normalizeWhitespace(item)).filter(Boolean)
            : fallback.stop_conditions,
    };
}

async function followUpSupervisorPlan(brief, mode, now, claimResults, rawNotes, ctx, signal) {
    const weakClaims = claimResults.filter((item) => item.status === "unclear" || item.status === "conflicting");
    if (weakClaims.length === 0) {
        return [];
    }
    const text = await callModel(ctx, [
        "You are the follow-up research_supervisor node of a deep research graph.",
        `Create at most ${MAX_FOLLOWUP_UNITS} follow-up research units.`,
        "Focus only on unresolved claims, missing evidence, conflicting numbers, dates, or weak sourcing.",
        "Return only JSON with key focus_areas. Each item must have topic and goal.",
    ].join("\n"), [
        `Today's date is ${now.toISOString().slice(0, 10)}.`,
        `Mode: ${mode}`,
        `Research brief: ${brief}`,
        `<weak-claims>\n${weakClaims.map((item, index) => `${index + 1}. ${item.claim} | ${item.status} | ${(item.confidence * 100).toFixed(1)}%`).join("\n")}\n</weak-claims>`,
        `<existing-notes>\n${rawNotes.join("\n\n").slice(0, 7000)}\n</existing-notes>`,
    ].join("\n\n"), signal, 1000);
    const parsed = parseJsonResponse(text, { focus_areas: [] });
    if (!Array.isArray(parsed?.focus_areas)) {
        return [];
    }
    return parsed.focus_areas
        .slice(0, MAX_FOLLOWUP_UNITS)
        .map((item) => ({
        topic: normalizeWhitespace(item?.topic || ""),
        goal: normalizeWhitespace(item?.goal || ""),
    }))
        .filter((item) => item.topic);
}

async function compressFindings(brief, rawNotes, pageExtracts, ctx, signal) {
    const extractsBlock = pageExtracts && pageExtracts.length > 0
        ? pageExtracts.map((item, idx) => {
            const text = item.extract || item.error || "No content";
            return `  [${idx + 1}] ${item.url || "unknown"}\n  ${text.slice(0, 2800)}`;
        }).join("\n\n")
        : "No page extracts available.";
    const text = await callModel(ctx, [
        "You are the compress_research node of a deep research graph.",
        "Clean up the raw research notes without losing any relevant evidence.",
        "Preserve exact dates, numbers, verdicts, and URLs.",
        "Use the full page extracts as the primary evidence source.",
        "Return markdown with sections: Queries, Findings, Sources.",
    ].join("\n"), [
        `Research brief: ${brief}`,
        "<raw-notes>",
        rawNotes.join("\n\n"),
        "</raw-notes>",
        "<page-extracts>",
        extractsBlock,
        "</page-extracts>",
    ].join("\n"), signal, 3000);
    return text || rawNotes.join("\n\n");
}

async function finalReport(brief, mode, compressedFindings, claimResults, now, ctx, signal) {
    const claimsBlock = claimResults.map((item, index) => [
        `${index + 1}. ${item.claim}`,
        `status: ${item.status}`,
        `confidence: ${(item.confidence * 100).toFixed(1)}%`,
    ].join("\n")).join("\n\n");
    return await callModel(ctx, [
        "You are the final_report_generation node of a deep research graph.",
        "Write a comprehensive final answer in the same language as the research brief.",
        "Start with a short verdict, then confirmed facts, then unclear or conflicting areas, then sources.",
        "Do not upgrade unclear or conflicting claims into confident language.",
        "Use markdown headings and cite sources inline with markdown links.",
        "CRITICAL RULES:",
        "1. ONLY use facts from the <findings> section. Never invent data, prices, benchmarks, or URLs.",
        "2. If a fact is NOT in the findings, say 'not publicly confirmed' — do NOT guess.",
        "3. Do NOT create fake source URLs. Only cite URLs actually present in the findings.",
        "4. If findings contain insufficient data, state 'Insufficient evidence' rather than guessing.",
    ].join("\n"), [
        `Today's date is ${now.toISOString().slice(0, 10)}.`,
        `Mode: ${mode}`,
        `<research-brief>\n${brief}\n</research-brief>`,
        `<claim-verdicts>\n${claimsBlock}\n</claim-verdicts>`,
        `<findings>\n${compressedFindings}\n</findings>`,
    ].join("\n\n"), signal, 2600);
}

function buildSearchQueries(topic, goal, query, mode) {
    const queries = [normalizeWhitespace(topic)];
    if (goal) {
        queries.push(normalizeWhitespace(`${topic} ${goal}`));
    }
    if (mode === "official_only") {
        queries.push(normalizeWhitespace(`${topic} official documentation`));
    }
    if (mode === "latest_news") {
        queries.push(normalizeWhitespace(`${topic} latest news`));
    }
    if (topic !== query) {
        queries.push(normalizeWhitespace(`${query} ${topic}`));
    }
    return [...new Set(queries.filter(Boolean))].slice(0, 3);
}

async function planResearchQueries(unit, config, ctx, signal) {
    const text = await callModel(ctx, [
        "You are the researcher query planner node of a deep research graph.",
        `Return only JSON with key queries as an array of at most ${MAX_RESEARCH_ITERATIONS + 2} search queries.`,
        "Generate a mix of broad, precise, and evidence-seeking queries.",
        "Prefer queries that surface primary or official sources, exact dates, exact numbers, specifications, and direct documentation.",
    ].join("\n"), [
        `Mode: ${config.mode}`,
        `Overall query: ${config.query}`,
        `Topic: ${unit.topic}`,
        unit.goal ? `Goal: ${unit.goal}` : "",
        config.allowedDomains.length ? `Allowed domains: ${config.allowedDomains.join(", ")}` : "",
        config.mode === "latest_news" ? "Freshness is critical. Prefer current coverage and dated sources." : "",
        config.mode === "official_only" ? "Official or primary documentation is required whenever possible." : "",
    ].filter(Boolean).join("\n"), signal, 700);
    const parsed = parseJsonResponse(text, { queries: [] });
    const llmQueries = Array.isArray(parsed?.queries)
        ? parsed.queries.map((item) => normalizeWhitespace(item)).filter(Boolean)
        : [];
    return [...new Set([...buildSearchQueries(unit.topic, unit.goal, config.query, config.mode), ...llmQueries])]
        .slice(0, MAX_RESEARCH_ITERATIONS + 2);
}

async function runResearchUnit(unit, config, ctx, signal) {
    const querySet = await planResearchQueries(unit, config, ctx, signal);
    const allResults = [];
    for (const q of querySet.slice(0, MAX_RESEARCH_ITERATIONS + 2)) {
        const ddg = await runHelper(["--ddg", q, "--limit", String(config.searchLimit)], signal);
        if (Array.isArray(ddg)) {
            for (const item of ddg) {
                allResults.push(item);
            }
        }
    }
    const instant = config.includeInstant ? await runHelper(["--instant", unit.topic], signal) : null;
    const wiki = config.includeWikipedia ? await runHelper(["--wiki", unit.topic, "--limit", "3"], signal) : null;
    let rankedResults = allResults.map((item) => {
        const hostname = getHostname(item?.url);
        return {
            ...item,
            _hostname: hostname,
            _sourceType: classifySourceType(hostname),
        };
    }).filter((item) => {
        if (!item._hostname) {
            return false;
        }
        if (config.blockedDomains.some((suffix) => domainMatches(item._hostname, suffix))) {
            return false;
        }
        if (config.allowedDomains.length > 0 && !config.allowedDomains.some((suffix) => domainMatches(item._hostname, suffix))) {
            return false;
        }
        if (config.mode === "official_only" && item._sourceType !== "official") {
            return false;
        }
        return true;
    });
    rankedResults = uniqueByUrl(rankedResults);
    const pageTargets = rankedResults.slice(0, config.pageLimit);
    const pageExtracts = await Promise.all(pageTargets.map(async (item) => {
        try {
            const page = await runHelper(["--page", item.url], signal);
            return {
                url: item.url,
                extract: typeof page?.preview === "string"
                    ? normalizeWhitespace(page.preview).slice(0, 2200)
                    : typeof page?.text === "string"
                        ? normalizeWhitespace(page.text).slice(0, 2200)
                        : "",
            };
        }
        catch (error) {
            return {
                url: item.url,
                error: error instanceof Error ? error.message : "failed to extract page",
            };
        }
    }));
    const pageExtractMap = new Map(pageExtracts.map((item) => [item.url, item]));
    const queryTokens = tokenize(`${config.query} ${unit.topic} ${unit.goal || ""}`);
    const scoredSources = rankedResults.map((item, index) => {
        const page = pageExtractMap.get(item.url);
        const source = {
            ...item,
            topic: unit.topic,
            extract: page?.extract || "",
            _publishedAt: pickMostRecentDate({
                title: item.title,
                snippet: item.snippet,
                extract: page?.extract,
            }),
        };
        source._domainScore = domainScore(source._hostname);
        source._relevanceScore = relevanceScore(queryTokens, source);
        source._freshnessScore = freshnessScore(source._publishedAt, config.now, config.freshnessWindowDays, config.mode);
        source._evidenceScore = evidenceScore(queryTokens, source);
        source._penaltyScore = penaltyScore(source._hostname, source);
        source._score = source._domainScore + source._relevanceScore + source._freshnessScore + source._evidenceScore - source._penaltyScore - index * 0.01;
        source._evidenceSnippet = extractEvidenceSnippet(source, queryTokens);
        return source;
    }).sort((a, b) => b._score - a._score);
    const rawNoteLines = [
        `Topic: ${unit.topic}`,
        unit.goal ? `Goal: ${unit.goal}` : "",
        `Queries: ${querySet.join(" | ")}`,
        ...scoredSources.slice(0, Math.max(config.pageLimit, 4)).flatMap((source, index) => [
            `${index + 1}. ${source.title || source.url}`,
            `URL: ${source.url}`,
            `Type: ${source._sourceType}`,
            source._publishedAt ? `Published: ${source._publishedAt.toISOString().slice(0, 10)}` : "",
            source._evidenceSnippet ? `Evidence: ${source._evidenceSnippet}` : "",
        ].filter(Boolean)),
    ].filter(Boolean);
    return {
        topic: unit.topic,
        goal: unit.goal,
        queries: querySet,
        instant,
        wiki,
        scoredSources,
        pageExtracts,
        rawNote: rawNoteLines.join("\n"),
    };
}

function dedupeSources(units) {
    return uniqueByUrl(units.flatMap((unit) => unit.scoredSources));
}

function flattenExtracts(units) {
    return units.flatMap((unit) => unit.pageExtracts.map((extract) => ({ ...extract, topic: unit.topic })));
}

function buildReportText(report, state) {
    const lines = [];
    lines.push(...renderSummary(state.mode, state.claimResults, state.now));
    lines.push("");
    lines.push("Graph stages");
    lines.push(`- clarify_with_user: ${state.clarification.needClarification ? "needs clarification" : "ready"}`);
    if (state.clarification.question) {
        lines.push(`- clarification question: ${state.clarification.question}`);
    }
    if (state.clarification.verification) {
        lines.push(`- verification: ${state.clarification.verification}`);
    }
    lines.push(`- write_research_brief: ${state.researchBrief}`);
    lines.push(`- research_supervisor strategy: ${state.plan.strategy}`);
    lines.push(`- parallel research units: ${state.plan.focusAreas.length}`);
    for (const [index, unit] of state.plan.focusAreas.entries()) {
        lines.push(`  ${index + 1}. ${unit.topic}${unit.goal ? ` | ${unit.goal}` : ""}`);
    }
    if (state.followUpFocusAreas?.length) {
        lines.push(`- follow-up research units: ${state.followUpFocusAreas.length}`);
        for (const [index, unit] of state.followUpFocusAreas.entries()) {
            lines.push(`  F${index + 1}. ${unit.topic}${unit.goal ? ` | ${unit.goal}` : ""}`);
        }
    }
    lines.push("");
    lines.push(...renderClaimsSection(state.claimResults));
    lines.push("");
    if (state.includeInstant && state.units.some((unit) => unit.instant)) {
        lines.push("Instant cross-check");
        for (const unit of state.units) {
            if (!unit.instant) {
                continue;
            }
            lines.push(`- Topic: ${unit.topic}`);
            for (const line of renderInstantSection(unit.instant)) {
                lines.push(`  - ${line}`);
            }
        }
        lines.push("");
    }
    lines.push("Research supervisor findings");
    if (state.scoredSources.length === 0) {
        lines.push("- none");
    }
    else {
        for (const [index, source] of state.scoredSources.entries()) {
            lines.push(...formatSourceLine(index + 1, source));
        }
    }
    lines.push("");
    if (state.includeWikipedia) {
        lines.push("Wikipedia cross-check");
        const allWiki = state.units.flatMap((unit) => Array.isArray(unit.wiki) ? unit.wiki.map((item) => ({ ...item, topic: unit.topic })) : []);
        if (allWiki.length === 0) {
            lines.push("- none");
        }
        else {
            for (const [index, item] of allWiki.entries()) {
                lines.push(`${index + 1}. ${item.title || item.url || `Wikipedia ${index + 1}`}`);
                if (item.topic) {
                    lines.push(`   Topic: ${item.topic}`);
                }
                if (item.url) {
                    lines.push(`   URL: ${item.url}`);
                }
                if (item.summary) {
                    lines.push(`   Summary: ${normalizeWhitespace(item.summary).slice(0, 320)}`);
                }
            }
        }
        lines.push("");
    }
    lines.push("Primary source extracts");
    if (state.pageExtracts.length === 0) {
        lines.push("- none");
    }
    else {
        for (const [index, item] of state.pageExtracts.entries()) {
            lines.push(`${index + 1}. ${item.url}`);
            if (item.topic) {
                lines.push(`   Topic: ${item.topic}`);
            }
            if (item.error) {
                lines.push(`   Extract error: ${item.error}`);
            }
            else if (item.extract) {
                lines.push(`   Extract: ${item.extract}`);
            }
        }
    }
    lines.push("");
    lines.push("Compressed research");
    lines.push(state.compressedFindings);
    lines.push("");
    lines.push("Final report");
    lines.push(report);
    lines.push("");
    lines.push(...renderPolicySection(state.mode));
    lines.push("");
    lines.push("Answer contract");
    lines.push("- Final answer should start with a short verdict.");
    lines.push("- Then state what is confirmed, what is unclear, and what evidence supports it.");
    lines.push("- Include the verification date and cite URLs when making factual claims.");
    return lines.join("\n").trim();
}

export function createDeepResearchToolDefinition(_cwd, _options) {
    return {
        name: "deep_research",
        label: "deep.research",
        description: "Run a graph-style deep research pipeline with clarify, brief generation, supervisor planning, parallel researchers, compression, claim-level scoring, and final report synthesis.",
        promptSnippet: "Run a graph-style deep research pass with clarify, brief, supervisor, parallel researchers, compression, and final report",
        promptGuidelines: [
            "Use deep_research for high-accuracy external research, current facts, operational details, and answers that need explicit confidence instead of guesses.",
            "When deep_research returns unclear or conflicting, do not promote the final answer to confirmed language.",
            "Preserve the graph stages: clarify, research brief, supervisor, researcher lanes, compression, and final report.",
        ],
        parameters: deepResearchSchema,
        async execute(_toolCallId, args, signal, _onUpdate, ctx) {
            if (!existsSync(WEB_SEARCH_HELPER)) {
                throw new Error(`Web search helper not found: ${WEB_SEARCH_HELPER}`);
            }
            const effectiveQuery = str(args.query)?.trim();
            if (!effectiveQuery) {
                throw new Error("query is required");
            }
            const mode = str(args.mode) || "deep_profile";
            const searchLimit = clampInt(args.searchLimit, 6, 3, 8);
            const pageLimit = clampInt(args.pageLimit, 4, 2, 6);
            const minSources = clampInt(args.minSources, 2, 1, 4);
            const freshnessWindowDays = freshnessWindowForMode(mode, args.freshnessDays);
            const allowedDomains = Array.isArray(args.allowedDomains) ? args.allowedDomains.map(normalizeDomain).filter(Boolean) : [];
            const blockedDomains = Array.isArray(args.blockedDomains) ? args.blockedDomains.map(normalizeDomain).filter(Boolean) : [];
            const includeInstant = args.includeInstant ?? mode !== "official_only";
            const includeWikipedia = args.includeWikipedia ?? mode !== "official_only";
            const highStakes = mode === "official_only" || /\b(price|pricing|rate limit|limit|oauth|auth|security|policy|law|legal|medical|finance|billing|api)\b/i.test(effectiveQuery);
            const now = new Date();

            const clarification = await clarifyWithUser(effectiveQuery, mode, now, ctx, signal);
            const researchBrief = await writeResearchBrief(effectiveQuery, mode, { claims: args.claims, allowedDomains, blockedDomains }, now, ctx, signal);
            const plan = await supervisorPlan(researchBrief, mode, now, ctx, signal);

            const config = {
                query: effectiveQuery,
                mode,
                searchLimit,
                pageLimit,
                freshnessWindowDays,
                allowedDomains,
                blockedDomains,
                includeInstant,
                includeWikipedia,
                now,
            };

            const units = await Promise.all(plan.focusAreas.map((unit) => runResearchUnit(unit, config, ctx, signal)));
            let scoredSources = dedupeSources(units);
            let pageExtracts = flattenExtracts(units);
            const claims = buildDefaultClaims(effectiveQuery, mode, args.claims);
            let claimResults = claims.map((claim) => scoreClaim(claim, scoredSources, {
                mode,
                minSources,
                highStakes,
            }));
            const rawNotes = units.map((unit) => unit.rawNote);
            const followUpFocusAreas = await followUpSupervisorPlan(researchBrief, mode, now, claimResults, rawNotes, ctx, signal);
            const followUpUnits = followUpFocusAreas.length > 0
                ? await Promise.all(followUpFocusAreas.map((unit) => runResearchUnit(unit, {
                    ...config,
                    searchLimit: Math.min(8, config.searchLimit + 1),
                    pageLimit: Math.min(6, config.pageLimit + 1),
                }, ctx, signal)))
                : [];
            if (followUpUnits.length > 0) {
                units.push(...followUpUnits);
                rawNotes.push(...followUpUnits.map((unit) => unit.rawNote));
                scoredSources = dedupeSources(units);
                pageExtracts = flattenExtracts(units);
                claimResults = claims.map((claim) => scoreClaim(claim, scoredSources, {
                    mode,
                    minSources: Math.max(minSources, 2),
                    highStakes,
                }));
            }
            const compressedFindings = await compressFindings(researchBrief, rawNotes, pageExtracts, ctx, signal);
            const report = await finalReport(researchBrief, mode, compressedFindings, claimResults, now, ctx, signal);

            const output = buildReportText(report, {
                mode,
                now,
                clarification: {
                    needClarification: clarification.need_clarification,
                    question: clarification.question,
                    verification: clarification.verification,
                },
                researchBrief,
                plan,
                units,
                scoredSources,
                pageExtracts,
                claimResults,
                compressedFindings,
                followUpFocusAreas,
                includeInstant,
                includeWikipedia,
            });
            const truncation = truncateHead(output, { maxLines: Number.MAX_SAFE_INTEGER });
            return {
                content: [{ type: "text", text: truncation.content }],
                details: {
                    ...(truncation.truncated ? { truncation } : {}),
                    mode,
                    graph: {
                        clarify: {
                            needClarification: clarification.need_clarification,
                            question: clarification.question,
                        },
                        brief: researchBrief,
                        supervisor: {
                            strategy: plan.strategy,
                            parallelUnits: plan.focusAreas.length,
                            followUpUnits: followUpFocusAreas.length,
                        },
                        compression: {
                            rawNotes: rawNotes.length,
                        },
                    },
                    claims: claimResults.map((item) => ({
                        claim: item.claim,
                        status: item.status,
                        confidence: item.confidence,
                    })),
                },
            };
        },
        renderCall(args, theme, context) {
            const text = context.lastComponent ?? new Text("", 0, 0);
            text.setText(formatDeepResearchCall(args, theme));
            return text;
        },
        renderResult(result, options, theme, context) {
            const text = context.lastComponent ?? new Text("", 0, 0);
            text.setText(formatDeepResearchResult(result, options, theme, context.showImages));
            return text;
        },
    };
}

export function createDeepResearchTool(cwd, options) {
    return wrapToolDefinition(createDeepResearchToolDefinition(cwd, options));
}
