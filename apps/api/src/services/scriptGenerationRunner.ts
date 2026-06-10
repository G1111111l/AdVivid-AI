import { runCreativeAgent } from "@advivid/agent";
import type { GenerationTrace, Material, Product, Project } from "@advivid/shared";
import { nowIso } from "@advivid/shared";
import { config } from "../config.js";
import { runPythonCreativeAgent } from "./pythonAgentClient.js";
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
  node: "ScriptGenerationWorker",
  status,
  message,
  output,
  createdAt: nowIso()
});

async function runAgent(input: {
  project: Project;
  product: Product;
  materials: Material[];
  scriptId: string;
}) {
  if (config.agentRuntime !== "python") {
    return runCreativeAgent({
      projectId: input.project.id,
      scriptId: input.scriptId,
      product: input.product,
      materials: input.materials
    });
  }

  return runPythonCreativeAgent({
    projectId: input.project.id,
    scriptId: input.scriptId,
    product: input.product,
    materials: input.materials
  }).catch(async (error) => {
    const fallback = await runCreativeAgent({
      projectId: input.project.id,
      scriptId: input.scriptId,
      product: input.product,
      materials: input.materials
    });
    const message = error instanceof Error ? error.message : String(error);
    return {
      ...fallback,
      trace: [
        {
          id: crypto.randomUUID(),
          projectId: input.project.id,
          node: "PythonAgentClient",
          status: "failed" as const,
          message: "Python LangGraph Agent 调用失败，已回退到 TypeScript Agent",
          output: { error: message.slice(0, 500) },
          createdAt: nowIso()
        },
        ...fallback.trace
      ]
    };
  });
}

export async function processScriptGenerationJob(jobId: string) {
  await store.reload();
  const job = await store.getJob(jobId);
  if (!job) return;

  const traces: GenerationTrace[] = [trace(job.id, job.projectId, "started", "开始生成剧本和分镜")];

  try {
    if (!job.projectId) throw new Error("Script generation job is missing projectId.");
    if (!job.scriptId) throw new Error("Script generation job is missing scriptId.");

    await store.updateJob(job.id, {
      status: "running",
      progress: 8,
      currentStep: "读取项目和商品信息"
    });
    const project = await store.getProject(job.projectId);
    if (!project) throw new Error("Project not found for script generation job.");

    const product = await store.getProduct(job.productId ?? project.productId);
    if (!product) throw new Error("Product not found for script generation job.");

    await store.updateJob(job.id, { progress: 18, currentStep: "召回项目素材" });
    const materials = await store.listMaterials(project.id);

    await store.updateJob(job.id, { progress: 32, currentStep: "运行 LangGraph 创作 Agent" });
    const result = await runAgent({ project, product, materials, scriptId: job.scriptId });

    await store.updateJob(job.id, { progress: 82, currentStep: "保存剧本、分镜和 Trace" });
    await store.upsertScript(result.script);
    await store.updateProject(project.id, { scriptId: job.scriptId, status: "scripted" });
    await store.addTraces(result.trace.map((item) => ({ ...item, jobId: item.jobId ?? job.id })));

    await store.updateJob(job.id, {
      status: "succeeded",
      progress: 100,
      currentStep: "剧本和分镜生成完成"
    });
    traces.push(
      trace(job.id, project.id, "succeeded", "剧本和分镜生成完成", {
        scriptId: result.script.id,
        sceneCount: result.scenes.length
      })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await store.updateJob(job.id, {
      status: "failed",
      progress: 100,
      currentStep: "剧本生成失败",
      error: message
    });
    traces.push(trace(job.id, job.projectId, "failed", message));
  } finally {
    await store.addTraces(traces);
  }
}
