interface OnboardingPageHeaderProps {
  title: string;
  description: string;
}

export function OnboardingPageHeader({ title, description }: OnboardingPageHeaderProps) {
  return (
    <header className="space-y-2">
      <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">{title}</h1>
      <p className="text-sm text-slate-600">{description}</p>
    </header>
  );
}
