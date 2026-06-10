import { z } from "zod";

export const materialTypeSchema = z.enum([
  "product_image",
  "product_video",
  "reference_image",
  "reference_video",
  "generated_video",
  "audio"
]);

export const jobStatusSchema = z.enum(["queued", "running", "succeeded", "failed", "cancelled"]);
export const taskTypeSchema = z.enum([
  "video_render",
  "scene_preview",
  "script_generation",
  "material_analysis"
]);
export const videoRatioSchema = z.enum(["9:16", "16:9"]);

export const productSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  sellingPoints: z.array(z.string()).default([]),
  targetAudience: z.string().default(""),
  scenario: z.string().default(""),
  style: z.string().default("场景种草"),
  creativeBrief: z.string().default(""),
  language: z.string().default("zh-CN"),
  durationSec: z.number().min(8).max(30).default(24),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const createProductSchema = productSchema
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    sellingPoints: z.array(z.string()).default([])
  });

export const materialSliceSchema = z.object({
  id: z.string(),
  materialId: z.string(),
  index: z.number(),
  startSec: z.number().default(0),
  endSec: z.number().default(0),
  thumbnailUrl: z.string().optional(),
  summary: z.string(),
  tags: z.array(z.string()).default([]),
  embedding: z.array(z.number()).default([]),
  createdAt: z.string()
});

export const materialSchema = z.object({
  id: z.string(),
  projectId: z.string().optional(),
  type: materialTypeSchema,
  name: z.string(),
  mimeType: z.string(),
  size: z.number(),
  url: z.string(),
  path: z.string(),
  cutoutUrl: z.string().optional(),
  cutoutPath: z.string().optional(),
  cutoutStatus: z.enum(["pending", "ready", "failed", "not_applicable"]).optional(),
  summary: z.string().default(""),
  tags: z.array(z.string()).default([]),
  embedding: z.array(z.number()).default([]),
  slices: z.array(materialSliceSchema).default([]),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const creativeTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  strategy: z.string(),
  factors: z.array(z.string()),
  source: z.string().default("mock")
});

export const sceneSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  scriptId: z.string(),
  order: z.number(),
  title: z.string(),
  visual: z.string(),
  camera: z.string(),
  voiceover: z.string(),
  subtitle: z.string(),
  bgm: z.string(),
  durationSec: z.number().min(1).max(8),
  materialId: z.string().optional(),
  materialSliceId: z.string().optional(),
  generationMode: z
    .enum(["material_mix", "text_to_video", "image_to_video", "mock"])
    .default("mock"),
  tags: z.array(z.string()).default([]),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const scriptSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  productId: z.string(),
  title: z.string(),
  narrative: z.string(),
  hook: z.string(),
  style: z.string(),
  strategy: z.string(),
  constraints: z.array(z.string()),
  scenes: z.array(sceneSchema),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  productId: z.string(),
  scriptId: z.string().optional(),
  status: z.enum(["draft", "scripted", "rendering", "ready", "failed"]).default("draft"),
  coverUrl: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const renderPlanSchema = z.object({
  ratio: videoRatioSchema.default("9:16"),
  resolution: z.enum(["720p", "1080p"]).default("720p"),
  totalDurationSec: z.number(),
  scenes: z.array(
    z.object({
      sceneId: z.string(),
      order: z.number(),
      durationSec: z.number(),
      visual: z.string(),
      camera: z.string().optional(),
      subtitle: z.string(),
      voiceover: z.string(),
      materialUrl: z.string().optional(),
      foreground: z
        .object({
          imageUrl: z.string(),
          materialId: z.string().optional(),
          widthRatio: z.number().min(0.12).max(0.72).default(0.38),
          x: z.number().min(0).max(1).default(0.5),
          y: z.number().min(0).max(1).default(0.58),
          opacity: z.number().min(0).max(1).default(1),
          shadow: z.boolean().default(true)
        })
        .optional(),
      bgColor: z.string().optional()
    })
  ),
  audio: z.object({
    bgm: z.string(),
    tts: z.boolean(),
    bgmVolume: z.number().min(0).max(1).default(0.18),
    voiceVolume: z.number().min(0).max(1).default(0.55)
  }),
  subtitleStyle: z
    .object({
      position: z.enum(["bottom", "middle"]).default("bottom"),
      maxCharsPerLine: z.number().min(8).max(24).default(14),
      maxLines: z.number().min(1).max(3).default(2),
      fontScale: z.number().min(0.02).max(0.08).default(0.045),
      boxOpacity: z.number().min(0).max(1).default(0.58)
    })
    .default({})
});

export const generationTraceSchema = z.object({
  id: z.string(),
  jobId: z.string().optional(),
  projectId: z.string().optional(),
  node: z.string(),
  status: z.enum(["started", "succeeded", "failed"]),
  message: z.string(),
  input: z.unknown().optional(),
  output: z.unknown().optional(),
  createdAt: z.string()
});

export const renderJobSchema = z.object({
  id: z.string(),
  taskType: taskTypeSchema.default("video_render"),
  projectId: z.string().optional(),
  productId: z.string().optional(),
  scriptId: z.string().optional(),
  materialId: z.string().optional(),
  status: jobStatusSchema,
  progress: z.number().min(0).max(100),
  currentStep: z.string(),
  error: z.string().optional(),
  renderPlan: renderPlanSchema.optional(),
  outputVideoId: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const generatedVideoSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  jobId: z.string(),
  url: z.string(),
  path: z.string(),
  ratio: videoRatioSchema,
  resolution: z.enum(["720p", "1080p"]),
  durationSec: z.number(),
  version: z.number(),
  createdAt: z.string()
});

export const analyticsMetricSchema = z.object({
  id: z.string(),
  projectId: z.string().optional(),
  videoId: z.string().optional(),
  label: z.string(),
  hookType: z.string(),
  styleFactor: z.string(),
  views: z.number(),
  ctr: z.number(),
  conversionRate: z.number(),
  createdAt: z.string()
});

export type MaterialType = z.infer<typeof materialTypeSchema>;
export type JobStatus = z.infer<typeof jobStatusSchema>;
export type TaskType = z.infer<typeof taskTypeSchema>;
export type VideoRatio = z.infer<typeof videoRatioSchema>;
export type Product = z.infer<typeof productSchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type Material = z.infer<typeof materialSchema>;
export type MaterialSlice = z.infer<typeof materialSliceSchema>;
export type CreativeTemplate = z.infer<typeof creativeTemplateSchema>;
export type Scene = z.infer<typeof sceneSchema>;
export type Script = z.infer<typeof scriptSchema>;
export type Project = z.infer<typeof projectSchema>;
export type RenderPlan = z.infer<typeof renderPlanSchema>;
export type GenerationTrace = z.infer<typeof generationTraceSchema>;
export type RenderJob = z.infer<typeof renderJobSchema>;
export type GeneratedVideo = z.infer<typeof generatedVideoSchema>;
export type AnalyticsMetric = z.infer<typeof analyticsMetricSchema>;

export const nowIso = () => new Date().toISOString();
