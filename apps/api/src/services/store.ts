import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  AnalyticsMetric,
  GeneratedVideo,
  GenerationTrace,
  Material,
  Project,
  RenderJob,
  Scene,
  Script,
  Product
} from "@advivid/shared";
import { nowIso } from "@advivid/shared";
import { config } from "../config.js";
import { PrismaStore } from "./prismaStore.js";

export interface StoreData {
  products: Product[];
  materials: Material[];
  projects: Project[];
  scripts: Script[];
  scenes: Scene[];
  renderJobs: RenderJob[];
  generatedVideos: GeneratedVideo[];
  generationTraces: GenerationTrace[];
  analytics: AnalyticsMetric[];
}

type MaybePromise<T> = T | Promise<T>;

export interface AppStore {
  init(): Promise<void>;
  reload(): Promise<void>;
  listProducts(): MaybePromise<Product[]>;
  upsertProduct(product: Product): Promise<Product>;
  getProduct(id: string): MaybePromise<Product | undefined>;
  listProjects(): MaybePromise<Project[]>;
  getProject(id: string): MaybePromise<Project | undefined>;
  upsertProject(project: Project): Promise<Project>;
  updateProject(id: string, patch: Partial<Project>): Promise<Project | undefined>;
  deleteProject(id: string): Promise<void>;
  listMaterials(projectId?: string): MaybePromise<Material[]>;
  getMaterial(id: string): MaybePromise<Material | undefined>;
  upsertMaterial(material: Material): Promise<Material>;
  deleteMaterial(id: string): Promise<void>;
  listScripts(projectId?: string): MaybePromise<Script[]>;
  getScript(id: string): MaybePromise<Script | undefined>;
  upsertScript(script: Script): Promise<Script>;
  listScenes(projectId: string): MaybePromise<Scene[]>;
  getScene(id: string): MaybePromise<Scene | undefined>;
  updateScene(id: string, patch: Partial<Scene>): Promise<Scene | undefined>;
  reorderScenes(sceneIds: string[]): Promise<Scene[]>;
  listJobs(): MaybePromise<RenderJob[]>;
  getJob(id: string): MaybePromise<RenderJob | undefined>;
  upsertJob(job: RenderJob): Promise<RenderJob>;
  updateJob(id: string, patch: Partial<RenderJob>): Promise<RenderJob | undefined>;
  listVideos(projectId?: string): MaybePromise<GeneratedVideo[]>;
  getVideo(id: string): MaybePromise<GeneratedVideo | undefined>;
  addVideo(video: GeneratedVideo): Promise<GeneratedVideo>;
  addTraces(traces: GenerationTrace[]): Promise<GenerationTrace[]>;
  listTraces(filter?: { jobId?: string; projectId?: string }): MaybePromise<GenerationTrace[]>;
  listAnalytics(): MaybePromise<AnalyticsMetric[]>;
  setAnalytics(metrics: AnalyticsMetric[]): Promise<void>;
}

const emptyStore = (): StoreData => ({
  products: [],
  materials: [],
  projects: [],
  scripts: [],
  scenes: [],
  renderJobs: [],
  generatedVideos: [],
  generationTraces: [],
  analytics: []
});

const normalizeJob = (job: RenderJob): RenderJob => ({
  ...job,
  taskType: job.taskType ?? "video_render"
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class JsonStore {
  private data: StoreData = emptyStore();
  private readonly filePath = path.join(config.dataDir, "store.json");
  private saveChain: Promise<void> = Promise.resolve();

  async init() {
    await mkdir(config.dataDir, { recursive: true });

    await this.reload();
  }

  async reload() {
    if (existsSync(this.filePath)) {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          this.data = JSON.parse(await readFile(this.filePath, "utf8")) as StoreData;
          return;
        } catch (error) {
          if (attempt === 2) throw error;
          await new Promise((resolve) => setTimeout(resolve, 40 * (attempt + 1)));
        }
      }
    } else {
      this.data = emptyStore();
      await this.save();
    }
  }

  snapshot() {
    return structuredClone(this.data);
  }

  async replaceStoreFile(tempPath: string) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        await rename(tempPath, this.filePath);
        return;
      } catch (error) {
        if (attempt === 7) throw error;
        await sleep(35 * (attempt + 1));
      }
    }
  }

  async save() {
    const payload = JSON.stringify(this.data, null, 2);
    const tempPath = `${this.filePath}.${process.pid}.${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`;
    const operation = this.saveChain.then(async () => {
      await writeFile(tempPath, payload, "utf8");
      await this.replaceStoreFile(tempPath);
    });
    this.saveChain = operation.catch(() => undefined);
    await operation;
  }

  listProducts() {
    return this.data.products;
  }

  async upsertProduct(product: Product) {
    const index = this.data.products.findIndex((item) => item.id === product.id);
    if (index >= 0) this.data.products[index] = product;
    else this.data.products.push(product);
    await this.save();
    return product;
  }

  getProduct(id: string) {
    return this.data.products.find((item) => item.id === id);
  }

  listProjects() {
    return this.data.projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  getProject(id: string) {
    return this.data.projects.find((item) => item.id === id);
  }

  async upsertProject(project: Project) {
    const index = this.data.projects.findIndex((item) => item.id === project.id);
    if (index >= 0) this.data.projects[index] = project;
    else this.data.projects.push(project);
    await this.save();
    return project;
  }

  async updateProject(id: string, patch: Partial<Project>) {
    const project = this.getProject(id);
    if (!project) return undefined;
    Object.assign(project, patch, { updatedAt: nowIso() });
    await this.save();
    return project;
  }

  async deleteProject(id: string) {
    const project = this.getProject(id);
    const scriptIds = this.data.scripts
      .filter((script) => script.projectId === id)
      .map((script) => script.id);
    this.data.projects = this.data.projects.filter((item) => item.id !== id);
    this.data.materials = this.data.materials.filter((material) => material.projectId !== id);
    this.data.scripts = this.data.scripts.filter((script) => script.projectId !== id);
    this.data.scenes = this.data.scenes.filter(
      (scene) => scene.projectId !== id && !scriptIds.includes(scene.scriptId)
    );
    this.data.renderJobs = this.data.renderJobs.filter((job) => job.projectId !== id);
    this.data.generatedVideos = this.data.generatedVideos.filter((video) => video.projectId !== id);
    this.data.generationTraces = this.data.generationTraces.filter(
      (trace) => trace.projectId !== id
    );
    this.data.analytics = this.data.analytics.filter((metric) => metric.projectId !== id);

    if (project) {
      const stillUsed = this.data.projects.some((item) => item.productId === project.productId);
      if (!stillUsed)
        this.data.products = this.data.products.filter((item) => item.id !== project.productId);
    }

    await this.save();
  }

  listMaterials(projectId?: string) {
    return this.data.materials.filter((material) => !projectId || material.projectId === projectId);
  }

  getMaterial(id: string) {
    return this.data.materials.find((item) => item.id === id);
  }

  async upsertMaterial(material: Material) {
    const index = this.data.materials.findIndex((item) => item.id === material.id);
    if (index >= 0) this.data.materials[index] = material;
    else this.data.materials.push(material);
    await this.save();
    return material;
  }

  async deleteMaterial(id: string) {
    this.data.materials = this.data.materials.filter((item) => item.id !== id);
    await this.save();
  }

  listScripts(projectId?: string) {
    return this.data.scripts.filter((script) => !projectId || script.projectId === projectId);
  }

  getScript(id: string) {
    return this.data.scripts.find((item) => item.id === id);
  }

  async upsertScript(script: Script) {
    const index = this.data.scripts.findIndex((item) => item.id === script.id);
    if (index >= 0) this.data.scripts[index] = script;
    else this.data.scripts.push(script);

    this.data.scenes = this.data.scenes.filter((scene) => scene.scriptId !== script.id);
    this.data.scenes.push(...script.scenes);
    await this.save();
    return script;
  }

  listScenes(projectId: string) {
    return this.data.scenes
      .filter((scene) => scene.projectId === projectId)
      .sort((a, b) => a.order - b.order);
  }

  getScene(id: string) {
    return this.data.scenes.find((item) => item.id === id);
  }

  async updateScene(id: string, patch: Partial<Scene>) {
    const scene = this.getScene(id);
    if (!scene) return undefined;
    Object.assign(scene, patch, { updatedAt: nowIso() });

    const script = this.getScript(scene.scriptId);
    if (script) {
      script.scenes = this.listScenes(scene.projectId);
      script.updatedAt = nowIso();
    }

    await this.save();
    return scene;
  }

  async reorderScenes(sceneIds: string[]) {
    sceneIds.forEach((sceneId, index) => {
      const scene = this.getScene(sceneId);
      if (scene) scene.order = index + 1;
    });
    await this.save();
    return sceneIds.map((id) => this.getScene(id)).filter(Boolean) as Scene[];
  }

  listJobs() {
    return this.data.renderJobs
      .map(normalizeJob)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  getJob(id: string) {
    const job = this.data.renderJobs.find((item) => item.id === id);
    return job ? normalizeJob(job) : undefined;
  }

  async upsertJob(job: RenderJob) {
    const index = this.data.renderJobs.findIndex((item) => item.id === job.id);
    const normalized = normalizeJob(job);
    if (index >= 0) this.data.renderJobs[index] = normalized;
    else this.data.renderJobs.push(normalized);
    await this.save();
    return normalized;
  }

  async updateJob(id: string, patch: Partial<RenderJob>) {
    const index = this.data.renderJobs.findIndex((item) => item.id === id);
    if (index < 0) return undefined;
    const existing = normalizeJob(this.data.renderJobs[index]!);
    const job = normalizeJob({ ...existing, ...patch, updatedAt: nowIso() });
    this.data.renderJobs[index] = job;
    await this.save();
    return job;
  }

  listVideos(projectId?: string) {
    return this.data.generatedVideos.filter((video) => !projectId || video.projectId === projectId);
  }

  getVideo(id: string) {
    return this.data.generatedVideos.find((item) => item.id === id);
  }

  async addVideo(video: GeneratedVideo) {
    this.data.generatedVideos.push(video);
    await this.save();
    return video;
  }

  async addTraces(traces: GenerationTrace[]) {
    this.data.generationTraces.push(...traces);
    await this.save();
    return traces;
  }

  listTraces(filter?: { jobId?: string; projectId?: string }) {
    return this.data.generationTraces.filter((trace) => {
      if (filter?.jobId && trace.jobId !== filter.jobId) return false;
      if (filter?.projectId && trace.projectId !== filter.projectId) return false;
      return true;
    });
  }

  listAnalytics() {
    return this.data.analytics;
  }

  async setAnalytics(metrics: AnalyticsMetric[]) {
    this.data.analytics = metrics;
    await this.save();
  }
}

export const store: AppStore =
  config.storeDriver === "prisma" ? new PrismaStore() : new JsonStore();
