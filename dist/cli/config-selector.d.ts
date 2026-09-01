/**
 * TUI config selector for `operator config` command
 */
import type { ResolvedPaths } from "../core/package-manager.ts";
import type { SettingsManager } from "../core/settings-manager.ts";
export interface ConfigSelectorOptions {
    resolvedPaths: ResolvedPaths;
    settingsManager: SettingsManager;
    cwd: string;
    agentDir: string;
}
/** Show TUI config selector and return when closed */
export declare function selectConfig(options: ConfigSelectorOptions): Promise<void>;
//# sourceMappingURL=config-selector.d.ts.map