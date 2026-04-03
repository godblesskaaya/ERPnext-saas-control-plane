"use client";

import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  isTenantDetailSessionExpired,
  loadTenantCurrentUser,
  loadTenantAuditEvents,
  loadTenantDetail,
  loadTenantMembers,
  loadTenantRecentJobs,
  loadTenantSubscription,
  loadTenantSummary,
  toTenantDetailErrorMessage,
} from "../../../application/tenantDetailUseCases";
import type { AuditLogEntry, Job, Tenant, TenantMember, TenantSubscription, TenantSummary, UserProfile } from "../../../../shared/lib/types";

export const tenantDetailQueryKeys = {
  all: ["tenant-detail"] as const,
  tenant: (id: string) => ["tenant-detail", "tenant", id] as const,
  currentUser: () => ["tenant-detail", "current-user"] as const,
  members: (id: string) => ["tenant-detail", "members", id] as const,
  summary: (id: string) => ["tenant-detail", "summary", id] as const,
  recentJobs: (id: string, limit: number, maxItems: number) =>
    ["tenant-detail", "recent-jobs", id, limit, maxItems] as const,
  subscription: (id: string) => ["tenant-detail", "subscription", id] as const,
  audit: (id: string, page: number, limit: number) => ["tenant-detail", "audit", id, page, limit] as const,
};

function mapTenantDetailError(error: unknown, fallback: string): string {
  if (isTenantDetailSessionExpired(error)) {
    return "Session expired. Please log in again.";
  }
  return toTenantDetailErrorMessage(error, fallback);
}

export function useTenantRouteContext(id: string | undefined) {
  const queryClient = useQueryClient();
  const { data, error, refetch } = useQuery<Tenant>({
    queryKey: id ? tenantDetailQueryKeys.tenant(id) : tenantDetailQueryKeys.all,
    queryFn: () => loadTenantDetail(id!),
    enabled: Boolean(id),
  });

  const loadTenant = useCallback(async () => {
    if (!id) return;
    await queryClient.invalidateQueries({ queryKey: tenantDetailQueryKeys.tenant(id) });
    await refetch();
  }, [id, queryClient, refetch]);

  return {
    tenant: data ?? null,
    error: error ? mapTenantDetailError(error, "Failed to load tenant") : null,
    loadTenant,
  };
}

export function useTenantCurrentUserData() {
  const { data } = useQuery<UserProfile>({
    queryKey: tenantDetailQueryKeys.currentUser(),
    queryFn: loadTenantCurrentUser,
  });

  return { currentUser: data ?? null };
}

export function useTenantRecentJobsData(id: string | undefined, limit = 40, maxItems = 5) {
  const queryClient = useQueryClient();
  const { data, error, refetch } = useQuery<{ supported: boolean; data: Job[] }>({
    queryKey: id ? tenantDetailQueryKeys.recentJobs(id, limit, maxItems) : tenantDetailQueryKeys.all,
    queryFn: () => loadTenantRecentJobs(id!, limit, maxItems),
    enabled: Boolean(id),
  });

  const refresh = useCallback(async () => {
    if (!id) return;
    await queryClient.invalidateQueries({ queryKey: tenantDetailQueryKeys.recentJobs(id, limit, maxItems) });
    await refetch();
  }, [id, limit, maxItems, queryClient, refetch]);

  return {
    recentJobs: data?.data ?? [],
    recentJobsSupported: data?.supported ?? true,
    recentJobsError: error ? toTenantDetailErrorMessage(error, "Failed to load recent jobs") : null,
    refresh,
  };
}

export function useTenantSummaryData(id: string | undefined) {
  const { data, error } = useQuery({
    queryKey: id ? tenantDetailQueryKeys.summary(id) : tenantDetailQueryKeys.all,
    queryFn: () => loadTenantSummary(id!),
    enabled: Boolean(id),
  });

  const tenantSummary: TenantSummary | null = data?.supported ? (data.data ?? null) : null;
  const tenantSummaryError = useMemo(() => {
    if (error) return toTenantDetailErrorMessage(error, "Failed to load tenant summary");
    if (data && !data.supported) return "Tenant summary endpoint not available.";
    return null;
  }, [data, error]);

  return { tenantSummary, tenantSummaryError };
}

export function useTenantMembersData(id: string | undefined) {
  const queryClient = useQueryClient();
  const { data, error, isPending, refetch } = useQuery({
    queryKey: id ? tenantDetailQueryKeys.members(id) : tenantDetailQueryKeys.all,
    queryFn: () => loadTenantMembers(id!),
    enabled: Boolean(id),
  });

  const refresh = useCallback(async () => {
    if (!id) return;
    await queryClient.invalidateQueries({ queryKey: tenantDetailQueryKeys.members(id) });
    await refetch();
  }, [id, queryClient, refetch]);

  const members: TenantMember[] = data?.supported ? data.data : [];
  const membersSupported = data?.supported ?? true;
  const membersError = error ? toTenantDetailErrorMessage(error, "Failed to load team members") : null;

  return { members, membersSupported, membersError, membersLoading: isPending, refresh };
}

export function useTenantSubscriptionData(id: string | undefined) {
  const queryClient = useQueryClient();
  const { data, error, refetch } = useQuery({
    queryKey: id ? tenantDetailQueryKeys.subscription(id) : tenantDetailQueryKeys.all,
    queryFn: () => loadTenantSubscription(id!),
    enabled: Boolean(id),
  });

  const loadSubscription = useCallback(async () => {
    if (!id) return;
    await queryClient.invalidateQueries({ queryKey: tenantDetailQueryKeys.subscription(id) });
    await refetch();
  }, [id, queryClient, refetch]);

  const subscription: TenantSubscription | null = data?.supported ? (data.data ?? null) : null;
  const subscriptionSupported = data?.supported ?? true;
  const subscriptionError = useMemo(() => {
    if (!error) return null;
    return mapTenantDetailError(error, "Failed to load subscription details");
  }, [error]);

  return { subscription, subscriptionSupported, subscriptionError, loadSubscription };
}

export function useTenantAuditData(id: string | undefined, page: number, limit: number) {
  const queryClient = useQueryClient();
  const { data, error, refetch } = useQuery({
    queryKey: id ? tenantDetailQueryKeys.audit(id, page, limit) : tenantDetailQueryKeys.all,
    queryFn: () => loadTenantAuditEvents(id!, page, limit),
    enabled: Boolean(id),
  });

  const loadAudit = useCallback(async () => {
    if (!id) return;
    await queryClient.invalidateQueries({ queryKey: tenantDetailQueryKeys.audit(id, page, limit) });
    await refetch();
  }, [id, limit, page, queryClient, refetch]);

  const auditSupported = data?.supported ?? true;
  const auditError = useMemo(() => {
    if (error) return mapTenantDetailError(error, "Failed to load activity log");
    return null;
  }, [error]);
  const auditLog: AuditLogEntry[] = data?.supported ? data.data.data : [];
  const auditTotal = data?.supported ? data.data.total : 0;

  return { auditSupported, auditError, auditLog, auditTotal, loadAudit };
}
