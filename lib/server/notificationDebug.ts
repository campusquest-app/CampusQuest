type NotificationLogDetail = Record<string, unknown>;

export function logNotificationInfo(scope: string, detail: NotificationLogDetail) {
  console.info(`[notifications:${scope}]`, detail);
}

export function logNotificationError(scope: string, detail: NotificationLogDetail) {
  console.error(`[notifications:${scope}]`, detail);
}
