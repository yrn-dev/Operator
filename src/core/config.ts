export interface CoreConfig {
  /** When true, core emits user-facing notifications. Defaults to false. */
  enable_notifications: boolean;
}

export const DEFAULT_CORE_CONFIG: CoreConfig = {
  enable_notifications: false,
};

export function mergeCoreConfig(
  partial: Partial<CoreConfig> = {},
): CoreConfig {
  return {
    ...DEFAULT_CORE_CONFIG,
    ...partial,
  };
}
