export interface ShellConfig {
    shell: string;
    args: string[];
    commandTransport?: "argv" | "stdin";
}
/**
 * Resolve shell configuration based on platform and an optional explicit shell path.
 * Resolution order:
 * 1. User-specified shellPath
 * 2. On Windows: Git Bash in known locations, then bash on PATH
 * 3. On Unix: /bin/bash, then bash on PATH, then fallback to sh
 */
export declare function getShellConfig(customShellPath?: string): ShellConfig;
/**
 * Return the current process environment with the Operator binary directory
 * added to PATH if it is not already present.
 *
 * Preserves the existing PATH variable name and entries while ensuring
 * Operator-managed binaries can be discovered by child processes.
 */
export declare function getShellEnv(): NodeJS.ProcessEnv;
/**
 * Sanitize binary output for display/storage.
 * Removes characters that crash string-width or cause display issues:
 * - Control characters (except tab, newline, carriage return)
 * - Lone surrogates
 * - Unicode Format characters (crash string-width due to a bug)
 * - Characters with undefined code points
 */
export declare function sanitizeBinaryOutput(str: string): string;
/**
 * Track a detached child process so it can be terminated during parent
 * process shutdown.
 */
export declare function trackDetachedChildPid(pid: number): void;
/**
 * Stop tracking a detached child process.
 *
 * The process itself is not terminated by this function.
 */
export declare function untrackDetachedChildPid(pid: number): void;
/**
 * Kill all currently tracked detached child processes and clear the tracking
 * list.
 */
export declare function killTrackedDetachedChildren(): void;
/**
 * Kill a process and all its children (cross-platform)
 */
export declare function killProcessTree(pid: number): void;
//# sourceMappingURL=shell.d.ts.map