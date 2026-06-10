import { PrismaClient } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import {
  analyticsMetricSchema,
  generatedVideoSchema,
  generationTraceSchema,
  materialSchema,
  materialSliceSchema,
  nowIso,
  productSchema,
  projectSchema,
  renderJobSchema,
  sceneSchema,
  scriptSchema,
  type AnalyticsMetric,
  type GeneratedVideo,
  type GenerationTrace,
  type Material,
  type MaterialSlice,
  type Product,
  type Project,
  type RenderJob,
  type RenderPlan,
  type Scene,
  type Script
} from "@advivid/shared";
import type { AppStore } from "./store.js";

const toDate = (value: string) => new Date(value);
const toIso = (value: Date) => value.toISOString();

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function toEmbedding(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter((item): item is number => typeof item === "number")
    : [];
}

function hasOwn<T extends object>(object: T, key: keyof T) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function mapProduct(row: any): Product {
  return productSchema.parse({
    ...row,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt)
  });
}

function mapMaterialSlice(row: any): MaterialSlice {
  return materialSliceSchema.parse({
    ...row,
    thumbnailUrl: row.thumbnailUrl ?? undefined,
    embedding: toEmbedding(row.embeddingJson),
    createdAt: toIso(row.createdAt)
  });
}

function mapMaterial(row: any): Material {
  return materialSchema.parse({
    ...row,
    projectId: row.projectId ?? undefined,
    cutoutUrl: row.cutoutUrl ?? undefined,
    cutoutPath: row.cutoutPath ?? undefined,
    cutoutStatus: row.cutoutStatus ?? undefined,
    embedding: toEmbedding(row.embeddingJson),
    slices: (row.slices ?? []).map(mapMaterialSlice),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt)
  });
}

function mapProject(row: any): Project {
  return projectSchema.parse({
    ...row,
    scriptId: row.scriptId ?? undefined,
    coverUrl: row.coverUrl ?? undefined,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt)
  });
}

function mapScene(row: any): Scene {
  return sceneSchema.parse({
    ...row,
    materialId: row.materialId ?? undefined,
    materialSliceId: row.materialSliceId ?? undefined,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt)
  });
}

function mapScript(row: any): Script {
  return scriptSchema.parse({
    ...row,
    scenes: (row.scenes ?? []).map(mapScene),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt)
  });
}

function mapRenderJob(row: any): RenderJob {
  return renderJobSchema.parse({
    ...row,
    projectId: row.projectId ?? undefined,
    productId: row.productId ?? undefined,
    scriptId: row.scriptId ?? undefined,
    materialId: row.materialId ?? undefined,
    error: row.error ?? undefined,
    renderPlan: row.renderPlan ? (row.renderPlan as RenderPlan) : undefined,
    outputVideoId: row.outputVideoId ?? undefined,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt)
  });
}

function mapGeneratedVideo(row: any): GeneratedVideo {
  return generatedVideoSchema.parse({
    ...row,
    createdAt: toIso(row.createdAt)
  });
}

function mapGenerationTrace(row: any): GenerationTrace {
  return generationTraceSchema.parse({
    ...row,
    jobId: row.jobId ?? undefined,
    projectId: row.projectId ?? undefined,
    input: row.input ?? undefined,
    output: row.output ?? undefined,
    createdAt: toIso(row.createdAt)
  });
}

function mapAnalytics(row: any): AnalyticsMetric {
  return analyticsMetricSchema.parse({
    ...row,
    projectId: row.projectId ?? undefined,
    videoId: row.videoId ?? undefined,
    createdAt: toIso(row.createdAt)
  });
}

const materialInclude = {
  slices: {
    orderBy: {
      index: "asc"
    }
  }
} as const;

const scriptInclude = {
  scenes: {
    orderBy: {
      order: "asc"
    }
  }
} as const;

export class PrismaStore implements AppStore {
  private readonly prisma = new PrismaClient();

  async init() {
    await this.prisma.$connect();
  }

  async reload() {
    return Promise.resolve();
  }

  async listProducts() {
    const rows = await this.prisma.product.findMany({
      orderBy: { createdAt: "desc" }
    });
    return rows.map(mapProduct);
  }

  async upsertProduct(product: Product) {
    const create = {
      id: product.id,
      title: product.title,
      sellingPoints: product.sellingPoints,
      targetAudience: product.targetAudience,
      scenario: product.scenario,
      style: product.style,
      creativeBrief: product.creativeBrief,
      language: product.language,
      durationSec: product.durationSec,
      createdAt: toDate(product.createdAt),
      updatedAt: toDate(product.updatedAt)
    };
    const update = {
      title: product.title,
      sellingPoints: product.sellingPoints,
      targetAudience: product.targetAudience,
      scenario: product.scenario,
      style: product.style,
      creativeBrief: product.creativeBrief,
      language: product.language,
      durationSec: product.durationSec,
      updatedAt: toDate(product.updatedAt)
    };
    const row = await this.prisma.product.upsert({
      where: { id: product.id },
      create,
      update
    });
    return mapProduct(row);
  }

  async getProduct(id: string) {
    const row = await this.prisma.product.findUnique({ where: { id } });
    return row ? mapProduct(row) : undefined;
  }

  async listProjects() {
    const rows = await this.prisma.project.findMany({
      orderBy: { updatedAt: "desc" }
    });
    return rows.map(mapProject);
  }

  async getProject(id: string) {
    const row = await this.prisma.project.findUnique({ where: { id } });
    return row ? mapProject(row) : undefined;
  }

  async upsertProject(project: Project) {
    const create = {
      id: project.id,
      name: project.name,
      productId: project.productId,
      scriptId: project.scriptId ?? null,
      status: project.status,
      coverUrl: project.coverUrl ?? null,
      createdAt: toDate(project.createdAt),
      updatedAt: toDate(project.updatedAt)
    };
    const update = {
      name: project.name,
      productId: project.productId,
      scriptId: project.scriptId ?? null,
      status: project.status,
      coverUrl: project.coverUrl ?? null,
      updatedAt: toDate(project.updatedAt)
    };
    const row = await this.prisma.project.upsert({
      where: { id: project.id },
      create,
      update
    });
    return mapProject(row);
  }

  async updateProject(id: string, patch: Partial<Project>) {
    const exists = await this.prisma.project.findUnique({ where: { id } });
    if (!exists) return undefined;

    const data: Record<string, unknown> = { updatedAt: toDate(nowIso()) };
    if (hasOwn(patch, "name")) data.name = patch.name;
    if (hasOwn(patch, "productId")) data.productId = patch.productId;
    if (hasOwn(patch, "scriptId")) data.scriptId = patch.scriptId ?? null;
    if (hasOwn(patch, "status")) data.status = patch.status;
    if (hasOwn(patch, "coverUrl")) data.coverUrl = patch.coverUrl ?? null;

    const row = await this.prisma.project.update({
      where: { id },
      data
    });
    return mapProject(row);
  }

  async deleteProject(id: string) {
    await this.prisma.$transaction(async (tx) => {
      const project = await tx.project.findUnique({ where: { id } });
      if (!project) return;

      await tx.analyticsMockEvent.deleteMany({ where: { projectId: id } });
      await tx.generationTrace.deleteMany({ where: { projectId: id } });
      await tx.generatedVideo.deleteMany({ where: { projectId: id } });
      await tx.renderJob.deleteMany({ where: { projectId: id } });
      await tx.material.deleteMany({ where: { projectId: id } });
      await tx.scene.deleteMany({ where: { projectId: id } });
      await tx.script.deleteMany({ where: { projectId: id } });
      await tx.project.delete({ where: { id } });

      const productUseCount = await tx.project.count({ where: { productId: project.productId } });
      if (productUseCount === 0) {
        await tx.product.deleteMany({ where: { id: project.productId } });
      }
    });
  }

  async listMaterials(projectId?: string) {
    const rows = await this.prisma.material.findMany({
      where: projectId ? { projectId } : undefined,
      include: materialInclude,
      orderBy: { createdAt: "desc" }
    });
    return rows.map(mapMaterial);
  }

  async getMaterial(id: string) {
    const row = await this.prisma.material.findUnique({
      where: { id },
      include: materialInclude
    });
    return row ? mapMaterial(row) : undefined;
  }

  async upsertMaterial(material: Material) {
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.material.upsert({
        where: { id: material.id },
        create: {
          id: material.id,
          projectId: material.projectId ?? null,
          type: material.type,
          name: material.name,
          mimeType: material.mimeType,
          size: material.size,
          url: material.url,
          path: material.path,
          cutoutUrl: material.cutoutUrl ?? null,
          cutoutPath: material.cutoutPath ?? null,
          cutoutStatus: material.cutoutStatus ?? null,
          summary: material.summary,
          tags: material.tags,
          embeddingJson: toJson(material.embedding),
          createdAt: toDate(material.createdAt),
          updatedAt: toDate(material.updatedAt)
        },
        update: {
          projectId: material.projectId ?? null,
          type: material.type,
          name: material.name,
          mimeType: material.mimeType,
          size: material.size,
          url: material.url,
          path: material.path,
          cutoutUrl: material.cutoutUrl ?? null,
          cutoutPath: material.cutoutPath ?? null,
          cutoutStatus: material.cutoutStatus ?? null,
          summary: material.summary,
          tags: material.tags,
          embeddingJson: toJson(material.embedding),
          updatedAt: toDate(material.updatedAt)
        }
      });
      await tx.materialSlice.deleteMany({ where: { materialId: material.id } });
      if (material.slices.length > 0) {
        await tx.materialSlice.createMany({
          data: material.slices.map((slice) => ({
            id: slice.id,
            materialId: slice.materialId,
            index: slice.index,
            startSec: slice.startSec,
            endSec: slice.endSec,
            thumbnailUrl: slice.thumbnailUrl ?? null,
            summary: slice.summary,
            tags: slice.tags,
            embeddingJson: toJson(slice.embedding),
            createdAt: toDate(slice.createdAt)
          }))
        });
      }
      return tx.material.findUniqueOrThrow({
        where: { id: material.id },
        include: materialInclude
      });
    });
    return mapMaterial(row);
  }

  async deleteMaterial(id: string) {
    await this.prisma.material.deleteMany({ where: { id } });
  }

  async listScripts(projectId?: string) {
    const rows = await this.prisma.script.findMany({
      where: projectId ? { projectId } : undefined,
      include: scriptInclude,
      orderBy: { createdAt: "desc" }
    });
    return rows.map(mapScript);
  }

  async getScript(id: string) {
    const row = await this.prisma.script.findUnique({
      where: { id },
      include: scriptInclude
    });
    return row ? mapScript(row) : undefined;
  }

  async upsertScript(script: Script) {
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.script.upsert({
        where: { id: script.id },
        create: {
          id: script.id,
          projectId: script.projectId,
          productId: script.productId,
          title: script.title,
          narrative: script.narrative,
          hook: script.hook,
          style: script.style,
          strategy: script.strategy,
          constraints: script.constraints,
          createdAt: toDate(script.createdAt),
          updatedAt: toDate(script.updatedAt)
        },
        update: {
          projectId: script.projectId,
          productId: script.productId,
          title: script.title,
          narrative: script.narrative,
          hook: script.hook,
          style: script.style,
          strategy: script.strategy,
          constraints: script.constraints,
          updatedAt: toDate(script.updatedAt)
        }
      });
      await tx.scene.deleteMany({ where: { scriptId: script.id } });
      if (script.scenes.length > 0) {
        await tx.scene.createMany({
          data: script.scenes.map((scene) => ({
            id: scene.id,
            projectId: scene.projectId,
            scriptId: scene.scriptId,
            order: scene.order,
            title: scene.title,
            visual: scene.visual,
            camera: scene.camera,
            voiceover: scene.voiceover,
            subtitle: scene.subtitle,
            bgm: scene.bgm,
            durationSec: scene.durationSec,
            materialId: scene.materialId ?? null,
            materialSliceId: scene.materialSliceId ?? null,
            generationMode: scene.generationMode,
            tags: scene.tags,
            createdAt: toDate(scene.createdAt),
            updatedAt: toDate(scene.updatedAt)
          }))
        });
      }
      return tx.script.findUniqueOrThrow({
        where: { id: script.id },
        include: scriptInclude
      });
    });
    return mapScript(row);
  }

  async listScenes(projectId: string) {
    const rows = await this.prisma.scene.findMany({
      where: { projectId },
      orderBy: { order: "asc" }
    });
    return rows.map(mapScene);
  }

  async getScene(id: string) {
    const row = await this.prisma.scene.findUnique({ where: { id } });
    return row ? mapScene(row) : undefined;
  }

  async updateScene(id: string, patch: Partial<Scene>) {
    const exists = await this.prisma.scene.findUnique({ where: { id } });
    if (!exists) return undefined;

    const data: Record<string, unknown> = { updatedAt: toDate(nowIso()) };
    if (hasOwn(patch, "order")) data.order = patch.order;
    if (hasOwn(patch, "title")) data.title = patch.title;
    if (hasOwn(patch, "visual")) data.visual = patch.visual;
    if (hasOwn(patch, "camera")) data.camera = patch.camera;
    if (hasOwn(patch, "voiceover")) data.voiceover = patch.voiceover;
    if (hasOwn(patch, "subtitle")) data.subtitle = patch.subtitle;
    if (hasOwn(patch, "bgm")) data.bgm = patch.bgm;
    if (hasOwn(patch, "durationSec")) data.durationSec = patch.durationSec;
    if (hasOwn(patch, "materialId")) data.materialId = patch.materialId ?? null;
    if (hasOwn(patch, "materialSliceId")) data.materialSliceId = patch.materialSliceId ?? null;
    if (hasOwn(patch, "generationMode")) data.generationMode = patch.generationMode;
    if (hasOwn(patch, "tags")) data.tags = patch.tags;

    const row = await this.prisma.scene.update({
      where: { id },
      data
    });
    return mapScene(row);
  }

  async reorderScenes(sceneIds: string[]) {
    const rows = await this.prisma.$transaction(async (tx) => {
      await Promise.all(
        sceneIds.map((sceneId, index) =>
          tx.scene.update({
            where: { id: sceneId },
            data: {
              order: index + 1,
              updatedAt: toDate(nowIso())
            }
          })
        )
      );
      return tx.scene.findMany({
        where: { id: { in: sceneIds } }
      });
    });
    const byId = new Map(rows.map((row) => [row.id, mapScene(row)]));
    return sceneIds.map((id) => byId.get(id)).filter(Boolean) as Scene[];
  }

  async listJobs() {
    const rows = await this.prisma.renderJob.findMany({
      orderBy: { updatedAt: "desc" }
    });
    return rows.map(mapRenderJob);
  }

  async getJob(id: string) {
    const row = await this.prisma.renderJob.findUnique({ where: { id } });
    return row ? mapRenderJob(row) : undefined;
  }

  async upsertJob(job: RenderJob) {
    const create = {
      id: job.id,
      taskType: job.taskType,
      projectId: job.projectId ?? null,
      productId: job.productId ?? null,
      scriptId: job.scriptId ?? null,
      materialId: job.materialId ?? null,
      status: job.status,
      progress: job.progress,
      currentStep: job.currentStep,
      error: job.error ?? null,
      renderPlan: toJson(job.renderPlan),
      outputVideoId: job.outputVideoId ?? null,
      createdAt: toDate(job.createdAt),
      updatedAt: toDate(job.updatedAt)
    };
    const update = {
      taskType: job.taskType,
      projectId: job.projectId ?? null,
      productId: job.productId ?? null,
      scriptId: job.scriptId ?? null,
      materialId: job.materialId ?? null,
      status: job.status,
      progress: job.progress,
      currentStep: job.currentStep,
      error: job.error ?? null,
      renderPlan: toJson(job.renderPlan),
      outputVideoId: job.outputVideoId ?? null,
      updatedAt: toDate(job.updatedAt)
    };
    const row = await this.prisma.renderJob.upsert({
      where: { id: job.id },
      create,
      update
    });
    return mapRenderJob(row);
  }

  async updateJob(id: string, patch: Partial<RenderJob>) {
    const exists = await this.prisma.renderJob.findUnique({ where: { id } });
    if (!exists) return undefined;

    const data: Record<string, unknown> = { updatedAt: toDate(nowIso()) };
    if (hasOwn(patch, "taskType")) data.taskType = patch.taskType;
    if (hasOwn(patch, "projectId")) data.projectId = patch.projectId ?? null;
    if (hasOwn(patch, "productId")) data.productId = patch.productId ?? null;
    if (hasOwn(patch, "scriptId")) data.scriptId = patch.scriptId ?? null;
    if (hasOwn(patch, "materialId")) data.materialId = patch.materialId ?? null;
    if (hasOwn(patch, "status")) data.status = patch.status;
    if (hasOwn(patch, "progress")) data.progress = patch.progress;
    if (hasOwn(patch, "currentStep")) data.currentStep = patch.currentStep;
    if (hasOwn(patch, "error")) data.error = patch.error ?? null;
    if (hasOwn(patch, "renderPlan")) data.renderPlan = toJson(patch.renderPlan);
    if (hasOwn(patch, "outputVideoId")) data.outputVideoId = patch.outputVideoId ?? null;

    const row = await this.prisma.renderJob.update({
      where: { id },
      data
    });
    return mapRenderJob(row);
  }

  async listVideos(projectId?: string) {
    const rows = await this.prisma.generatedVideo.findMany({
      where: projectId ? { projectId } : undefined,
      orderBy: { createdAt: "asc" }
    });
    return rows.map(mapGeneratedVideo);
  }

  async getVideo(id: string) {
    const row = await this.prisma.generatedVideo.findUnique({ where: { id } });
    return row ? mapGeneratedVideo(row) : undefined;
  }

  async addVideo(video: GeneratedVideo) {
    const row = await this.prisma.generatedVideo.create({
      data: {
        id: video.id,
        projectId: video.projectId,
        jobId: video.jobId,
        url: video.url,
        path: video.path,
        ratio: video.ratio,
        resolution: video.resolution,
        durationSec: video.durationSec,
        version: video.version,
        createdAt: toDate(video.createdAt)
      }
    });
    return mapGeneratedVideo(row);
  }

  async addTraces(traces: GenerationTrace[]) {
    if (traces.length === 0) return [];
    await this.prisma.generationTrace.createMany({
      data: traces.map((trace) => ({
        id: trace.id,
        jobId: trace.jobId ?? null,
        projectId: trace.projectId ?? null,
        node: trace.node,
        status: trace.status,
        message: trace.message,
        input: toJson(trace.input),
        output: toJson(trace.output),
        createdAt: toDate(trace.createdAt)
      }))
    });
    return traces;
  }

  async listTraces(filter?: { jobId?: string; projectId?: string }) {
    const rows = await this.prisma.generationTrace.findMany({
      where: {
        ...(filter?.jobId ? { jobId: filter.jobId } : {}),
        ...(filter?.projectId ? { projectId: filter.projectId } : {})
      },
      orderBy: { createdAt: "asc" }
    });
    return rows.map(mapGenerationTrace);
  }

  async listAnalytics() {
    const rows = await this.prisma.analyticsMockEvent.findMany({
      orderBy: { createdAt: "asc" }
    });
    return rows.map(mapAnalytics);
  }

  async setAnalytics(metrics: AnalyticsMetric[]) {
    await this.prisma.$transaction(async (tx) => {
      await tx.analyticsMockEvent.deleteMany();
      if (metrics.length > 0) {
        await tx.analyticsMockEvent.createMany({
          data: metrics.map((metric) => ({
            id: metric.id,
            projectId: metric.projectId ?? null,
            videoId: metric.videoId ?? null,
            label: metric.label,
            hookType: metric.hookType,
            styleFactor: metric.styleFactor,
            views: metric.views,
            ctr: metric.ctr,
            conversionRate: metric.conversionRate,
            createdAt: toDate(metric.createdAt)
          }))
        });
      }
    });
  }
}
