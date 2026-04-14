"use client";

import Link from "next/link";
import { Box, Button, Chip, Paper, Stack, Typography } from "@mui/material";

import { AdminAuditView } from "./_components/AdminAuditView";
import { AdminJobsView } from "./_components/AdminJobsView";
import { AdminOverviewView } from "./_components/AdminOverviewView";
import { AdminRecoveryView } from "./_components/AdminRecoveryView";
import { AdminSupportView } from "./_components/AdminSupportView";
import { AdminTenantsView } from "./_components/AdminTenantsView";
import { TenantActionModal } from "./_components/TenantActionModal";
import { ADMIN_VIEW_DETAILS, ADMIN_VIEWS, type AdminView } from "./_components/adminConsoleConfig";
import { useAdminConsoleController } from "./_components/useAdminConsoleController";

type AdminConsolePageProps = {
  forcedView?: AdminView;
};

export function AdminConsolePage({ forcedView }: AdminConsolePageProps) {
  const controller = useAdminConsoleController({ forcedView });

  return (
    <Stack component="section" spacing={3}>
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ md: "center" }} gap={2}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>
            Admin Control Center
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Keep tenant reliability high with fast attention routing for setup delays, failures, and governance tasks.
          </Typography>
        </Box>
        <Chip label={`View: ${ADMIN_VIEW_DETAILS[controller.currentView].label}`} variant="outlined" />
      </Stack>

      <Paper variant="outlined" sx={{ p: 1.5 }}>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {ADMIN_VIEWS.map((view) => (
            <Button
              key={view}
              component={Link}
              href={controller.buildViewHref(view)}
              size="small"
              variant={controller.currentView === view ? "contained" : "outlined"}
            >
              {ADMIN_VIEW_DETAILS[view].label}
            </Button>
          ))}
        </Stack>
      </Paper>

      {controller.currentView === "overview" ? (
        <AdminOverviewView
          activeCount={controller.activeCount}
          failedCount={controller.failedCount}
          suspendedCount={controller.suspendedCount}
          provisioningCount={controller.provisioningCount}
          tenantTotal={controller.tenantTotal}
          deadLettersCount={controller.deadLetters.length}
          metricsSupported={controller.metricsSupported}
          metricsError={controller.metricsError}
          metrics={controller.metrics}
          onRefreshMetrics={() => {
            void controller.loadMetrics();
          }}
          controlLaneLinks={controller.controlLaneLinks}
        />
      ) : null}

      {controller.currentView === "jobs" ? (
        <AdminJobsView
          jobsSupported={controller.jobsSupported}
          jobsError={controller.jobsError}
          jobs={controller.jobs}
          selectedJob={controller.selectedJob}
          selectedJobSupported={controller.selectedJobSupported}
          onRefreshJobs={() => {
            void controller.loadJobs();
          }}
          onInspectJobLogs={(jobId) => {
            void controller.loadJobLogs(jobId);
          }}
        />
      ) : null}

      {controller.currentView === "tenants" ? (
        <AdminTenantsView
          tenantsError={controller.tenantsError}
          onRefreshTenants={() => {
            void controller.loadTenants();
          }}
          tenantSearch={controller.tenantSearch}
          onTenantSearchChange={controller.setTenantSearch}
          tenantStatusFilter={controller.tenantStatusFilter}
          onTenantStatusFilterChange={controller.setTenantStatusFilter}
          tenantPlanFilter={controller.tenantPlanFilter}
          onTenantPlanFilterChange={controller.setTenantPlanFilter}
          tenants={controller.tenants}
          busyTenantId={controller.busyTenantId}
          onOpenTenantAction={controller.openTenantAction}
          canManageTenantLifecycle={true}
          tenantPage={controller.tenantPage}
          tenantTotalPages={controller.tenantTotalPages}
          tenantTotal={controller.tenantTotal}
          onPreviousPage={() => controller.setTenantPage((prev) => Math.max(1, prev - 1))}
          onNextPage={() => controller.setTenantPage((prev) => Math.min(controller.tenantTotalPages, prev + 1))}
        />
      ) : null}

      {controller.currentView === "audit" ? (
        <AdminAuditView
          auditExportBusy={controller.auditExportBusy}
          auditExportError={controller.auditExportError}
          onExportAudit={() => {
            void controller.exportAudit();
          }}
          onRefreshAudit={() => {
            void controller.loadAuditLog();
          }}
          auditSupported={controller.auditSupported}
          auditError={controller.auditError}
          auditLog={controller.auditLog}
          auditPage={controller.auditPage}
          auditTotalPages={controller.auditTotalPages}
          auditTotal={controller.auditTotal}
          onPreviousPage={() => controller.setAuditPage((prev) => Math.max(1, prev - 1))}
          onNextPage={() => controller.setAuditPage((prev) => Math.min(controller.auditTotalPages, prev + 1))}
        />
      ) : null}

      {controller.currentView === "support" ? (
        <AdminSupportView
          impersonationEmail={controller.impersonationEmail}
          onImpersonationEmailChange={controller.setImpersonationEmail}
          impersonationReason={controller.impersonationReason}
          onImpersonationReasonChange={controller.setImpersonationReason}
          impersonationBusy={controller.impersonationBusy}
          canIssueImpersonationLink={controller.canRunAdminOnlyActions}
          onIssueImpersonationLink={() => {
            void controller.issueImpersonationLink();
          }}
          impersonationError={controller.impersonationError}
          impersonationLink={controller.impersonationLink}
          impersonationToken={controller.impersonationToken}
        />
      ) : null}

      {controller.currentView === "recovery" ? (
        <AdminRecoveryView
          deadLetterSupported={controller.deadLetterSupported}
          deadLetterError={controller.deadLetterError}
          deadLetters={controller.deadLetters}
          requeueJobId={controller.requeueJobId}
          canRequeueDeadLetters={true}
          onRefreshDeadLetters={() => {
            void controller.loadDeadLetters();
          }}
          onRequeueDeadLetter={(jobId) => {
            void controller.requeueDeadLetter(jobId);
          }}
        />
      ) : null}

      <TenantActionModal
        tenantAction={controller.tenantAction}
        tenantActionInput={controller.tenantActionInput}
        onTenantActionInputChange={controller.setTenantActionInput}
        tenantActionReason={controller.tenantActionReason}
        onTenantActionReasonChange={controller.setTenantActionReason}
        busyTenantId={controller.busyTenantId}
        onCancel={controller.cancelTenantAction}
        onConfirm={() => {
          void controller.submitTenantAction();
        }}
      />
    </Stack>
  );
}
