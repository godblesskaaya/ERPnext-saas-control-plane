"use client";

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
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Admin Control Center</h1>
          <p className="text-sm text-slate-300">
            Keep tenant reliability high with fast attention routing for setup delays, failures, and governance tasks.
          </p>
        </div>
        <p className="rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1 text-xs text-slate-200">
          View: {ADMIN_VIEW_DETAILS[controller.currentView].label}
        </p>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-2">
        <div className="flex flex-wrap gap-2">
          {ADMIN_VIEWS.map((view) => (
            <a
              key={view}
              href={controller.buildViewHref(view)}
              className={`rounded px-3 py-1.5 text-xs transition ${
                controller.currentView === view
                  ? "border border-sky-500/60 bg-sky-500/20 text-sky-100"
                  : "border border-slate-700 bg-slate-950/70 text-slate-300 hover:bg-slate-800"
              }`}
            >
              {ADMIN_VIEW_DETAILS[view].label}
            </a>
          ))}
        </div>
      </div>

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
    </section>
  );
}
