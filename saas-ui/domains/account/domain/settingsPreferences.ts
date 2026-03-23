export type NotificationPreferences = {
  emailAlerts: boolean;
  smsAlerts: boolean;
  billingAlerts: boolean;
  provisioningAlerts: boolean;
  supportAlerts: boolean;
};

export const DEFAULT_PREFERENCES: NotificationPreferences = {
  emailAlerts: true,
  smsAlerts: true,
  billingAlerts: true,
  provisioningAlerts: true,
  supportAlerts: true,
};

export const PREFERENCES_STORAGE_KEY = "erp-saas:notification-preferences:v1";

export function parsePreferences(raw: string | null): NotificationPreferences {
  if (!raw) return DEFAULT_PREFERENCES;
  try {
    const parsed = JSON.parse(raw) as Partial<NotificationPreferences>;
    return {
      emailAlerts: parsed.emailAlerts ?? DEFAULT_PREFERENCES.emailAlerts,
      smsAlerts: parsed.smsAlerts ?? DEFAULT_PREFERENCES.smsAlerts,
      billingAlerts: parsed.billingAlerts ?? DEFAULT_PREFERENCES.billingAlerts,
      provisioningAlerts: parsed.provisioningAlerts ?? DEFAULT_PREFERENCES.provisioningAlerts,
      supportAlerts: parsed.supportAlerts ?? DEFAULT_PREFERENCES.supportAlerts,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}
