import type { OnboardingStep } from "../domain/onboardingFlow";

interface OnboardingStepTrackerProps {
  steps: readonly OnboardingStep[];
  labels: Record<OnboardingStep, string>;
  activeStep: OnboardingStep;
}

export function OnboardingStepTracker({ steps, labels, activeStep }: OnboardingStepTrackerProps) {
  const activeIndex = steps.indexOf(activeStep);

  return (
    <ol className="grid gap-2 text-[11px] uppercase tracking-wide text-slate-500 md:grid-cols-5">
      {steps.map((item, index) => (
        <li
          key={item}
          className={`rounded border px-2 py-2 text-center ${
            index <= activeIndex ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-white/70"
          }`}
        >
          {labels[item]}
        </li>
      ))}
    </ol>
  );
}
