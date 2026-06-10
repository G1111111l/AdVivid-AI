import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import {
  createProductSchema,
  materialSchema,
  materialTypeSchema,
  nowIso,
  productSchema,
  projectSchema,
  renderJobSchema,
  sceneSchema,
  type MaterialType,
  type Product,
  type Project
} from "@advivid/shared";
import { config } from "./config.js";
import { createMockAnalytics } from "./services/analytics.js";
import { recommendMaterialsForScene, searchMaterials } from "./services/materialAnalysis.js";
import {
  enqueueMaterialAnalysisJob,
  enqueueRenderJob,
  enqueueScriptGenerationJob
} from "./services/renderQueue.js";
import { scenesToRenderPlan } from "./services/renderRunner.js";
import { regenerateScene } from "./services/sceneRegeneration.js";
import { seedanceConfigured, shouldAttemptSeedance } from "./services/seedanceClient.js";
import { store } from "./services/store.js";

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? "info"
  }
});

const id = () => crypto.randomUUID();

function createProduct(input: Partial<Product>) {
  const now = nowIso();
  return productSchema.parse({
    id: id(),
    title: input.title,
    sellingPoints: input.sellingPoints ?? [],
    targetAudience: input.targetAudience ?? "",
    scenario: input.scenario ?? "",
    style: input.style ?? "场景种草",
    creativeBrief: input.creativeBrief ?? "",
    language: input.language ?? "zh-CN",
    durationSec: input.durationSec ?? 24,
    createdAt: now,
    updatedAt: now
  });
}

function createProject(input: { productId: string; name: string }) {
  const now = nowIso();
  return projectSchema.parse({
    id: id(),
    productId: input.productId,
    name: input.name,
    status: "draft",
    createdAt: now,
    updatedAt: now
  });
}

function inferMaterialType(mimeType: string, explicit?: string): MaterialType {
  const parsed = materialTypeSchema.safeParse(explicit);
  if (parsed.success) return parsed.data;
  if (mimeType.startsWith("video")) return "product_video";
  if (mimeType.startsWith("audio")) return "audio";
  return "product_image";
}

async function bootstrap() {
  await mkdir(config.uploadDir, { recursive: true });
  await mkdir(config.renderDir, { recursive: true });
  await store.init();

  if ((await store.listAnalytics()).length === 0) {
    await store.setAnalytics(createMockAnalytics());
  }

  await app.register(cors, {
    origin: true,
    credentials: true
  });
  await app.register(multipart, {
    limits: {
      fileSize: 120 * 1024 * 1024
    }
  });
  await app.register(fastifyStatic, {
    root: config.uploadDir,
    prefix: "/uploads/"
  });
  await app.register(fastifyStatic, {
    root: config.renderDir,
    prefix: "/rendered/",
    decorateReply: false
  });

  app.get("/api/health", async () => ({
    ok: true,
    service: "advivid-api",
    agentRuntime: config.agentRuntime,
    pythonAgentUrl: config.pythonAgentUrl,
    time: nowIso()
  }));

  app.get("/api/models/status", async () => ({
    ok: true,
    agentRuntime: config.agentRuntime,
    useMockAi: config.useMockAi,
    textModelConfigured: Boolean(config.ark.apiKey && config.ark.textEndpoint),
    videoModelConfigured: seedanceConfigured(),
    videoRenderProvider: config.videoRenderProvider,
    seedanceRenderMode: config.seedanceRenderMode,
    seedanceTotalDurationSec: config.seedanceTotalDurationSec,
    willAttemptSeedance: shouldAttemptSeedance(),
    queueDriver: config.queueDriver,
    storeDriver: config.storeDriver
  }));

  app.get("/api/products", async () => store.listProducts());

  app.post("/api/products", async (request, reply) => {
    const input = createProductSchema.parse(request.body);
    const product = await store.upsertProduct(createProduct(input));
    return reply.code(201).send(product);
  });

  app.get("/api/products/:id", async (request, reply) => {
    const product = await store.getProduct((request.params as { id: string }).id);
    if (!product) return reply.code(404).send({ message: "Product not found" });
    return product;
  });

  app.patch("/api/products/:id", async (request, reply) => {
    const product = await store.getProduct((request.params as { id: string }).id);
    if (!product) return reply.code(404).send({ message: "Product not found" });
    const patch = request.body as Partial<Product>;
    const updated = productSchema.parse({ ...product, ...patch, updatedAt: nowIso() });
    await store.upsertProduct(updated);
    return updated;
  });

  app.get("/api/projects", async () => {
    await store.reload();
    const projects = await store.listProjects();
    return Promise.all(
      projects.map(async (project) => ({
        ...project,
        product: await store.getProduct(project.productId),
        videos: await store.listVideos(project.id)
      }))
    );
  });

  app.post("/api/projects", async (request, reply) => {
    const body = request.body as Partial<Product> & { name?: string };
    const product = await store.upsertProduct(createProduct(body));
    const project = await store.upsertProject(
      createProject({ productId: product.id, name: body.name || product.title })
    );
    return reply.code(201).send({ project, product });
  });

  app.get("/api/projects/:id", async (request, reply) => {
    await store.reload();
    const project = await store.getProject((request.params as { id: string }).id);
    if (!project) return reply.code(404).send({ message: "Project not found" });

    return {
      project,
      product: await store.getProduct(project.productId),
      materials: await store.listMaterials(project.id),
      script: project.scriptId ? await store.getScript(project.scriptId) : undefined,
      scenes: await store.listScenes(project.id),
      jobs: (await store.listJobs()).filter((job) => job.projectId === project.id),
      videos: await store.listVideos(project.id),
      traces: await store.listTraces({ projectId: project.id })
    };
  });

  app.delete("/api/projects/:id", async (request) => {
    await store.deleteProject((request.params as { id: string }).id);
    return { ok: true };
  });

  app.get("/api/materials", async (request) => {
    await store.reload();
    const query = request.query as { projectId?: string };
    return store.listMaterials(query.projectId);
  });

  app.post("/api/materials", async (request, reply) => {
    const query = request.query as { type?: string; projectId?: string };
    const part = await request.file();
    if (!part) return reply.code(400).send({ message: "Missing file field" });

    const materialId = id();
    const extension = path.extname(part.filename) || "";
    const storedName = `${materialId}${extension}`;
    const filePath = path.join(config.uploadDir, storedName);
    await pipeline(part.file, createWriteStream(filePath));

    const now = nowIso();
    const material = materialSchema.parse({
      id: materialId,
      projectId: query.projectId,
      type: inferMaterialType(part.mimetype, query.type),
      name: part.filename,
      mimeType: part.mimetype,
      size: part.file.bytesRead ?? 0,
      url: `/uploads/${storedName}`,
      path: filePath,
      cutoutStatus: part.mimetype.startsWith("image") ? "pending" : "not_applicable",
      summary: "等待结构化分析",
      tags: [],
      embedding: [],
      slices: [],
      createdAt: now,
      updatedAt: now
    });

    await store.upsertMaterial(material);
    const job = renderJobSchema.parse({
      id: id(),
      taskType: "material_analysis",
      projectId: query.projectId,
      materialId: material.id,
      status: "queued",
      progress: 0,
      currentStep: "等待素材结构化分析",
      createdAt: now,
      updatedAt: now
    });
    await store.upsertJob(job);
    const queueResult = await enqueueMaterialAnalysisJob(job.id);
    await store.updateJob(job.id, {
      currentStep:
        queueResult.driver === "bullmq" ? "已进入 BullMQ 素材分析队列" : "等待本地素材分析"
    });

    return reply.code(201).send({
      material,
      job: await store.getJob(job.id),
      queue: queueResult
    });
  });

  app.get("/api/materials/search", async (request) => {
    const query = request.query as { q?: string; projectId?: string };
    const materials = await store.listMaterials(query.projectId);
    return searchMaterials(materials, query.q ?? "");
  });

  app.get("/api/scenes/:id/material-recommendations", async (request, reply) => {
    const scene = await store.getScene((request.params as { id: string }).id);
    if (!scene) return reply.code(404).send({ message: "Scene not found" });
    const query = request.query as { limit?: string };
    const limit = Math.max(1, Math.min(12, Number(query.limit ?? 6) || 6));
    const materials = await store.listMaterials(scene.projectId);
    return recommendMaterialsForScene(materials, scene, limit);
  });

  app.get("/api/materials/:id", async (request, reply) => {
    const material = await store.getMaterial((request.params as { id: string }).id);
    if (!material) return reply.code(404).send({ message: "Material not found" });
    return material;
  });

  app.post("/api/materials/:id/analyze", async (request, reply) => {
    const material = await store.getMaterial((request.params as { id: string }).id);
    if (!material) return reply.code(404).send({ message: "Material not found" });
    const now = nowIso();
    const job = renderJobSchema.parse({
      id: id(),
      taskType: "material_analysis",
      projectId: material.projectId,
      materialId: material.id,
      status: "queued",
      progress: 0,
      currentStep: "等待重新分析素材",
      createdAt: now,
      updatedAt: now
    });
    await store.upsertJob(job);
    const queueResult = await enqueueMaterialAnalysisJob(job.id);
    await store.updateJob(job.id, {
      currentStep:
        queueResult.driver === "bullmq" ? "已进入 BullMQ 素材分析队列" : "等待本地素材分析"
    });
    return reply.code(202).send({ ...(await store.getJob(job.id)), queue: queueResult });
  });

  app.delete("/api/materials/:id", async (request) => {
    await store.deleteMaterial((request.params as { id: string }).id);
    return { ok: true };
  });

  app.post("/api/scripts/generate", async (request, reply) => {
    const body = request.body as {
      projectId?: string;
      productId?: string;
      product?: Partial<Product>;
    };

    let product = body.productId ? await store.getProduct(body.productId) : undefined;
    let project: Project | undefined = body.projectId
      ? await store.getProject(body.projectId)
      : undefined;

    if (!product) {
      if (!body.product) return reply.code(400).send({ message: "Missing product input" });
      product = await store.upsertProduct(createProduct(body.product));
    }

    if (!project) {
      project = await store.upsertProject(
        createProject({ productId: product.id, name: product.title })
      );
    }

    const scriptId = id();
    const now = nowIso();
    const job = renderJobSchema.parse({
      id: id(),
      taskType: "script_generation",
      projectId: project.id,
      productId: product.id,
      scriptId,
      status: "queued",
      progress: 0,
      currentStep: "等待生成剧本和分镜",
      createdAt: now,
      updatedAt: now
    });
    await store.upsertJob(job);
    const queueResult = await enqueueScriptGenerationJob(job.id);
    await store.updateJob(job.id, {
      currentStep:
        queueResult.driver === "bullmq" ? "已进入 BullMQ 剧本生成队列" : "等待本地剧本生成"
    });

    return reply.code(202).send({
      project: await store.getProject(project.id),
      product,
      job: await store.getJob(job.id),
      queue: queueResult
    });
  });

  app.get("/api/scripts/:id", async (request, reply) => {
    const script = await store.getScript((request.params as { id: string }).id);
    if (!script) return reply.code(404).send({ message: "Script not found" });
    return script;
  });

  app.patch("/api/scripts/:id", async (request, reply) => {
    const script = await store.getScript((request.params as { id: string }).id);
    if (!script) return reply.code(404).send({ message: "Script not found" });
    const updated = { ...script, ...(request.body as object), updatedAt: nowIso() };
    await store.upsertScript(updated);
    return updated;
  });

  app.post("/api/scripts/:id/regenerate", async (request, reply) => {
    const script = await store.getScript((request.params as { id: string }).id);
    if (!script) return reply.code(404).send({ message: "Script not found" });
    const project = await store.getProject(script.projectId);
    const product = await store.getProduct(script.productId);
    if (!project || !product)
      return reply.code(404).send({ message: "Project or product not found" });

    const now = nowIso();
    const job = renderJobSchema.parse({
      id: id(),
      taskType: "script_generation",
      projectId: project.id,
      productId: product.id,
      scriptId: script.id,
      status: "queued",
      progress: 0,
      currentStep: "等待重新生成剧本和分镜",
      createdAt: now,
      updatedAt: now
    });
    await store.upsertJob(job);
    const queueResult = await enqueueScriptGenerationJob(job.id);
    await store.updateJob(job.id, {
      currentStep:
        queueResult.driver === "bullmq" ? "已进入 BullMQ 剧本生成队列" : "等待本地剧本生成"
    });
    return reply.code(202).send({ ...(await store.getJob(job.id)), queue: queueResult });
  });

  app.get("/api/projects/:id/scenes", async (request) => {
    return store.listScenes((request.params as { id: string }).id);
  });

  app.patch("/api/scenes/:id", async (request, reply) => {
    const patch = request.body as Record<string, unknown>;
    if (typeof patch.durationSec === "string") patch.durationSec = Number(patch.durationSec);
    if (patch.materialId === "") patch.materialId = undefined;
    if (patch.materialSliceId === "") patch.materialSliceId = undefined;
    const current = await store.getScene((request.params as { id: string }).id);
    if (!current) return reply.code(404).send({ message: "Scene not found" });
    const candidate = sceneSchema.partial().parse(patch);
    const updated = await store.updateScene(current.id, candidate);
    return updated;
  });

  app.post("/api/scenes/:id/regenerate", async (request, reply) => {
    const scene = await store.getScene((request.params as { id: string }).id);
    if (!scene) return reply.code(404).send({ message: "Scene not found" });
    const project = await store.getProject(scene.projectId);
    const product = project ? await store.getProduct(project.productId) : undefined;
    if (!project || !product)
      return reply.code(404).send({ message: "Project or product not found" });

    const material = scene.materialId ? await store.getMaterial(scene.materialId) : undefined;
    const regenerated = await regenerateScene({ scene, product, material });
    const { source, ...patch } = regenerated;
    const updated = await store.updateScene(scene.id, patch);
    await store.addTraces([
      {
        id: id(),
        projectId: scene.projectId,
        node: "SceneRegenerator",
        status: "succeeded",
        message: source === "ark" ? "火山方舟完成单分镜重生成" : "本地兜底完成单分镜重生成",
        output: {
          sceneId: scene.id,
          source,
          materialId: scene.materialId,
          materialSliceId: scene.materialSliceId
        },
        createdAt: nowIso()
      }
    ]);
    return updated;
  });

  app.post("/api/scenes/:id/render-preview", async (request, reply) => {
    const scene = await store.getScene((request.params as { id: string }).id);
    if (!scene) return reply.code(404).send({ message: "Scene not found" });
    const project = await store.getProject(scene.projectId);
    if (!project) return reply.code(404).send({ message: "Project not found" });
    const material = scene.materialId ? await store.getMaterial(scene.materialId) : undefined;
    const now = nowIso();
    const renderPlan = scenesToRenderPlan({
      scenes: [
        {
          ...scene,
          materialUrl: material?.url
        }
      ],
      ratio: "9:16",
      resolution: "720p"
    });
    const job = renderJobSchema.parse({
      id: id(),
      taskType: "scene_preview",
      projectId: scene.projectId,
      scriptId: scene.scriptId,
      status: "queued",
      progress: 0,
      currentStep: "等待单镜预览渲染",
      renderPlan,
      createdAt: now,
      updatedAt: now
    });

    await store.upsertJob(job);
    await store.updateProject(project.id, { status: "rendering" });
    const queueResult = await enqueueRenderJob(job.id);
    await store.updateJob(job.id, {
      currentStep:
        queueResult.driver === "bullmq" ? "单镜预览已进入 BullMQ 队列" : "等待本地单镜预览"
    });

    return reply.code(202).send({ ...(await store.getJob(job.id)), queue: queueResult });
  });

  app.post("/api/scenes/reorder", async (request) => {
    const body = request.body as { sceneIds: string[] };
    return store.reorderScenes(body.sceneIds);
  });

  app.post("/api/videos/render", async (request, reply) => {
    const body = request.body as {
      projectId: string;
      scriptId?: string;
      ratio?: "9:16" | "16:9";
      resolution?: "720p" | "1080p";
    };
    const project = await store.getProject(body.projectId);
    if (!project) return reply.code(404).send({ message: "Project not found" });
    const script = await store.getScript(body.scriptId ?? project.scriptId ?? "");
    if (!script) return reply.code(404).send({ message: "Script not found" });

    const now = nowIso();
    const materials = await store.listMaterials(project.id);
    const materialMap = new Map(materials.map((material) => [material.id, material]));
    const renderPlan = scenesToRenderPlan({
      scenes: script.scenes.map((scene) => ({
        ...scene,
        materialUrl: scene.materialId ? materialMap.get(scene.materialId)?.url : undefined
      })),
      ratio: body.ratio,
      resolution: body.resolution
    });
    const job = renderJobSchema.parse({
      id: id(),
      taskType: "video_render",
      projectId: project.id,
      scriptId: script.id,
      status: "queued",
      progress: 0,
      currentStep: "等待渲染",
      renderPlan,
      createdAt: now,
      updatedAt: now
    });

    await store.upsertJob(job);
    await store.updateProject(project.id, { status: "rendering" });
    const queueResult = await enqueueRenderJob(job.id);
    await store.updateJob(job.id, {
      currentStep: queueResult.driver === "bullmq" ? "已进入 BullMQ 渲染队列" : "等待本地渲染"
    });

    return reply.code(202).send({ ...(await store.getJob(job.id)), queue: queueResult });
  });

  app.get("/api/videos/:id", async (request, reply) => {
    const video = await store.getVideo((request.params as { id: string }).id);
    if (!video) return reply.code(404).send({ message: "Video not found" });
    return video;
  });

  app.get("/api/videos/:id/export", async (request, reply) => {
    const video = await store.getVideo((request.params as { id: string }).id);
    if (!video) return reply.code(404).send({ message: "Video not found" });
    return reply.redirect(video.url);
  });

  app.get("/api/jobs/:id", async (request, reply) => {
    await store.reload();
    const job = await store.getJob((request.params as { id: string }).id);
    if (!job) return reply.code(404).send({ message: "Job not found" });
    return {
      ...job,
      video: job.outputVideoId ? await store.getVideo(job.outputVideoId) : undefined,
      traces: await store.listTraces({ jobId: job.id })
    };
  });

  app.post("/api/jobs/:id/retry", async (request, reply) => {
    const job = await store.getJob((request.params as { id: string }).id);
    if (!job) return reply.code(404).send({ message: "Job not found" });
    await store.updateJob(job.id, {
      status: "queued",
      progress: 0,
      currentStep: "等待重试",
      error: undefined
    });
    const queueResult =
      job.taskType === "material_analysis"
        ? await enqueueMaterialAnalysisJob(job.id)
        : job.taskType === "script_generation"
          ? await enqueueScriptGenerationJob(job.id)
          : await enqueueRenderJob(job.id);
    await store.updateJob(job.id, {
      currentStep:
        queueResult.driver === "bullmq"
          ? `已重新进入 BullMQ ${queueResult.queueName} 队列`
          : "等待本地重试"
    });
    return { ...(await store.getJob(job.id)), queue: queueResult };
  });

  app.get("/api/jobs/:id/traces", async (request) => {
    return store.listTraces({ jobId: (request.params as { id: string }).id });
  });

  app.get("/api/analytics/mock", async () => store.listAnalytics());

  app.get("/api/analytics/projects/:id", async (request) => {
    const projectId = (request.params as { id: string }).id;
    const metrics = (await store.listAnalytics()).filter((item) => item.projectId === projectId);
    return metrics.length > 0 ? metrics : createMockAnalytics(projectId);
  });

  await app.listen({ host: config.host, port: config.port });
}

bootstrap().catch((error) => {
  app.log.error(error);
  process.exit(1);
});
