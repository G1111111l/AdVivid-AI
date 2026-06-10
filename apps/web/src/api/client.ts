import type {
  AnalyticsMetric,
  GeneratedVideo,
  GenerationTrace,
  Material,
  MaterialSlice,
  Product,
  Project,
  RenderJob,
  Scene,
  Script
} from "@advivid/shared";

const configuredApiBase =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.PUBLIC_API_BASE_URL ||
  "http://localhost:4000";

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function joinUrl(base: string, path: string) {
  const normalizedBase = trimTrailingSlash(base);
  if (!normalizedBase) return path;

  if (normalizedBase === "/api" && path.startsWith("/api/")) {
    return `/api${path.slice(4)}`;
  }

  if (normalizedBase.endsWith("/api") && path.startsWith("/api/")) {
    return `${normalizedBase}${path.slice(4)}`;
  }

  return `${normalizedBase}${path.startsWith("/") ? path : `/${path}`}`;
}

function assetBaseFromApiBase(base: string) {
  const normalizedBase = trimTrailingSlash(base);
  if (!normalizedBase || normalizedBase === "/api") return "";
  return normalizedBase.endsWith("/api") ? normalizedBase.slice(0, -4) : normalizedBase;
}

function apiBaseCandidates() {
  const configured = trimTrailingSlash(configuredApiBase);
  const candidates = [configured];

  if (typeof window !== "undefined") {
    const { protocol, hostname } = window.location;
    if (hostname && protocol !== "https:") candidates.push(`http://${hostname}:4000`);
    candidates.push("http://127.0.0.1:4000", "http://localhost:4000");
  }

  return unique(candidates.map(trimTrailingSlash));
}

export interface ProjectDetail {
  project: Project;
  product?: Product;
  materials: Material[];
  script?: Script;
  scenes: Scene[];
  jobs: RenderJob[];
  videos: GeneratedVideo[];
  traces: GenerationTrace[];
}

export interface MaterialRecommendation {
  material: Material;
  slice?: MaterialSlice;
  score: number;
  reasons: string[];
}

export interface QueueResult {
  driver: "local" | "bullmq";
  queued: boolean;
  queueName: string;
}

export interface MaterialUploadResponse {
  material: Material;
  job: RenderJob;
  queue: QueueResult;
}

export interface ScriptGenerationResponse {
  project: Project;
  product: Product;
  job: RenderJob;
  queue: QueueResult;
}

export interface ModelStatus {
  ok: boolean;
  agentRuntime: string;
  useMockAi: boolean;
  textModelConfigured: boolean;
  videoModelConfigured: boolean;
  videoRenderProvider: "auto" | "seedance" | "ffmpeg";
  seedanceRenderMode: "single" | "segments";
  seedanceTotalDurationSec: number;
  willAttemptSeedance: boolean;
  queueDriver: "local" | "bullmq";
  storeDriver: "json" | "prisma";
}

let workingApiBase = trimTrailingSlash(configuredApiBase);

function enrichNetworkError(path: string, attempts: string[]) {
  return new Error(
    [
      "无法连接后端 API。请确认 API 服务正在运行，并且浏览器能访问 API 地址。",
      `请求路径：${path}`,
      `已尝试：${attempts.join("，")}`,
      "本地启动命令：npm run dev"
    ].join("\n")
  );
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const bases = unique([workingApiBase, ...apiBaseCandidates()]);
  const attempted: string[] = [];
  let lastNetworkError: unknown;
  const hasBody = init?.body !== undefined && init.body !== null;
  const headers =
    init?.body instanceof FormData
      ? init.headers
      : hasBody
        ? { "Content-Type": "application/json", ...init?.headers }
        : init?.headers;

  for (const base of bases) {
    const url = joinUrl(base, path);
    attempted.push(url);
    let response: Response;

    try {
      response = await fetch(url, {
        ...init,
        headers
      });
    } catch (error) {
      lastNetworkError = error;
      continue;
    }

    workingApiBase = base;

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(error.message ?? response.statusText);
    }

    return response.json() as Promise<T>;
  }

  throw enrichNetworkError(path, attempted.length > 0 ? attempted : [String(lastNetworkError)]);
}

export const api = {
  get apiBase() {
    return workingApiBase;
  },
  url: (path: string) => joinUrl(workingApiBase, path),
  assetUrl: (url?: string) => {
    if (!url) return "";
    if (url.startsWith("http")) return url;
    return `${assetBaseFromApiBase(workingApiBase)}${url}`;
  },
  health: () => request<{ ok: boolean }>("/api/health"),
  modelStatus: () => request<ModelStatus>("/api/models/status"),
  listProjects: () =>
    request<Array<Project & { product?: Product; videos: GeneratedVideo[] }>>("/api/projects"),
  getProject: (id: string) => request<ProjectDetail>(`/api/projects/${id}`),
  createProject: (input: Partial<Product> & { name?: string }) =>
    request<{ project: Project; product: Product }>("/api/projects", {
      method: "POST",
      body: JSON.stringify(input)
    }),
  updateProduct: (id: string, input: Partial<Product>) =>
    request<Product>(`/api/products/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input)
    }),
  deleteProject: (id: string) =>
    request<{ ok: boolean }>(`/api/projects/${id}`, { method: "DELETE" }),
  uploadMaterial: (file: File, input: { type: string; projectId?: string }) => {
    const form = new FormData();
    form.append("file", file);
    const params = new URLSearchParams({ type: input.type });
    if (input.projectId) params.set("projectId", input.projectId);
    return request<MaterialUploadResponse>(`/api/materials?${params.toString()}`, {
      method: "POST",
      body: form
    });
  },
  searchMaterials: (projectId: string | undefined, q: string) => {
    const params = new URLSearchParams({ q });
    if (projectId) params.set("projectId", projectId);
    return request<Material[]>(`/api/materials/search?${params.toString()}`);
  },
  analyzeMaterial: (id: string) =>
    request<RenderJob>(`/api/materials/${id}/analyze`, { method: "POST" }),
  deleteMaterial: (id: string) =>
    request<{ ok: boolean }>(`/api/materials/${id}`, { method: "DELETE" }),
  recommendSceneMaterials: (sceneId: string, limit = 6) =>
    request<MaterialRecommendation[]>(
      `/api/scenes/${sceneId}/material-recommendations?limit=${limit}`
    ),
  generateScript: (input: { projectId: string; productId?: string }) =>
    request<ScriptGenerationResponse>("/api/scripts/generate", {
      method: "POST",
      body: JSON.stringify(input)
    }),
  updateScene: (id: string, patch: Partial<Scene>) =>
    request<Scene>(`/api/scenes/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch)
    }),
  regenerateScene: (id: string) =>
    request<Scene>(`/api/scenes/${id}/regenerate`, { method: "POST" }),
  renderScenePreview: (id: string) =>
    request<RenderJob>(`/api/scenes/${id}/render-preview`, { method: "POST" }),
  reorderScenes: (sceneIds: string[]) =>
    request<Scene[]>("/api/scenes/reorder", {
      method: "POST",
      body: JSON.stringify({ sceneIds })
    }),
  renderVideo: (input: {
    projectId: string;
    scriptId?: string;
    ratio: "9:16" | "16:9";
    resolution: "720p" | "1080p";
  }) =>
    request<RenderJob>("/api/videos/render", {
      method: "POST",
      body: JSON.stringify(input)
    }),
  getJob: (id: string) =>
    request<RenderJob & { video?: GeneratedVideo; traces: GenerationTrace[] }>(`/api/jobs/${id}`),
  retryJob: (id: string) => request<RenderJob>(`/api/jobs/${id}/retry`, { method: "POST" }),
  analytics: () => request<AnalyticsMetric[]>("/api/analytics/mock")
};
