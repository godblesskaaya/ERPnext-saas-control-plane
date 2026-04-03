"use client";

import { useEffect, useMemo, useState } from "react";

import {
  loadSupportNotesCatalog,
  loadTenantCatalog,
  toAdminErrorMessage,
} from "../../../../domains/admin-ops/application/adminUseCases";
import { WorkspaceQueuePage } from "../../../../domains/dashboard/components/WorkspaceQueuePage";
import type { SupportNote, Tenant } from "../../../../domains/shared/lib/types";

function getSlaState(note: SupportNote) {
  if (note.sla_state) return note.sla_state;
  if (note.status === "resolved") return "resolved";
  if (!note.sla_due_at) return "unscheduled";
  const due = new Date(note.sla_due_at);
  if (Number.isNaN(due.getTime())) return "unscheduled";
  const now = new Date();
  if (due < now) return "breached";
  const diffHours = (due.getTime() - now.getTime()) / (1000 * 60 * 60);
  if (diffHours <= 24) return "due_soon";
  return "on_track";
}

export default function DashboardSupportPage() {
  const [notes, setNotes] = useState<SupportNote[]>([]);
  const [noteFilter, setNoteFilter] = useState("all");
  const [tenants, setTenants] = useState<Record<string, Tenant>>({});
  const [notesError, setNotesError] = useState<string | null>(null);
  const [notesLoading, setNotesLoading] = useState(false);

  const loadNotes = async () => {
    setNotesLoading(true);
    setNotesError(null);
    try {
      const [notesResult, tenantsResult] = await Promise.all([loadSupportNotesCatalog(), loadTenantCatalog()]);
      if (!notesResult.supported) {
        setNotesError("Support notes are not available on this backend.");
        return;
      }
      setNotes(notesResult.data);
      const tenantMap: Record<string, Tenant> = {};
      tenantsResult.forEach((tenant) => {
        tenantMap[tenant.id] = tenant;
      });
      setTenants(tenantMap);
    } catch (err) {
      setNotesError(toAdminErrorMessage(err, "Failed to load support notes."));
    } finally {
      setNotesLoading(false);
    }
  };

  useEffect(() => {
    void loadNotes();
  }, []);

  const filteredNotes = useMemo(() => {
    if (noteFilter === "all") return notes;
    if (["breached", "due_soon", "on_track", "unscheduled"].includes(noteFilter)) {
      return notes.filter((note) => getSlaState(note) === noteFilter);
    }
    return notes.filter((note) => (note.status ?? "open") === noteFilter);
  }, [noteFilter, notes]);

  return (
    <WorkspaceQueuePage
      routeScope="admin"
      title="Support workspace queue"
      description="Customer escalations and billing disputes. Track resolution and SLA."
      statusFilter={["failed", "suspended", "suspended_admin", "suspended_billing"]}
      showMetrics={false}
      showAttention
      showBillingAlert
      showStatusFilter={false}
      attentionNote="Assign a clear owner and add support notes for handoffs."
      handoffLinks={[
        { label: "Incidents", href: "/admin/incidents" },
        { label: "Suspensions", href: "/admin/suspensions" },
        { label: "Billing", href: "/admin/billing" },
      ]}
      callout={{
        title: "Support SLA focus",
        body: "Capture the primary owner, contact path (phone/WhatsApp/email), and promised resolution time for every escalation.",
        tone: "warn",
      }}
      extraContent={
        <div className="rounded-3xl border border-slate-200/70 bg-white/80 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">Support notes</p>
              <p className="text-lg font-semibold text-slate-900">SLA tracking across tenants</p>
            </div>
            <button
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-300 disabled:opacity-60"
              onClick={() => void loadNotes()}
              disabled={notesLoading}
            >
              {notesLoading ? "Refreshing..." : "Refresh notes"}
            </button>
          </div>

          {notesError ? <p className="mt-3 text-sm text-red-600">{notesError}</p> : null}

          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-600">
            {["all", "open", "monitoring", "resolved", "due_soon", "breached"].map((option) => (
              <button
                key={option}
                className={`rounded-full border px-3 py-1 ${
                  noteFilter === option
                    ? "border-[#0d6a6a] bg-[#0d6a6a] text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                }`}
                onClick={() => setNoteFilter(option)}
              >
                {option.replace("_", " ")}
              </button>
            ))}
          </div>

          <div className="mt-4 space-y-3 text-sm text-slate-700">
            {filteredNotes.length ? (
              filteredNotes.map((note) => {
                const tenant = tenants[note.tenant_id];
                return (
                  <div key={note.id} className="rounded-2xl border border-slate-200/70 bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-slate-500">
                          {tenant ? `${tenant.company_name} • ${tenant.subdomain}` : note.tenant_id}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">{note.note}</p>
                        <p className="mt-1 text-xs text-slate-600">
                          Owner: {note.owner_name || "—"} {note.owner_contact ? `• ${note.owner_contact}` : ""}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2 text-xs">
                        <span className="rounded-full border border-slate-200 px-3 py-1 text-slate-800">
                          {note.status ?? "open"}
                        </span>
                        <span className="rounded-full border border-slate-200 px-3 py-1 text-slate-600">
                          SLA: {getSlaState(note).replace("_", " ")}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="rounded-2xl border border-slate-200/70 bg-white p-4 text-sm text-slate-600">
                No support notes match this filter yet.
              </div>
            )}
          </div>
        </div>
      }
      emptyStateTitle="No support escalations"
      emptyStateBody="There are no tenant incidents requiring support follow-up right now."
      emptyStateActionLabel="Open tenant control"
      emptyStateActionHref="/admin/control/tenants"
    />
  );
}
