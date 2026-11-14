/**
 * Cleans up the quarantine for Windows self-update packages.
 * This function removes any quarantine markers for the specified package directory.
 * 
 * @param packageDir - The directory of the package to clean up.
 */
export declare function cleanupWindowsSelfUpdateQuarantine(packageDir: string): void;

/**
 * Quarantines Windows native dependencies for a specified package.
 * This function marks the native dependencies in the specified package directory
 * to prevent them from being executed until they are explicitly unquarantined.
 * 
 * @param packageDir - The directory of the package whose native dependencies should be quarantined.
 */
export declare function quarantineWindowsNativeDependencies(packageDir: string): void;
//# sourceMappingURL=windows-self-update.d.ts.map