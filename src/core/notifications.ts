import { type CoreConfig, DEFAULT_CORE_CONFIG } from "./config.ts";

export type NotificationLevel = "info" | "warn" | "error";

export interface Notification {
  level: NotificationLevel;
  message: string;
  context?: Record<string, unknown>;
}

export type NotificationHandler = (notification: Notification) => void;

let handler: NotificationHandler | null = null;

export function setNotificationHandler(next: NotificationHandler | null): void {
  handler = next;
}

export function notify(
  notification: Notification,
  config: CoreConfig = DEFAULT_CORE_CONFIG,
): boolean {
  if (!config.enable_notifications) {
    return false;
  }

  handler?.(notification);
  return true;
}
