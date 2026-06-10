import type { AnalyticsMetric } from "@advivid/shared";
import { nowIso } from "@advivid/shared";

export function createMockAnalytics(projectId?: string): AnalyticsMetric[] {
  const hooks = [
    ["痛点开场", "真实场景", 18400, 0.073, 0.031],
    ["场景种草", "材质细节", 22600, 0.084, 0.038],
    ["测评对比", "功能演示", 16800, 0.069, 0.029],
    ["生活方式", "氛围 BGM", 24300, 0.091, 0.042],
    ["限时理由", "轻 CTA", 13900, 0.058, 0.024]
  ] as const;

  return hooks.map(([hookType, styleFactor, views, ctr, conversionRate], index) => ({
    id: crypto.randomUUID(),
    projectId,
    label: `Version ${String.fromCharCode(65 + index)}`,
    hookType,
    styleFactor,
    views,
    ctr,
    conversionRate,
    createdAt: nowIso()
  }));
}
