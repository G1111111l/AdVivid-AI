import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";

export function StatusPill({ status }: { status?: string }) {
  const palette: Record<string, string> = {
    draft: "bg-zinc-100 text-zinc-700 border-zinc-200",
    scripted: "bg-teal-50 text-teal-700 border-teal-200",
    rendering: "bg-orange-50 text-orange-700 border-orange-200",
    ready: "bg-emerald-50 text-emerald-700 border-emerald-200",
    failed: "bg-red-50 text-red-700 border-red-200",
    queued: "bg-zinc-100 text-zinc-700 border-zinc-200",
    running: "bg-orange-50 text-orange-700 border-orange-200",
    succeeded: "bg-emerald-50 text-emerald-700 border-emerald-200"
  };

  return (
    <span className={`inline-flex h-7 items-center rounded border px-2 text-xs font-medium ${palette[status ?? "draft"] ?? palette.draft}`}>
      {status ?? "draft"}
    </span>
  );
}

export function IconButton({
  children,
  icon: Icon,
  variant = "primary",
  disabled,
  onClick,
  type = "button"
}: {
  children: string;
  icon: LucideIcon;
  variant?: "primary" | "ghost" | "line" | "danger";
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
}) {
  const variants = {
    primary: "bg-ink text-white hover:bg-zinc-700",
    ghost: "bg-transparent text-ink hover:bg-white",
    line: "border border-line bg-white text-ink hover:border-teal hover:text-teal",
    danger: "border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
  };

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]}`}
    >
      <Icon size={16} />
      <span>{children}</span>
    </button>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm font-semibold text-zinc-700">
      {label}
      {children}
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`h-10 rounded-md border border-line bg-white px-3 text-sm text-ink shadow-sm ${props.className ?? ""}`}
    />
  );
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`min-h-20 rounded-md border border-line bg-white px-3 py-2 text-sm text-ink shadow-sm ${props.className ?? ""}`}
    />
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`h-10 rounded-md border border-line bg-white px-3 text-sm text-ink shadow-sm ${props.className ?? ""}`}
    />
  );
}

export function Metric({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-md border border-line bg-white p-3">
      <div className="text-xs font-semibold uppercase tracking-normal text-zinc-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${tone}`}>{value}</div>
    </div>
  );
}
