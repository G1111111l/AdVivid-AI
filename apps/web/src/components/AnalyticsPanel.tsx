import ReactECharts from "echarts-for-react";
import type { AnalyticsMetric } from "@advivid/shared";

export function AnalyticsPanel({ metrics }: { metrics: AnalyticsMetric[] }) {
  const viewsOption = {
    tooltip: {},
    grid: { left: 36, right: 12, bottom: 32, top: 24 },
    xAxis: { type: "category", data: metrics.map((item) => item.hookType) },
    yAxis: { type: "value" },
    series: [
      {
        type: "bar",
        data: metrics.map((item) => item.views),
        itemStyle: { color: "#0f766e" }
      }
    ]
  };

  const conversionOption = {
    tooltip: {},
    legend: { bottom: 0 },
    radar: {
      indicator: metrics.slice(0, 5).map((item) => ({ name: item.styleFactor, max: 0.06 }))
    },
    series: [
      {
        type: "radar",
        data: [
          {
            name: "转化率",
            value: metrics.slice(0, 5).map((item) => item.conversionRate),
            areaStyle: { color: "rgba(194, 65, 12, 0.16)" },
            lineStyle: { color: "#c2410c" }
          }
        ]
      }
    ]
  };

  const ctrOption = {
    tooltip: {},
    grid: { left: 42, right: 18, bottom: 32, top: 24 },
    xAxis: { type: "category", data: metrics.map((item) => item.label) },
    yAxis: { type: "value" },
    series: [
      {
        type: "line",
        smooth: true,
        data: metrics.map((item) => Number((item.ctr * 100).toFixed(2))),
        itemStyle: { color: "#6d28d9" },
        areaStyle: { color: "rgba(109, 40, 217, 0.12)" }
      }
    ]
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="rounded-md border border-line bg-white p-4">
        <h3 className="text-sm font-bold text-ink">播放量 / Hook</h3>
        <ReactECharts option={viewsOption} style={{ height: 260 }} />
      </div>
      <div className="rounded-md border border-line bg-white p-4">
        <h3 className="text-sm font-bold text-ink">转化率 / 因子</h3>
        <ReactECharts option={conversionOption} style={{ height: 260 }} />
      </div>
      <div className="rounded-md border border-line bg-white p-4">
        <h3 className="text-sm font-bold text-ink">CTR / 版本</h3>
        <ReactECharts option={ctrOption} style={{ height: 260 }} />
      </div>
    </div>
  );
}
