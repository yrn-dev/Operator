export interface LatestOperatorRelease {
    version: string;
    packageName?: string;
    note?: string;
}
export declare function comparePackageVersions(leftVersion: string, rightVersion: string): number | undefined;
export declare function isNewerPackageVersion(candidateVersion: string, currentVersion: string): boolean;
export declare function getLatestOperatorRelease(currentVersion: string, options?: {
    timeoutMs?: number;
}): Promise<LatestOperatorRelease | undefined>;
export declare function getLatestOperatorVersion(currentVersion: string, options?: {
    timeoutMs?: number;
}): Promise<string | undefined>;
export declare function checkForNewOperatorVersion(currentVersion: string): Promise<LatestOperatorRelease | undefined>;
//# sourceMappingURL=version-check.d.ts.map