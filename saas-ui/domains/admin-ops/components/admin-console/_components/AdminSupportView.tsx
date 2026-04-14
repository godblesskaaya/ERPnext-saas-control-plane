"use client";

type AdminSupportViewProps = {
  impersonationEmail: string;
  onImpersonationEmailChange: (value: string) => void;
  impersonationReason: string;
  onImpersonationReasonChange: (value: string) => void;
  impersonationBusy: boolean;
  canIssueImpersonationLink?: boolean;
  onIssueImpersonationLink: () => void;
  impersonationError: string | null;
  impersonationLink: string | null;
  impersonationToken: string | null;
};

export function AdminSupportView({
  impersonationEmail,
  onImpersonationEmailChange,
  impersonationReason,
  onImpersonationReasonChange,
  impersonationBusy,
  canIssueImpersonationLink = true,
  onIssueImpersonationLink,
  impersonationError,
  impersonationLink,
  impersonationToken,
}: AdminSupportViewProps) {
  return (
    <div className="rounded-xl border border-slate-700 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Support impersonation links</h2>
        <p className="text-xs text-slate-400">Short-lived, audited access for guided troubleshooting.</p>
      </div>
      <div className="grid gap-2 md:grid-cols-[1.2fr_1.8fr_auto]">
        <input
          className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
          placeholder="target-user@example.com"
          value={impersonationEmail}
          onChange={(event) => onImpersonationEmailChange(event.target.value)}
        />
        <input
          className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
          placeholder="Reason for support access"
          value={impersonationReason}
          onChange={(event) => onImpersonationReasonChange(event.target.value)}
        />
        <button
          className="rounded border border-slate-600 px-3 py-2 text-xs hover:bg-slate-800 disabled:opacity-60"
          onClick={onIssueImpersonationLink}
          disabled={impersonationBusy || !canIssueImpersonationLink}
        >
          {impersonationBusy ? "Issuing..." : canIssueImpersonationLink ? "Issue link" : "Admin only"}
        </button>
      </div>
      {!canIssueImpersonationLink ? (
        <p className="mt-2 text-xs text-slate-400">Support role is read-only for impersonation. Ask an admin to issue links.</p>
      ) : null}
      {impersonationError ? <p className="mt-2 text-sm text-red-400">{impersonationError}</p> : null}
      {impersonationLink ? (
        <div className="mt-3 rounded border border-slate-500/40 bg-slate-500/10 p-3 text-xs text-sky-100">
          <p className="font-semibold">Impersonation link ready</p>
          <p className="mt-1 break-all">{impersonationLink}</p>
          {impersonationToken ? <p className="mt-1 break-all text-sky-100">Token: {impersonationToken}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
