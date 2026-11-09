import { compare, valid } from "semver";
import { getOperatorUserAgent } from "./operator-user-agent.js";
const LATEST_VERSION_URL = "https://opr.pzero.kz/download/operator-updates.json";
const DEFAULT_VERSION_CHECK_TIMEOUT_MS = 10000;
export function comparePackageVersions(leftVersion, rightVersion) {
    const left = valid(leftVersion.trim());
    const right = valid(rightVersion.trim());
    if (!left || !right) {
        return undefined;
    }
    return compare(left, right);
}
export function isNewerPackageVersion(candidateVersion, currentVersion) {
    const comparison = comparePackageVersions(candidateVersion, currentVersion);
    if (comparison !== undefined) {
        return comparison > 0;
    }
    return candidateVersion.trim() !== currentVersion.trim();
}
export async function getLatestOperatorRelease(currentVersion, options = {}) {
    const timeoutMs = Number.isFinite(options.timeoutMs)
        ? Math.max(1000, Math.min(options.timeoutMs, 30000))
        : DEFAULT_VERSION_CHECK_TIMEOUT_MS;
    const response = await fetch(LATEST_VERSION_URL, {
        headers: {
            accept: "application/json",
            "user-agent": getOperatorUserAgent(currentVersion),
        },
        signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok)
        return undefined;
    const manifest = await response.json();
    const metadata = manifest.cli;
    if (metadata?.packageName !== "pzero-operator" || typeof metadata.version !== "string" || !valid(metadata.version))
        return undefined;
    if (!isNewerPackageVersion(metadata.version, currentVersion))
        return undefined;
    const note = typeof metadata.note === "string" ? metadata.note.slice(0, 600) : undefined;
    const expectedInstallSpec = `https://github.com/yrn-dev/Operator/releases/download/v${metadata.version}/pzero-operator-${metadata.version}.tgz`;
    const installSpec = metadata.installUrl === expectedInstallSpec ? expectedInstallSpec : undefined;
    return { version: metadata.version, ...(note ? { note } : {}), ...(installSpec ? { installSpec } : {}) };
}
export async function getLatestOperatorVersion(currentVersion, options = {}) {
    return (await getLatestOperatorRelease(currentVersion, options))?.version;
}
export async function checkForNewOperatorVersion(currentVersion) {
    try {
        const latestRelease = await getLatestOperatorRelease(currentVersion);
        if (latestRelease && isNewerPackageVersion(latestRelease.version, currentVersion)) {
            return latestRelease;
        }
        return undefined;
    }
    catch {
        return undefined;
    }
}
//# sourceMappingURL=version-check.js.map
