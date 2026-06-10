import type { AnalyticsMetric } from "@advivid/shared";
import { AnalyticsPanel } from "../components/AnalyticsPanel";
import { Metric } from "../components/ui";

export function AnalyticsPage({ metrics }: { metrics: AnalyticsMetric[] }) {
  return (
    <>
      <div className="grid gap-3 md:grid-cols-3">
        <Metric label="Mock views" value={metrics.reduce((sum, item) => sum + item.views, 0).toLocaleString()} tone="text-teal" />
        <Metric
          label="Avg CTR"
          value={`${((metrics.reduce((sum, item) => sum + item.ctr, 0) / Math.max(metrics.length, 1)) * 100).toFixed(2)}%`}
          tone="text-plum"
        />
        <Metric
          label="Avg CVR"
          value={`${((metrics.reduce((sum, item) => sum + item.conversionRate, 0) / Math.max(metrics.length, 1)) * 100).toFixed(2)}%`}
          tone="text-coral"
        />
      </div>
      <AnalyticsPanel metrics={metrics} />
    </>
  );
}
