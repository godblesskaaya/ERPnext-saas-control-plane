"use client";

import { useCallback, useEffect, useState } from "react";

import {
  isTenantDetailSessionExpired,
  loadTenantAuditEvents,
  loadTenantDetail,
  loadTenantSubscription,
  toTenantDetailErrorMessage,
} from "../../../application/tenantDetailUseCases";
import type { AuditLogEntry, Tenant, TenantSubscription } from "../../../../shared/lib/types";

export function useTenantRouteContext(id: string | undefined) {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadTenant = useCallback(async () => {
    if (!id) return;
    try {
      const nextTenant = await loadTenantDetail(id);
      setTenant(nextTenant);
      setError(null);
    } catch (err) {
      setTenant(null);
      if (isTenantDetailSessionExpired(err)) {
        setError("Session expired. Please log in again.");
      } else {
        setError(toTenantDetailErrorMessage(err, "Failed to load tenant"));
      }
    }
  }, [id]);

  useEffect(() => {
    void loadTenant();
  }, [loadTenant]);

  return { tenant, error, loadTenant };
}

export function useTenantSubscriptionData(id: string | undefined) {
  const [subscription, setSubscription] = useState<TenantSubscription | null>(null);
  const [subscriptionSupported, setSubscriptionSupported] = useState(true);
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null);

  const loadSubscription = useCallback(async () => {
    if (!id) return;
    try {
      const result = await loadTenantSubscription(id);
      if (!result.supported) {
        setSubscriptionSupported(false);
        setSubscription(null);
        setSubscriptionError(null);
        return;
      }
      setSubscriptionSupported(true);
      setSubscription(result.data);
      setSubscriptionError(null);
    } catch (err) {
      if (isTenantDetailSessionExpired(err)) {
        setSubscriptionError("Session expired. Please log in again.");
      } else {
        setSubscriptionError(toTenantDetailErrorMessage(err, "Failed to load subscription details"));
      }
    }
  }, [id]);

  useEffect(() => {
    void loadSubscription();
  }, [loadSubscription]);

  return { subscription, subscriptionSupported, subscriptionError, loadSubscription };
}

export function useTenantAuditData(id: string | undefined, page: number, limit: number) {
  const [auditSupported, setAuditSupported] = useState(true);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);

  const loadAudit = useCallback(async () => {
    if (!id) return;
    try {
      const result = await loadTenantAuditEvents(id, page, limit);
      if (!result.supported) {
        setAuditSupported(false);
        setAuditError(null);
        setAuditLog([]);
        setAuditTotal(0);
        return;
      }
      setAuditSupported(true);
      setAuditError(null);
      setAuditLog(result.data.data);
      setAuditTotal(result.data.total);
    } catch (err) {
      if (isTenantDetailSessionExpired(err)) {
        setAuditError("Session expired. Please log in again.");
      } else {
        setAuditError(toTenantDetailErrorMessage(err, "Failed to load activity log"));
      }
    }
  }, [id, page, limit]);

  useEffect(() => {
    void loadAudit();
  }, [loadAudit]);

  return { auditSupported, auditError, auditLog, auditTotal, loadAudit };
}
