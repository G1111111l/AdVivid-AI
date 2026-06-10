import { CheckCircle2 } from "lucide-react";
import type { GenerationTrace } from "@advivid/shared";
import { StatusPill } from "./ui";

export function TraceList({ traces }: { traces: GenerationTrace[] }) {
  return (
    <div className="grid gap-2">
      {traces.slice(-8).map((trace) => (
        <div key={trace.id} className="flex items-start gap-3 rounded-md border border-line bg-white p-3">
          <CheckCircle2 className="mt-0.5 text-teal" size={17} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
              <span>{trace.node}</span>
              <StatusPill status={trace.status} />
            </div>
            <div className="mt-1 text-sm text-zinc-600">{trace.message}</div>
          </div>
        </div>
      ))}
      {traces.length === 0 ? <div className="rounded-md border border-dashed border-line p-4 text-sm text-zinc-500">暂无 trace</div> : null}
    </div>
  );
}
