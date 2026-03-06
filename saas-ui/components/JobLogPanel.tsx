"use client";

type Props = {
  logs: string;
};

export function JobLogPanel({ logs }: Props) {
  return (
    <pre className="max-h-72 overflow-auto rounded border border-slate-700 bg-slate-900 p-3 text-xs">
      {logs || "No logs yet."}
    </pre>
  );
}
