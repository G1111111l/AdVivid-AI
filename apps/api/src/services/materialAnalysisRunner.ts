import type { GenerationTrace } from "@advivid/shared";
import { nowIso } from "@advivid/shared";
import { analyzeMaterial } from "./materialAnalysis.js";
import { store } from "./store.js";

const trace = (
  jobId: string,
  projectId: string | undefined,
  status: "started" | "succeeded" | "failed",
  message: string,
  output?: unknown
): GenerationTrace => ({
  id: crypto.randomUUID(),
  jobId,
  projectId,
  node: "MaterialAnalysisWorker",
  status,
  message,
  output,
  createdAt: nowIso()
});

export async function processMaterialAnalysisJob(jobId: string) {
  await store.reload();
  const job = await store.getJob(jobId);
  if (!job) return;

  const traces: GenerationTrace[] = [
    trace(job.id, job.projectId, "started", "开始素材结构化分析", { materialId: job.materialId })
  ];

  try {
    if (!job.materialId) throw new Error("Material analysis job is missing materialId.");
    await store.updateJob(job.id, { status: "running", progress: 12, currentStep: "读取素材记录" });

    const material = await store.getMaterial(job.materialId);
    if (!material) throw new Error("Material not found for analysis job.");

    await store.updateJob(job.id, { progress: 35, currentStep: "生成素材摘要、标签和切片" });
    const analyzed = await analyzeMaterial(material);

    await store.updateJob(job.id, { progress: 82, currentStep: "保存结构化素材" });
    await store.upsertMaterial(analyzed);

    await store.updateJob(job.id, {
      status: "succeeded",
      progress: 100,
      currentStep: "素材分析完成"
    });
    traces.push(
      trace(job.id, job.projectId, "succeeded", "素材结构化分析完成", {
        materialId: analyzed.id,
        tags: analyzed.tags,
        sliceCount: analyzed.slices.length
      })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await store.updateJob(job.id, {
      status: "failed",
      progress: 100,
      currentStep: "素材分析失败",
      error: message
    });
    traces.push(trace(job.id, job.projectId, "failed", message));
  } finally {
    await store.addTraces(traces);
  }
}
