import { compositeForegroundsOnVideo, renderVideo } from "@advivid/video";
import type { GenerationTrace, Material, RenderPlan } from "@advivid/shared";
import { nowIso } from "@advivid/shared";
import { config } from "../config.js";
import { analyzeMaterial } from "./materialAnalysis.js";
import {
  renderSeedanceVideo,
  type SeedanceReferenceImage,
  seedanceConfigured,
  shouldAttemptSeedance
} from "./seedanceClient.js";
import { store } from "./store.js";

const trace = (
  jobId: string,
  projectId: string | undefined,
  node: string,
  status: "started" | "succeeded" | "failed",
  message: string,
  output?: unknown
): GenerationTrace => ({
  id: crypto.randomUUID(),
  jobId,
  projectId,
  node,
  status,
  message,
  output,
  createdAt: nowIso()
});

const isPrimaryProductMaterial = (material: Material) =>
  (material.type === "product_image" && material.mimeType.startsWith("image")) ||
  (material.type === "product_video" && material.mimeType.startsWith("video"));

const canUseAsForeground = (material: Material | undefined) =>
  Boolean(
    material?.type === "product_image" &&
      material.mimeType.startsWith("image") &&
      material.cutoutUrl &&
      material.cutoutStatus === "ready"
  );

const buildSeedanceReferenceImages = (
  material: Material | undefined
): SeedanceReferenceImage[] => {
  if (!material?.mimeType.startsWith("image")) return [];

  if (material.cutoutUrl && material.cutoutPath && material.cutoutStatus === "ready") {
    return [
      {
        url: material.cutoutUrl,
        localPath: material.cutoutPath,
        mimeType: "image/png",
        source: "cutout",
        materialId: material.id
      }
    ];
  }

  return [
    {
      url: material.url,
      localPath: material.path,
      mimeType: material.mimeType,
      source: "original",
      materialId: material.id
    }
  ];
};

const defaultForegroundPlacement = (index: number, total: number, ratio: RenderPlan["ratio"]) => {
  const vertical = ratio === "9:16";
  const placements = vertical
    ? [
        { x: 0.52, y: 0.58, widthRatio: 0.44 },
        { x: 0.56, y: 0.54, widthRatio: 0.5 },
        { x: 0.34, y: 0.6, widthRatio: 0.4 },
        { x: 0.66, y: 0.6, widthRatio: 0.4 },
        { x: 0.5, y: 0.54, widthRatio: 0.48 }
      ]
    : [
        { x: 0.6, y: 0.55, widthRatio: 0.24 },
        { x: 0.5, y: 0.52, widthRatio: 0.28 },
        { x: 0.72, y: 0.58, widthRatio: 0.22 },
        { x: 0.3, y: 0.58, widthRatio: 0.22 },
        { x: 0.52, y: 0.52, widthRatio: 0.26 }
      ];

  if (index >= total - 1) return placements[4]!;
  return placements[index % 4]!;
};

export function scenesToRenderPlan(input: {
  scenes: Array<{
    id: string;
    order: number;
    durationSec: number;
    visual: string;
    camera?: string;
    subtitle: string;
    voiceover: string;
    materialUrl?: string;
    foreground?: RenderPlan["scenes"][number]["foreground"];
  }>;
  ratio?: "9:16" | "16:9";
  resolution?: "720p" | "1080p";
}): RenderPlan {
  const colors = ["#113A5D", "#2C6E49", "#C2410C", "#6D28D9", "#0F766E", "#A16207"];
  return {
    ratio: input.ratio ?? "9:16",
    resolution: input.resolution ?? "720p",
    totalDurationSec: input.scenes.reduce((sum, scene) => sum + scene.durationSec, 0),
    scenes: input.scenes.map((scene, index) => ({
      sceneId: scene.id,
      order: scene.order,
      durationSec: scene.durationSec,
      visual: scene.visual,
      camera: scene.camera,
      subtitle: scene.subtitle,
      voiceover: scene.voiceover,
      materialUrl: scene.materialUrl,
      foreground: scene.foreground,
      bgColor: colors[index % colors.length]
    })),
    audio: {
      bgm: "clean-pop",
      tts: true,
      bgmVolume: 0.18,
      voiceVolume: 0.55
    },
    subtitleStyle: {
      position: "bottom",
      maxCharsPerLine: input.ratio === "16:9" ? 20 : 14,
      maxLines: 2,
      fontScale: input.ratio === "16:9" ? 0.038 : 0.045,
      boxOpacity: 0.58
    }
  };
}

export async function processRenderJob(jobId: string) {
  await store.reload();
  const job = await store.getJob(jobId);
  if (!job) return;

  const traces: GenerationTrace[] = [
    trace(job.id, job.projectId, "RenderWorker", "started", "开始视频渲染")
  ];

  try {
    if (!job.projectId) throw new Error("Render job is missing projectId.");
    if (!job.scriptId) throw new Error("Render job is missing scriptId.");
    const projectId = job.projectId;
    const scriptId = job.scriptId;

    await store.updateJob(job.id, { status: "running", progress: 8, currentStep: "读取渲染计划" });
    const script = await store.getScript(scriptId);
    if (!script) throw new Error("Script not found for render job.");

    let materials = await store.listMaterials(projectId);
    let primaryProductMaterial = materials.find(isPrimaryProductMaterial);
    if (
      primaryProductMaterial?.type === "product_image" &&
      primaryProductMaterial.cutoutStatus !== "ready"
    ) {
      const analyzed = await analyzeMaterial(primaryProductMaterial);
      await store.upsertMaterial(analyzed);
      materials = await store.listMaterials(projectId);
      primaryProductMaterial = materials.find(isPrimaryProductMaterial);
    }

    const materialMap = new Map(materials.map((material) => [material.id, material]));
    const sceneSourceMaterial = (scene: (typeof script.scenes)[number]) =>
      scene.materialId ? materialMap.get(scene.materialId) : primaryProductMaterial;
    const sceneMaterialUrlMap = new Map(
      script.scenes.map((scene) => [
        scene.id,
        canUseAsForeground(sceneSourceMaterial(scene)) ? undefined : sceneSourceMaterial(scene)?.url
      ])
    );
    const renderScenes = script.scenes.map((scene) => ({
      ...scene,
      materialUrl: canUseAsForeground(sceneSourceMaterial(scene))
        ? undefined
        : sceneSourceMaterial(scene)?.url
    }));
    const baseRenderPlan = job.renderPlan ?? scenesToRenderPlan({ scenes: renderScenes });
    const scriptSceneById = new Map(script.scenes.map((scene, index) => [scene.id, { scene, index }]));
    const renderPlan = {
      ...baseRenderPlan,
      scenes: baseRenderPlan.scenes.map((scene) => {
        const source = scriptSceneById.get(scene.sceneId);
        const material = source ? sceneSourceMaterial(source.scene) : undefined;
        const foreground = scene.foreground ?? (canUseAsForeground(material)
          ? {
              imageUrl: material!.cutoutUrl!,
              materialId: material!.id,
              ...defaultForegroundPlacement(
                source?.index ?? scene.order - 1,
                script.scenes.length,
                baseRenderPlan.ratio
              ),
              opacity: 1,
              shadow: true
            }
          : undefined);

        return {
          ...scene,
          materialUrl: foreground ? undefined : scene.materialUrl ?? sceneMaterialUrlMap.get(scene.sceneId),
          foreground
        };
      })
    };
    const foregroundSceneCount = renderPlan.scenes.filter((scene) => scene.foreground).length;
    await store.updateJob(job.id, { renderPlan, progress: 12, currentStep: "选择渲染引擎" });

    let result:
      | Awaited<ReturnType<typeof renderVideo>>
      | Awaited<ReturnType<typeof renderSeedanceVideo>>
      | undefined;
    let provider: "seedance" | "ffmpeg" = "ffmpeg";
    let seedanceError: string | undefined;
    let seedanceImageReferenceUsed = false;
    let foregroundComposited = false;
    let foregroundCount = 0;
    const seedanceReferenceImages = buildSeedanceReferenceImages(primaryProductMaterial);

    if (foregroundSceneCount > 0) {
      traces.push(
        trace(
          job.id,
          projectId,
          "ProductForegroundPlanner",
          "succeeded",
          "已生成上传商品前景合成计划，Seedance 负责场景，商品由上传素材替换",
          {
            primaryMaterialId: primaryProductMaterial?.id,
            foregroundSceneCount
          }
        )
      );
    }

    if (shouldAttemptSeedance()) {
      traces.push(
        trace(
          job.id,
          projectId,
          "SeedanceRenderer",
          "started",
          foregroundSceneCount > 0
            ? "尝试调用火山 Seedance，并直接传入上传商品参考图"
            : "尝试调用火山 Seedance 生成真实视频",
          {
            provider: config.videoRenderProvider,
            mode: config.seedanceRenderMode,
            configured: seedanceConfigured(),
            imageReferenceRequested: seedanceReferenceImages.length > 0,
            imageReferenceSources: seedanceReferenceImages.map((image) => image.source),
            ratio: renderPlan.ratio,
            resolution: renderPlan.resolution,
            targetDurationSec:
              config.seedanceRenderMode === "segments"
                ? config.seedanceTotalDurationSec
                : config.seedanceTargetDurationSec
          }
        )
      );

      try {
        const seedanceResult = await renderSeedanceVideo({
          jobId: job.id,
          renderPlan,
          referenceImages: seedanceReferenceImages,
          outputDir: config.renderDir,
          onProgress: async (progress, step) => {
            await store.updateJob(job.id, { progress, currentStep: step });
          }
        });
        result = seedanceResult;
        provider = "seedance";
        seedanceImageReferenceUsed = Boolean(seedanceResult.imageReference?.used);
        traces.push(
          trace(job.id, projectId, "SeedanceRenderer", "succeeded", "Seedance 真实视频生成完成", {
            taskId: seedanceResult.taskId,
            taskIds: seedanceResult.taskIds,
            segmentCount: seedanceResult.segmentCount,
            imageReference: seedanceResult.imageReference,
            url: seedanceResult.urlPath,
            metadataPath: seedanceResult.metadataPath
          })
        );
      } catch (error) {
        seedanceError = error instanceof Error ? error.message : String(error);
        traces.push(
          trace(
            job.id,
            projectId,
            "SeedanceRenderer",
            "failed",
            "Seedance 生成失败，回退本地 FFmpeg",
            {
              error: seedanceError
            }
          )
        );
        await store.updateJob(job.id, { progress: 14, currentStep: "Seedance 失败，回退 FFmpeg" });
      }
    } else {
      traces.push(
        trace(
          job.id,
          projectId,
          "SeedanceRenderer",
          "succeeded",
          "跳过 Seedance，使用本地 FFmpeg 渲染",
          {
            provider: config.videoRenderProvider,
            useMockAi: config.useMockAi,
            configured: seedanceConfigured()
          }
        )
      );
    }

    if (!result) {
      await store.updateJob(job.id, { progress: 16, currentStep: "准备 FFmpeg 兜底渲染" });
      result = await renderVideo({
        jobId: job.id,
        projectId,
        renderPlan,
        outputDir: config.renderDir,
        assetRootDir: config.rootDir,
        onProgress: async (progress, step) => {
          await store.updateJob(job.id, { progress, currentStep: step });
        }
      });
    }

    const shouldCompositeForeground =
      !result.usedFallback &&
      foregroundSceneCount > 0 &&
      config.seedancePostCompositeMode !== "off" &&
      (config.seedancePostCompositeMode === "always" ||
        provider !== "seedance" ||
        !seedanceImageReferenceUsed);

    if (!shouldCompositeForeground && foregroundSceneCount > 0 && seedanceImageReferenceUsed) {
      traces.push(
        trace(
          job.id,
          projectId,
          "ProductForegroundCompositor",
          "succeeded",
          "Seedance 已接受上传商品参考图，跳过后期贴图以保留生成画面自然度",
          {
            mode: config.seedancePostCompositeMode,
            imageReferenceUsed: true
          }
        )
      );
    }

    if (shouldCompositeForeground) {
      try {
        const composited = await compositeForegroundsOnVideo({
          jobId: job.id,
          inputVideoPath: result.path,
          renderPlan,
          outputDir: config.renderDir,
          assetRootDir: config.rootDir,
          durationSec: result.durationSec,
          onProgress: async (progress, step) => {
            await store.updateJob(job.id, { progress, currentStep: step });
          }
        });

        if (composited) {
          result = {
            ...result,
            path: composited.path,
            urlPath: composited.urlPath
          };
          foregroundComposited = true;
          foregroundCount = composited.foregroundCount;
          traces.push(
            trace(job.id, projectId, "ProductForegroundCompositor", "succeeded", "上传商品前景合成完成", {
              foregroundCount,
              url: composited.urlPath
            })
          );
        }
      } catch (error) {
        traces.push(
          trace(
            job.id,
            projectId,
            "ProductForegroundCompositor",
            "failed",
            "上传商品前景合成失败，保留基础生成视频",
            {
              error: error instanceof Error ? error.message : String(error)
            }
          )
        );
      }
    }

    const video = await store.addVideo({
      id: crypto.randomUUID(),
      projectId,
      jobId: job.id,
      url: result.urlPath,
      path: result.path,
      ratio: result.ratio,
      resolution: result.resolution,
      durationSec: result.durationSec,
      version: (await store.listVideos(projectId)).length + 1,
      createdAt: nowIso()
    });

    await store.updateJob(job.id, {
      status: "succeeded",
      progress: 100,
      currentStep:
        foregroundComposited
          ? "Seedance 视频与上传商品前景合成完成"
          : seedanceImageReferenceUsed
            ? "Seedance 图片参考视频生成完成"
          : provider === "seedance"
          ? "Seedance 视频生成完成"
          : result.usedFallback
            ? "已生成兜底渲染视频"
            : "视频渲染完成",
      outputVideoId: video.id
    });
    await store.updateProject(projectId, { status: "ready", coverUrl: video.url });
    traces.push(
      trace(job.id, projectId, "RenderWorker", "succeeded", "渲染任务完成", {
        videoId: video.id,
        url: video.url,
        provider,
        seedanceImageReferenceUsed,
        foregroundComposited,
        foregroundCount,
        usedFallback: result.usedFallback,
        seedanceError
      })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await store.updateJob(job.id, {
      status: "failed",
      progress: 100,
      currentStep: "渲染失败",
      error: message
    });
    if (job.projectId) await store.updateProject(job.projectId, { status: "failed" });
    traces.push(trace(job.id, job.projectId, "RenderWorker", "failed", message));
  } finally {
    await store.addTraces(traces);
  }
}
