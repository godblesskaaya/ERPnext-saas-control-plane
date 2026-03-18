interface OnboardingEmailVerificationPanelProps {
  email: string | undefined;
  resendBusy: boolean;
  verificationNotice: string | null;
  onResend: () => void;
}

export function OnboardingEmailVerificationPanel({
  email,
  resendBusy,
  verificationNotice,
  onResend,
}: OnboardingEmailVerificationPanelProps) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
      <p className="font-medium">Email verification required before tenant creation.</p>
      <p className="mt-1 text-xs text-amber-700">
        We sent a verification link to <span className="font-medium">{email}</span>.
      </p>
      <button
        className="mt-3 rounded-full border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 hover:border-amber-400 disabled:opacity-60"
        onClick={onResend}
        disabled={resendBusy}
      >
        {resendBusy ? "Sending..." : "Resend verification email"}
      </button>
      {verificationNotice ? <p className="mt-2 text-xs text-amber-800">{verificationNotice}</p> : null}
    </div>
  );
}
