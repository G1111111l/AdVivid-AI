import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import ffmpegStatic from "ffmpeg-static";
import type { RenderPlan, VideoRatio } from "@advivid/shared";
import { config } from "../config.js";

interface SeedanceTaskPayload {
  [key: string]: unknown;
}

export interface SeedanceRenderResult {
  path: string;
  urlPath: string;
  durationSec: number;
  ratio: VideoRatio;
  resolution: "720p" | "1080p";
  usedFallback: false;
  taskId: string;
  taskIds?: string[];
  segmentCount?: number;
  metadataPath: string;
  imageReference?: {
    requested: boolean;
    used: boolean;
    errors: string[];
    images: Array<{
      source: string;
      materialId?: string;
      mode: string;
      url: string;
    }>;
  };
}

interface RenderSeedanceInput {
  jobId: string;
  renderPlan: RenderPlan;
  outputDir: string;
  referenceImages?: SeedanceReferenceImage[];
  onProgress?: (progress: number, step: string) => Promise<void> | void;
}

export interface SeedanceReferenceImage {
  url: string;
  localPath?: string;
  mimeType?: string;
  source: "cutout" | "original";
  materialId?: string;
}

interface ProviderImageInput extends SeedanceReferenceImage {
  providerUrl: string;
}

interface SeedanceSegment {
  index: number;
  scenes: RenderPlan["scenes"];
  sourceDurationSec: number;
  durationSec: number;
}

const terminalStatuses = new Set(["succeeded", "failed", "cancelled", "expired"]);

function safeJobId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "");
}

function clampClipDuration(value: number) {
  if (!Number.isFinite(value)) return 5;
  return Math.max(2, Math.min(10, Math.round(value)));
}

function clampFullDuration(value: number) {
  if (!Number.isFinite(value)) return 18;
  return Math.max(15, Math.min(20, Math.round(value)));
}

function shortText(value: string, max = 90) {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function sceneSummary(scene: RenderPlan["scenes"][number], max = 150) {
  return shortText(
    [scene.visual, scene.camera, scene.subtitle, scene.voiceover].filter(Boolean).join(" "),
    max
  );
}

function foregroundBackgroundInstruction() {
  return [
    "IMPORTANT COMPOSITING SETUP:",
    "Use the provided reference image as the exact hero product identity for shape, color, package layout, and visible design.",
    "The first reference image is the uploaded product cutout when available.",
    "Generate natural hands, table, bag, desk, gym, street, office, and lifestyle context around that same product.",
    "Do not invent a different product, package label, logo, bottle, can, box, or cup design.",
    "Keep the hero product visually consistent with the reference image in every beat."
  ].join(" ");
}

function buildGlobalStoryboardContext(renderPlan: RenderPlan) {
  return renderPlan.scenes
    .slice(0, 8)
    .map((scene) => `${scene.order}. ${sceneSummary(scene, 110)}`)
    .join(" | ")
    .slice(0, 900);
}

function buildTransitionContext(renderPlan: RenderPlan, scenes: RenderPlan["scenes"]) {
  if (scenes.length === 0) return "No adjacent scene context.";
  const firstOrder = Math.min(...scenes.map((scene) => scene.order));
  const lastOrder = Math.max(...scenes.map((scene) => scene.order));
  const previousScene = renderPlan.scenes
    .filter((scene) => scene.order < firstOrder)
    .sort((a, b) => b.order - a.order)[0];
  const nextScene = renderPlan.scenes
    .filter((scene) => scene.order > lastOrder)
    .sort((a, b) => a.order - b.order)[0];

  return [
    previousScene
      ? `Previous beat: ${previousScene.order}. ${sceneSummary(previousScene, 90)}`
      : "Previous beat: opening of the ad.",
    nextScene
      ? `Next beat: ${nextScene.order}. ${sceneSummary(nextScene, 90)}`
      : "Next beat: final ending of the ad."
  ].join(" ");
}

function sumSceneDuration(scenes: RenderPlan["scenes"]) {
  return scenes.reduce((sum, scene) => sum + Math.max(1, scene.durationSec), 0);
}

function supportedSeedanceClipDuration() {
  return 5;
}

function splitScenesIntoSegments(renderPlan: RenderPlan) {
  const scenes = renderPlan.scenes;
  const targetDurationSec = clampFullDuration(config.seedanceTotalDurationSec);
  const maxSegments = Math.max(1, Math.min(scenes.length, config.seedanceMaxSegments));
  const segmentDuration = supportedSeedanceClipDuration();
  const segmentCount = Math.max(
    1,
    Math.min(maxSegments, Math.ceil(targetDurationSec / segmentDuration))
  );

  const buckets: SeedanceSegment[] = Array.from({ length: segmentCount }, (_, index) => ({
    index,
    scenes: [],
    sourceDurationSec: 0,
    durationSec: segmentDuration
  }));

  const totalSourceDuration = Math.max(1, sumSceneDuration(scenes));
  let elapsed = 0;
  for (const scene of scenes) {
    const sceneDuration = Math.max(1, scene.durationSec);
    const midpoint = elapsed + sceneDuration / 2;
    const bucketIndex = Math.min(
      segmentCount - 1,
      Math.floor((midpoint / totalSourceDuration) * segmentCount)
    );
    buckets[bucketIndex]!.scenes.push(scene);
    buckets[bucketIndex]!.sourceDurationSec += sceneDuration;
    elapsed += sceneDuration;
  }

  const filledBuckets = buckets.filter((bucket) => bucket.scenes.length > 0);
  return filledBuckets.map((segment, index) => ({
    ...segment,
    index,
    durationSec: segmentDuration
  }));
}

function buildPrompt(
  renderPlan: RenderPlan,
  options?: {
    scenes?: RenderPlan["scenes"];
    durationSec?: number;
    segmentIndex?: number;
    segmentCount?: number;
  }
) {
  const ratioText = renderPlan.ratio === "9:16" ? "vertical 9:16" : "horizontal 16:9";
  const duration = clampClipDuration(options?.durationSec ?? config.seedanceTargetDurationSec);
  const scenes = options?.scenes ?? renderPlan.scenes.slice(0, 6);
  const usesUploadedProductForeground = renderPlan.scenes.some((scene) => scene.foreground);
  const fullDuration = options?.segmentCount ? options.segmentCount * duration : duration;
  const sourceDuration = sumSceneDuration(scenes);
  const globalContext = buildGlobalStoryboardContext(renderPlan);
  const transitionContext = buildTransitionContext(renderPlan, scenes);
  const segmentText =
    options?.segmentIndex !== undefined && options.segmentCount !== undefined
      ? `This is segment ${options.segmentIndex + 1} of ${options.segmentCount} in a ${fullDuration}-second e-commerce video.`
      : "This is a complete short e-commerce product commercial.";
  const sceneText = scenes
    .slice(0, 6)
    .map((scene) => {
      const visual = sceneSummary(scene);
      const camera = shortText(scene.camera ?? "", 80);
      const subtitle = shortText(scene.subtitle || scene.voiceover, 60);
      return [
        `${scene.order}. Source beat duration ${scene.durationSec}s.`,
        usesUploadedProductForeground
          ? `Reference-image visual: ${visual}. The hero product must match the uploaded reference image; avoid changing its shape, color, package layout, or category.`
          : `Visual: ${visual}.`,
        `Camera: ${camera}.`,
        `Key message: ${subtitle}.`
      ].join(" ");
    })
    .join("\n");

  return [
    `Create a ${duration}-second ${ratioText} e-commerce product commercial video.`,
    segmentText,
    `Compress or adapt ${sourceDuration} seconds of storyboard beats into this ${duration}-second generated clip while preserving beat order and cause-effect continuity.`,
    "Use realistic product-ad cinematography, clean lighting, smooth camera movement, close-up product details, and natural lifestyle context.",
    usesUploadedProductForeground
      ? foregroundBackgroundInstruction()
      : "Keep product identity and visual style consistent with the surrounding storyboard segments.",
    `Global storyboard context for the whole ad: ${globalContext}`,
    `Continuity context for editing: ${transitionContext}`,
    "This segment is one connected story beat, not a separate standalone commercial. Preserve visual cause and effect from the previous beat and set up the next beat.",
    "If adjacent beats use the same character, product, table, bag, desk, or setting, keep them visually consistent instead of restarting the scene.",
    usesUploadedProductForeground
      ? "Use the uploaded reference product as the main object. Hands and scene motion may interact with it, but the product identity must stay the same as the image."
      : "The hero product must remain the same product throughout the full ad. Do not replace it with unrelated items, different product categories, or random props.",
    "Start and end this segment with stable camera motion so it can be smoothly edited with adjacent segments.",
    "Avoid readable text overlays, watermarks, exaggerated claims, or random unrelated products.",
    "Storyboard:",
    sceneText,
    `--ratio ${renderPlan.ratio} --resolution ${renderPlan.resolution} --duration ${duration}`
  ].join("\n");
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function toPublicAssetUrl(url: string) {
  if (url.startsWith("http")) return url;
  return `${trimTrailingSlash(config.publicWebOrigin)}${url.startsWith("/") ? url : `/${url}`}`;
}

function resolveAssetPath(url: string, localPath?: string) {
  if (localPath && existsSync(localPath)) return localPath;
  if (url.startsWith("http")) return undefined;

  const normalized = url.split("?")[0]?.replace(/\\/g, "/") ?? "";
  if (path.isAbsolute(normalized) && existsSync(normalized)) return normalized;

  const candidate = path.resolve(config.rootDir, normalized.replace(/^\/+/, ""));
  return existsSync(candidate) ? candidate : undefined;
}

function mimeTypeForImage(input: SeedanceReferenceImage, filePath?: string) {
  if (input.mimeType?.startsWith("image/")) return input.mimeType;
  const extension = path.extname(filePath ?? input.url).toLowerCase();
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  return "image/png";
}

async function toProviderImageInput(input: SeedanceReferenceImage): Promise<ProviderImageInput> {
  if (config.seedanceImageInputMode === "url") {
    return {
      ...input,
      providerUrl: toPublicAssetUrl(input.url)
    };
  }

  const filePath = resolveAssetPath(input.url, input.localPath);
  if (!filePath) {
    return {
      ...input,
      providerUrl: toPublicAssetUrl(input.url)
    };
  }

  const buffer = await readFile(filePath);
  return {
    ...input,
    providerUrl: `data:${mimeTypeForImage(input, filePath)};base64,${buffer.toString("base64")}`
  };
}

async function prepareProviderImages(referenceImages: SeedanceReferenceImage[] | undefined) {
  const uniqueImages = new Map<string, SeedanceReferenceImage>();
  for (const image of referenceImages ?? []) {
    const key = image.localPath ?? image.url;
    if (!key) continue;
    uniqueImages.set(key, image);
  }

  return Promise.all([...uniqueImages.values()].slice(0, 1).map(toProviderImageInput));
}

function summarizeProviderImages(images: ProviderImageInput[]) {
  return images.map((image) => ({
    source: image.source,
    materialId: image.materialId,
    mode: image.providerUrl.startsWith("data:") ? "data_url" : "url",
    url: image.providerUrl.startsWith("data:") ? "[data-url]" : image.providerUrl
  }));
}

function extractTaskId(payload: SeedanceTaskPayload): string {
  for (const key of ["id", "task_id", "taskId"]) {
    const value = payload[key];
    if (typeof value === "string" && value) return value;
  }

  const data = payload.data;
  if (data && typeof data === "object") return extractTaskId(data as SeedanceTaskPayload);
  throw new Error("Seedance task id not found in create response.");
}

function extractStatus(payload: SeedanceTaskPayload): string {
  const status = payload.status;
  if (typeof status === "string" && status) return status;
  const data = payload.data;
  if (data && typeof data === "object") return extractStatus(data as SeedanceTaskPayload);
  return "unknown";
}

function extractVideoUrl(payload: SeedanceTaskPayload): string | undefined {
  const content = payload.content;
  if (content && typeof content === "object") {
    const contentPayload = content as SeedanceTaskPayload;
    for (const key of ["video_url", "url"]) {
      const value = contentPayload[key];
      if (typeof value === "string" && value) return value;
    }
    const video = contentPayload.video;
    if (video && typeof video === "object") {
      const url = (video as SeedanceTaskPayload).url;
      if (typeof url === "string" && url) return url;
    }
  }

  const data = payload.data;
  if (data && typeof data === "object") return extractVideoUrl(data as SeedanceTaskPayload);

  for (const key of ["video_url", "url"]) {
    const value = payload[key];
    if (typeof value === "string" && value.startsWith("http")) return value;
  }

  return undefined;
}

async function requestJson(url: string, init: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.ark.apiKey}`,
      "Content-Type": "application/json",
      ...init.headers
    }
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Seedance HTTP ${response.status}: ${body.slice(0, 500)}`);
  }

  return (await response.json()) as SeedanceTaskPayload;
}

function contentForTask(prompt: string, images: ProviderImageInput[]) {
  return [
    {
      type: "text",
      text: prompt
    },
    ...images.map((image) => ({
      type: "image_url",
      image_url: {
        url: image.providerUrl
      }
    }))
  ];
}

async function createTask(prompt: string, images: ProviderImageInput[] = []) {
  const url = `${config.ark.baseUrl.replace(/\/$/, "")}/contents/generations/tasks`;

  try {
    const payload = await requestJson(url, {
      method: "POST",
      body: JSON.stringify({
        model: config.ark.videoEndpoint,
        content: contentForTask(prompt, images)
      })
    });

    return {
      payload,
      usedImageReference: images.length > 0,
      imageReferenceError: undefined
    };
  } catch (error) {
    if (images.length === 0) throw error;

    const imageReferenceError = error instanceof Error ? error.message : String(error);
    const payload = await requestJson(url, {
      method: "POST",
      body: JSON.stringify({
        model: config.ark.videoEndpoint,
        content: contentForTask(prompt, [])
      })
    });

    return {
      payload,
      usedImageReference: false,
      imageReferenceError
    };
  }
}

async function getTask(taskId: string) {
  return requestJson(
    `${config.ark.baseUrl.replace(/\/$/, "")}/contents/generations/tasks/${taskId}`,
    {
      method: "GET"
    }
  );
}

async function downloadVideo(url: string, outputPath: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Seedance video download failed: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0) throw new Error("Seedance video download returned an empty file.");
  await writeFile(outputPath, bytes);
}

function concatFileLine(filePath: string) {
  return `file '${filePath.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`;
}

function ffmpegBinary() {
  return ffmpegStatic || process.env.FFMPEG_BIN || process.env.FFMPEG_PATH || "ffmpeg";
}

function runFfmpeg(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    execFile(ffmpegBinary(), args, { windowsHide: true }, (error, _stdout, stderr) => {
      if (!error) return resolve();
      reject(new Error(`FFmpeg concat failed: ${stderr.slice(0, 1000) || error.message}`));
    });
  });
}

function formatSeconds(value: number) {
  return Number(value.toFixed(3)).toString();
}

function buildCrossfadeFilter(inputCount: number, clipDurationSec: number, transitionSec: number) {
  const parts: string[] = [];
  for (let index = 0; index < inputCount; index += 1) {
    parts.push(`[${index}:v]setpts=PTS-STARTPTS,format=yuv420p[v${index}]`);
    parts.push(`[${index}:a]asetpts=PTS-STARTPTS[a${index}]`);
  }

  let currentVideo = "v0";
  let currentAudio = "a0";
  for (let index = 1; index < inputCount; index += 1) {
    const nextVideo = index === inputCount - 1 ? "vout" : `vx${index}`;
    const nextAudio = index === inputCount - 1 ? "aout" : `ax${index}`;
    const offset = index * (clipDurationSec - transitionSec);
    parts.push(
      `[${currentVideo}][v${index}]xfade=transition=fade:duration=${formatSeconds(
        transitionSec
      )}:offset=${formatSeconds(offset)}[${nextVideo}]`
    );
    parts.push(
      `[${currentAudio}][a${index}]acrossfade=d=${formatSeconds(
        transitionSec
      )}:c1=tri:c2=tri[${nextAudio}]`
    );
    currentVideo = nextVideo;
    currentAudio = nextAudio;
  }

  return parts.join(";");
}

async function concatenateWithCrossfade(input: {
  clipPaths: string[];
  durationSec: number;
  transitionSec: number;
  outputPath: string;
}) {
  const args = [
    "-y",
    ...input.clipPaths.flatMap((clipPath) => ["-i", clipPath]),
    "-filter_complex",
    buildCrossfadeFilter(input.clipPaths.length, input.durationSec, input.transitionSec),
    "-map",
    "[vout]",
    "-map",
    "[aout]",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-movflags",
    "+faststart",
    input.outputPath
  ];
  await runFfmpeg(args);
}

async function addSoftEdges(input: {
  clipPath: string;
  outputPath: string;
  durationSec: number;
  fadeSec: number;
}) {
  const fadeSec = Math.min(input.fadeSec, Math.max(0.1, input.durationSec / 4));
  const fadeOutStart = Math.max(0, input.durationSec - fadeSec);
  const videoFade = `fade=t=in:st=0:d=${fadeSec},fade=t=out:st=${fadeOutStart}:d=${fadeSec}`;
  const audioFade = `afade=t=in:st=0:d=${fadeSec},afade=t=out:st=${fadeOutStart}:d=${fadeSec}`;

  try {
    await runFfmpeg([
      "-y",
      "-i",
      input.clipPath,
      "-vf",
      videoFade,
      "-af",
      audioFade,
      "-c:v",
      "libx264",
      "-c:a",
      "aac",
      "-movflags",
      "+faststart",
      input.outputPath
    ]);
  } catch {
    await runFfmpeg([
      "-y",
      "-i",
      input.clipPath,
      "-vf",
      videoFade,
      "-an",
      "-c:v",
      "libx264",
      "-movflags",
      "+faststart",
      input.outputPath
    ]);
  }
}

async function concatenateClips(input: {
  clipPaths: string[];
  durationSec: number;
  listPath: string;
  outputPath: string;
}) {
  await writeFile(input.listPath, `${input.clipPaths.map(concatFileLine).join("\n")}\n`, "utf8");

  if (input.clipPaths.length > 1) {
    const transitionSec = 0.32;
    try {
      await concatenateWithCrossfade({
        clipPaths: input.clipPaths,
        durationSec: input.durationSec,
        transitionSec,
        outputPath: input.outputPath
      });
      return {
        mode: "xfade",
        transitionSec
      };
    } catch {
      // Some provider outputs may omit audio or contain unusual stream metadata. Keep a safe fallback.
    }
  }

  const preparedPaths: string[] = [];

  for (const clipPath of input.clipPaths) {
    const softPath = clipPath.replace(/\.mp4$/i, "-soft.mp4");
    await addSoftEdges({
      clipPath,
      outputPath: softPath,
      durationSec: input.durationSec,
      fadeSec: 0.24
    });
    preparedPaths.push(softPath);
  }

  await writeFile(input.listPath, `${preparedPaths.map(concatFileLine).join("\n")}\n`, "utf8");
  await runFfmpeg([
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    input.listPath,
    "-c:v",
    "libx264",
    "-c:a",
    "aac",
    "-movflags",
    "+faststart",
    input.outputPath
  ]);
  return {
    mode: "fade_concat",
    transitionSec: 0
  };
}

async function runSeedanceTask(input: {
  prompt: string;
  providerImages?: ProviderImageInput[];
  metadataPath: string;
  outputPath: string;
  progressStart: number;
  progressEnd: number;
  onProgress?: (progress: number, step: string) => Promise<void> | void;
}) {
  await input.onProgress?.(
    input.progressStart,
    input.providerImages?.length ? "Creating Seedance image-reference task" : "Creating Seedance task"
  );
  const createResult = await createTask(input.prompt, input.providerImages ?? []);
  const createPayload = createResult.payload;
  const taskId = extractTaskId(createPayload);
  await writeFile(
    input.metadataPath,
    JSON.stringify(
      {
        create: createPayload,
        prompt: input.prompt,
        imageReference: {
          requested: (input.providerImages?.length ?? 0) > 0,
          used: createResult.usedImageReference,
          error: createResult.imageReferenceError,
          images: summarizeProviderImages(input.providerImages ?? [])
        }
      },
      null,
      2
    ),
    "utf8"
  );

  const startedAt = Date.now();
  const waitMs = Math.max(30, config.seedanceWaitSeconds) * 1000;
  const pollMs = Math.max(3, config.seedancePollSeconds) * 1000;
  let latestPayload: SeedanceTaskPayload | undefined;

  while (Date.now() - startedAt <= waitMs) {
    latestPayload = await getTask(taskId);
    const status = extractStatus(latestPayload);
    const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
    const ratio = Math.min(1, elapsedSec / Math.max(1, config.seedanceWaitSeconds));
    const progress = Math.min(
      input.progressEnd - 2,
      input.progressStart +
        Math.round(ratio * Math.max(1, input.progressEnd - input.progressStart - 4))
    );
    await input.onProgress?.(progress, `Waiting for Seedance: ${status}`);
    await writeFile(
      input.metadataPath,
      JSON.stringify(
        {
          create: createPayload,
          latest: latestPayload,
          prompt: input.prompt,
          imageReference: {
            requested: (input.providerImages?.length ?? 0) > 0,
            used: createResult.usedImageReference,
            error: createResult.imageReferenceError,
            images: summarizeProviderImages(input.providerImages ?? [])
          }
        },
        null,
        2
      ),
      "utf8"
    );

    if (terminalStatuses.has(status)) {
      if (status !== "succeeded") throw new Error(`Seedance task ended with status=${status}.`);
      const videoUrl = extractVideoUrl(latestPayload);
      if (!videoUrl) throw new Error("Seedance task succeeded but no video URL was found.");

      await input.onProgress?.(input.progressEnd - 1, "Downloading Seedance video");
      await downloadVideo(videoUrl, input.outputPath);
      return {
        taskId,
        metadataPath: input.metadataPath,
        outputPath: input.outputPath,
        usedImageReference: createResult.usedImageReference,
        imageReferenceError: createResult.imageReferenceError
      };
    }

    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  throw new Error(`Seedance task timed out after ${config.seedanceWaitSeconds}s. taskId=${taskId}`);
}

export function seedanceConfigured() {
  return Boolean(config.ark.apiKey && config.ark.videoEndpoint);
}

export function shouldAttemptSeedance() {
  if (config.videoRenderProvider === "ffmpeg") return false;
  if (config.videoRenderProvider === "seedance") return true;
  return !config.useMockAi && seedanceConfigured();
}

export async function renderSeedanceVideo(
  input: RenderSeedanceInput
): Promise<SeedanceRenderResult> {
  if (!seedanceConfigured()) {
    throw new Error("Seedance is not configured. ARK_API_KEY and ARK_VIDEO_ENDPOINT are required.");
  }

  const jobId = safeJobId(input.jobId);
  const jobDir = path.join(input.outputDir, jobId);
  const outputPath = path.join(jobDir, "seedance-output.mp4");
  await mkdir(jobDir, { recursive: true });
  const providerImages = await prepareProviderImages(input.referenceImages);

  if (config.seedanceRenderMode === "segments" && input.renderPlan.scenes.length > 1) {
    const segments = splitScenesIntoSegments(input.renderPlan);
    const taskIds: string[] = [];
    const clipPaths: string[] = [];
    const imageReferenceResults: Array<{
      used: boolean;
      error?: string;
    }> = [];
    const metadataPath = path.join(jobDir, "seedance-segments.json");
    await input.onProgress?.(18, `Preparing ${segments.length} Seedance segments`);

    for (const segment of segments) {
      const progressStart = 20 + Math.round((segment.index / segments.length) * 62);
      const progressEnd = 20 + Math.round(((segment.index + 1) / segments.length) * 62);
      const clipPath = path.join(jobDir, `seedance-segment-${segment.index + 1}.mp4`);
      const segmentMetadataPath = path.join(jobDir, `seedance-segment-${segment.index + 1}.json`);
      const result = await runSeedanceTask({
        prompt: buildPrompt(input.renderPlan, {
          scenes: segment.scenes,
          durationSec: segment.durationSec,
          segmentIndex: segment.index,
          segmentCount: segments.length
        }),
        providerImages,
        metadataPath: segmentMetadataPath,
        outputPath: clipPath,
        progressStart,
        progressEnd,
        onProgress: async (progress, step) => {
          await input.onProgress?.(
            progress,
            `Segment ${segment.index + 1}/${segments.length}: ${step}`
          );
        }
      });
      taskIds.push(result.taskId);
      clipPaths.push(result.outputPath);
      imageReferenceResults.push({
        used: result.usedImageReference,
        error: result.imageReferenceError
      });
    }

    await input.onProgress?.(86, "Concatenating Seedance segments");
    const concatResult = await concatenateClips({
      clipPaths,
      durationSec: supportedSeedanceClipDuration(),
      listPath: path.join(jobDir, "seedance-concat.txt"),
      outputPath
    });
    const rawDurationSec = segments.reduce((sum, segment) => sum + segment.durationSec, 0);
    const durationSec = Number(
      Math.max(
        1,
        rawDurationSec - concatResult.transitionSec * Math.max(0, segments.length - 1)
      ).toFixed(2)
    );
    await writeFile(
      metadataPath,
      JSON.stringify(
        {
          mode: "segments",
          segmentCount: segments.length,
          targetDurationSec: config.seedanceTotalDurationSec,
          durationSec,
          rawDurationSec,
          concatMode: concatResult.mode,
          transitionSec: concatResult.transitionSec,
          taskIds,
          imageReference: {
            requested: providerImages.length > 0,
            used:
              providerImages.length > 0 &&
              imageReferenceResults.length > 0 &&
              imageReferenceResults.every((item) => item.used),
            errors: imageReferenceResults
              .map((item) => item.error)
              .filter((item): item is string => Boolean(item)),
            images: summarizeProviderImages(providerImages)
          },
          clips: clipPaths,
          segments: segments.map((segment) => ({
            order: segment.index + 1,
            durationSec: segment.durationSec,
            sceneOrders: segment.scenes.map((scene) => scene.order)
          }))
        },
        null,
        2
      ),
      "utf8"
    );

    return {
      path: outputPath,
      urlPath: `/rendered/${jobId}/seedance-output.mp4`,
      durationSec,
      ratio: input.renderPlan.ratio,
      resolution: input.renderPlan.resolution,
      usedFallback: false,
      taskId: taskIds[0] ?? "",
      taskIds,
      segmentCount: segments.length,
      metadataPath,
      imageReference: {
        requested: providerImages.length > 0,
        used:
          providerImages.length > 0 &&
          imageReferenceResults.length > 0 &&
          imageReferenceResults.every((item) => item.used),
        errors: imageReferenceResults
          .map((item) => item.error)
          .filter((item): item is string => Boolean(item)),
        images: summarizeProviderImages(providerImages)
      }
    };
  }

  const metadataPath = path.join(jobDir, "seedance-task.json");
  const result = await runSeedanceTask({
    prompt: buildPrompt(input.renderPlan),
    providerImages,
    metadataPath,
    outputPath,
    progressStart: 18,
    progressEnd: 86,
    onProgress: input.onProgress
  });

  return {
    path: outputPath,
    urlPath: `/rendered/${jobId}/seedance-output.mp4`,
    durationSec: clampClipDuration(config.seedanceTargetDurationSec),
    ratio: input.renderPlan.ratio,
    resolution: input.renderPlan.resolution,
    usedFallback: false,
    taskId: result.taskId,
    metadataPath,
    imageReference: {
      requested: providerImages.length > 0,
      used: result.usedImageReference,
      errors: result.imageReferenceError ? [result.imageReferenceError] : [],
      images: summarizeProviderImages(providerImages)
    }
  };
}
