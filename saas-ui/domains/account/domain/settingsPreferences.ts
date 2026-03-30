export type NotificationPreferences = {
  emailAlerts: boolean;
  smsAlerts: boolean;
  billingAlerts: boolean;
  provisioningAlerts: boolean;
  supportAlerts: boolean;
};

export type NotificationPreferencesApiPayload = {
  email_alerts?: boolean;
  sms_alerts?: boolean;
  billing_alerts?: boolean;
  provisioning_alerts?: boolean;
  support_alerts?: boolean;
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

export function fromApiPreferences(payload?: NotificationPreferencesApiPayload | null): NotificationPreferences {
  if (!payload) return DEFAULT_PREFERENCES;
  return {
    emailAlerts: payload.email_alerts ?? DEFAULT_PREFERENCES.emailAlerts,
    smsAlerts: payload.sms_alerts ?? DEFAULT_PREFERENCES.smsAlerts,
    billingAlerts: payload.billing_alerts ?? DEFAULT_PREFERENCES.billingAlerts,
    provisioningAlerts: payload.provisioning_alerts ?? DEFAULT_PREFERENCES.provisioningAlerts,
    supportAlerts: payload.support_alerts ?? DEFAULT_PREFERENCES.supportAlerts,
  };
}

export function toApiPreferences(preferences: NotificationPreferences): Required<NotificationPreferencesApiPayload> {
  return {
    email_alerts: preferences.emailAlerts,
    sms_alerts: preferences.smsAlerts,
    billing_alerts: preferences.billingAlerts,
    provisioning_alerts: preferences.provisioningAlerts,
    support_alerts: preferences.supportAlerts,
  };
}
