import { compare, valid } from "semver";
import { getOperatorUserAgent } from "./operator-user-agent.js";
const LATEST_VERSION_URL = "https://opr.local/api/latest-version";
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
    void currentVersion;
    void options;
    void getOperatorUserAgent;
    void LATEST_VERSION_URL;
    void DEFAULT_VERSION_CHECK_TIMEOUT_MS;
    return undefined;
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
