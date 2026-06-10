import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import ffmpegStatic from "ffmpeg-static";
import type { RenderPlan, VideoRatio } from "@advivid/shared";

export interface RenderVideoInput {
  jobId: string;
  projectId: string;
  renderPlan: RenderPlan;
  outputDir: string;
  assetRootDir?: string;
  onProgress?: (progress: number, step: string) => void;
}

export interface RenderVideoResult {
  path: string;
  urlPath: string;
  durationSec: number;
  ratio: VideoRatio;
  resolution: "720p" | "1080p";
  usedFallback: boolean;
}

export interface CompositeForegroundsInput {
  jobId: string;
  inputVideoPath: string;
  renderPlan: RenderPlan;
  outputDir: string;
  assetRootDir?: string;
  durationSec?: number;
  onProgress?: (progress: number, step: string) => void;
}

export interface CompositeForegroundsResult {
  path: string;
  urlPath: string;
  foregroundCount: number;
}

const fontCandidates = () => {
  if (process.platform === "win32") {
    return [
      "C:\\Windows\\Fonts\\msyh.ttc",
      "C:\\Windows\\Fonts\\simhei.ttf",
      "C:\\Windows\\Fonts\\arial.ttf"
    ];
  }

  return [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/System/Library/Fonts/PingFang.ttc"
  ];
};

const findFont = () => fontCandidates().find((candidate) => existsSync(candidate));

const toFilterPath = (filePath: string) => {
  const normalized = filePath.replace(/\\/g, "/");
  return normalized.replace(/^([A-Za-z]):/, "$1\\\\:").replace(/'/g, "\\'");
};

const cleanOverlayText = (value: string) => value.replace(/\s+/g, " ").trim();

const wrapOverlayText = (value: string, maxCharsPerLine: number, maxLines: number) => {
  const text = cleanOverlayText(value);
  if (!text) return "";

  const lines: string[] = [];
  let current = "";

  for (const char of text) {
    current += char;
    if (current.length >= maxCharsPerLine) {
      lines.push(current);
      current = "";
      if (lines.length >= maxLines) break;
    }
  }

  if (current && lines.length < maxLines) lines.push(current);
  const clipped = lines.join("\n");
  return clipped.length < text.length ? `${clipped.replace(/\n?$/, "")}...` : clipped;
};

const clampVolume = (value: number | undefined, fallback: number) => {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(1, value ?? fallback));
};

const bgmFrequency = (name: string | undefined, index: number) => {
  const presets: Record<string, number[]> = {
    "clean-pop": [196, 247, 294, 330],
    upbeat: [220, 277, 330, 392],
    warm: [174, 220, 262, 330],
    ambient: [147, 196, 247, 294]
  };
  const notes = presets[name ?? "clean-pop"] ?? [196, 247, 294, 330];
  return notes[index % notes.length] ?? 196;
};

const voiceFrequency = (value: string, index: number) => {
  const seed = Array.from(value).reduce((sum, char) => sum + char.charCodeAt(0), index * 41);
  return 360 + (seed % 160);
};

const colorToFfmpeg = (color: string | undefined) => (color ?? "#113A5D").replace("#", "0x");

const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".bmp"]);
const videoExtensions = new Set([".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi"]);
const ffmpegBinary = () => ffmpegStatic || process.env.FFMPEG_BIN || process.env.FFMPEG_PATH || "ffmpeg";

const decodePathSegment = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const resolveMaterialPath = (materialUrl: string | undefined, assetRootDir: string | undefined) => {
  if (!materialUrl || materialUrl.startsWith("http")) return undefined;

  const normalized = decodePathSegment(materialUrl.split("?")[0] ?? "").replace(/\\/g, "/");
  if (path.isAbsolute(normalized) && existsSync(normalized)) return normalized;

  const candidate = path.resolve(assetRootDir ?? process.cwd(), normalized.replace(/^\/+/, ""));
  return existsSync(candidate) ? candidate : undefined;
};

const mediaKind = (filePath: string) => {
  const extension = path.extname(filePath).toLowerCase();
  if (imageExtensions.has(extension)) return "image";
  if (videoExtensions.has(extension)) return "video";
  return undefined;
};

const dimensions = (ratio: VideoRatio, resolution: "720p" | "1080p") => {
  if (ratio === "16:9") {
    return resolution === "1080p" ? { width: 1920, height: 1080 } : { width: 1280, height: 720 };
  }

  return resolution === "1080p" ? { width: 1080, height: 1920 } : { width: 720, height: 1280 };
};

const runFfmpeg = (args: string[]) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpegBinary(), args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr || `ffmpeg exited with code ${code}`));
      }
    });
  });

const safeJobId = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "");

const formatFilterNumber = (value: number) => Number(value.toFixed(3)).toString();

type ForegroundCompositeLayer = {
  scene: RenderPlan["scenes"][number];
  foreground: NonNullable<RenderPlan["scenes"][number]["foreground"]>;
  foregroundPath: string;
  startSec: number;
  endSec: number;
};

const isForegroundCompositeLayer = (
  value: ForegroundCompositeLayer | undefined
): value is ForegroundCompositeLayer => Boolean(value);

export async function compositeForegroundsOnVideo(
  input: CompositeForegroundsInput
): Promise<CompositeForegroundsResult | undefined> {
  const scenes = [...input.renderPlan.scenes].sort((a, b) => a.order - b.order);
  const totalPlanDuration = Math.max(
    1,
    scenes.reduce((sum, scene) => sum + Math.max(1, scene.durationSec), 0)
  );
  const outputDuration = Math.max(1, input.durationSec ?? input.renderPlan.totalDurationSec);
  const timeScale = outputDuration / totalPlanDuration;
  let elapsed = 0;

  const foregrounds = scenes
    .map((scene) => {
      const startSec = elapsed * timeScale;
      elapsed += Math.max(1, scene.durationSec);
      const endSec = elapsed * timeScale;
      const foregroundPath = resolveMaterialPath(
        scene.foreground?.imageUrl,
        input.assetRootDir
      );

      return foregroundPath && scene.foreground
        ? {
            scene,
            foreground: scene.foreground,
            foregroundPath,
            startSec,
            endSec
          }
        : undefined;
    })
    .filter(isForegroundCompositeLayer);

  if (foregrounds.length === 0) return undefined;

  const jobDir = path.join(input.outputDir, safeJobId(input.jobId));
  await mkdir(jobDir, { recursive: true });
  const outputPath = path.join(jobDir, "foreground-output.mp4");
  const { width, height } = dimensions(input.renderPlan.ratio, input.renderPlan.resolution);
  const margin = Math.round(width * 0.035);
  const shadowOffset = Math.max(5, Math.round(width * 0.012));
  const filters: string[] = [
    `[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1,format=yuv420p[base0]`
  ];
  let baseLabel = "base0";

  foregrounds.forEach((item, index) => {
    const inputIndex = index + 1;
    const foregroundWidth = Math.max(
      Math.round(width * 0.18),
      Math.min(Math.round(width * 0.68), Math.round(width * item.foreground.widthRatio))
    );
    const opacity = Math.max(0.25, Math.min(1, item.foreground.opacity ?? 1));
    const duration = Math.max(0.5, item.endSec - item.startSec);
    const fadeSec = Math.min(0.28, duration / 3);
    const fadeOutStart = Math.max(item.startSec, item.endSec - fadeSec);
    const start = formatFilterNumber(item.startSec);
    const end = formatFilterNumber(item.endSec);
    const fade = formatFilterNumber(fadeSec);
    const fadeOut = formatFilterNumber(fadeOutStart);
    const centerX = Math.round(width * item.foreground.x);
    const centerY = Math.round(height * item.foreground.y);
    const xExpr = `min(max(${centerX}-w/2,${margin}),W-w-${margin})`;
    const yExpr = `min(max(${centerY}-h/2,${margin}),H-h-${margin})`;
    const preparedLabel = `fgp${index}`;
    const mainLabel = `fg${index}`;
    const nextBaseLabel = `base${index + 1}`;

    filters.push(
      `[${inputIndex}:v]format=rgba,scale=${foregroundWidth}:-1,fade=t=in:st=${start}:d=${fade}:alpha=1,fade=t=out:st=${fadeOut}:d=${fade}:alpha=1,colorchannelmixer=aa=${opacity.toFixed(
        2
      )}[${preparedLabel}]`
    );

    if (item.foreground.shadow ?? true) {
      const shadowLabel = `shadow${index}`;
      const shadowBaseLabel = `base${index + 1}s`;
      filters.push(`[${preparedLabel}]split[${mainLabel}][${shadowLabel}src]`);
      filters.push(
        `[${shadowLabel}src]colorchannelmixer=rr=0:gg=0:bb=0:aa=0.28,boxblur=8:2[${shadowLabel}]`
      );
      filters.push(
        `[${baseLabel}][${shadowLabel}]overlay=x='${xExpr}+${shadowOffset}':y='${yExpr}+${shadowOffset}':enable='between(t,${start},${end})'[${shadowBaseLabel}]`
      );
      filters.push(
        `[${shadowBaseLabel}][${mainLabel}]overlay=x='${xExpr}':y='${yExpr}':enable='between(t,${start},${end})'[${nextBaseLabel}]`
      );
    } else {
      filters.push(
        `[${baseLabel}][${preparedLabel}]overlay=x='${xExpr}':y='${yExpr}':enable='between(t,${start},${end})'[${nextBaseLabel}]`
      );
    }

    baseLabel = nextBaseLabel;
  });

  filters.push(`[${baseLabel}]format=yuv420p[vout]`);
  input.onProgress?.(88, "合成上传商品前景");
  await runFfmpeg([
    "-y",
    "-i",
    input.inputVideoPath,
    ...foregrounds.flatMap((item) => [
      "-loop",
      "1",
      "-t",
      formatFilterNumber(outputDuration),
      "-i",
      item.foregroundPath
    ]),
    "-filter_complex",
    filters.join(";"),
    "-map",
    "[vout]",
    "-map",
    "0:a?",
    "-shortest",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-movflags",
    "+faststart",
    outputPath
  ]);

  return {
    path: outputPath,
    urlPath: `/rendered/${safeJobId(input.jobId)}/foreground-output.mp4`,
    foregroundCount: foregrounds.length
  };
}

export async function renderVideo(input: RenderVideoInput): Promise<RenderVideoResult> {
  await mkdir(input.outputDir, { recursive: true });
  const safeId = safeJobId(input.jobId);
  const jobDir = path.join(input.outputDir, safeId);
  await mkdir(jobDir, { recursive: true });

  const outputFile = path.join(jobDir, "output.mp4");
  const fallbackFile = path.join(jobDir, "render-plan.json");
  const { width, height } = dimensions(input.renderPlan.ratio, input.renderPlan.resolution);
  const font = findFont();

  if (!font) {
    await writeFile(fallbackFile, JSON.stringify(input.renderPlan, null, 2), "utf8");
    return {
      path: fallbackFile,
      urlPath: `/rendered/${safeId}/render-plan.json`,
      durationSec: input.renderPlan.totalDurationSec,
      ratio: input.renderPlan.ratio,
      resolution: input.renderPlan.resolution,
      usedFallback: true
    };
  }

  try {
    const clipPaths: string[] = [];

    for (const [index, scene] of input.renderPlan.scenes.entries()) {
      input.onProgress?.(15 + Math.round((index / input.renderPlan.scenes.length) * 55), `渲染分镜 ${index + 1}`);
      const clipPath = path.join(jobDir, `scene-${index + 1}.mp4`);
      const titleFile = path.join(jobDir, `scene-${index + 1}-title.txt`);
      const subtitleFile = path.join(jobDir, `scene-${index + 1}-subtitle.txt`);
      const voiceoverFile = path.join(jobDir, `scene-${index + 1}-voiceover.txt`);
      const subtitleStyle = input.renderPlan.subtitleStyle ?? {
        position: "bottom",
        maxCharsPerLine: input.renderPlan.ratio === "16:9" ? 20 : 14,
        maxLines: 2,
        fontScale: input.renderPlan.ratio === "16:9" ? 0.038 : 0.045,
        boxOpacity: 0.58
      };
      const audio = input.renderPlan.audio ?? {
        bgm: "clean-pop",
        tts: true,
        bgmVolume: 0.18,
        voiceVolume: 0.55
      };
      const title = `第 ${scene.order} 镜`;
      const subtitle = scene.subtitle || scene.visual;
      const duration = Math.max(1, scene.durationSec);
      const materialPath = resolveMaterialPath(scene.materialUrl, input.assetRootDir);
      const kind = materialPath ? mediaKind(materialPath) : undefined;
      await writeFile(titleFile, title, "utf8");
      await writeFile(
        subtitleFile,
        wrapOverlayText(subtitle, subtitleStyle.maxCharsPerLine, subtitleStyle.maxLines),
        "utf8"
      );
      await writeFile(voiceoverFile, cleanOverlayText(scene.voiceover || subtitle), "utf8");
      const titleFontSize = Math.max(24, Math.round(width * 0.036));
      const subtitleFontSize = Math.max(28, Math.round(width * subtitleStyle.fontScale));
      const subtitleY = subtitleStyle.position === "middle" ? "(h-text_h)/2" : "h*0.72";
      const subtitleBoxBorder = Math.max(16, Math.round(width * 0.035));
      const overlayFilters = [
        `drawtext=fontfile=${toFilterPath(font)}:textfile=${toFilterPath(titleFile)}:fontcolor=white:fontsize=${titleFontSize}:box=1:boxcolor=black@0.34:boxborderw=${Math.round(width * 0.018)}:x=w*0.06:y=h*0.07`,
        `drawtext=fontfile=${toFilterPath(font)}:textfile=${toFilterPath(subtitleFile)}:fontcolor=white:fontsize=${subtitleFontSize}:line_spacing=${Math.round(subtitleFontSize * 0.22)}:box=1:boxcolor=black@${subtitleStyle.boxOpacity}:boxborderw=${subtitleBoxBorder}:shadowcolor=black@0.7:shadowx=2:shadowy=2:x=(w-text_w)/2:y=${subtitleY}`
      ];
      const baseVisualFilters = kind
        ? [
            `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease`,
            `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=${colorToFfmpeg(scene.bgColor)}`
          ]
        : [`[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase`, `crop=${width}:${height}`];
      const visualFilter = [
        ...baseVisualFilters,
        "setsar=1",
        "format=yuv420p",
        ...overlayFilters
      ].join(",");
      const bgmInput = `sine=frequency=${bgmFrequency(audio.bgm, index)}:sample_rate=44100:duration=${duration}`;
      const voiceInput = `sine=frequency=${voiceFrequency(scene.voiceover || subtitle, index)}:sample_rate=44100:duration=${duration}`;
      const fadeOutStart = Math.max(0, duration - 0.35);
      const bgmVolume = clampVolume(audio.bgmVolume, 0.18).toFixed(2);
      const voiceVolume = clampVolume(audio.voiceVolume, 0.55).toFixed(2);
      const audioInputs = ["-f", "lavfi", "-i", bgmInput];
      if (audio.tts) audioInputs.push("-f", "lavfi", "-i", voiceInput);
      const audioFilter = audio.tts
        ? [
            `[1:a]volume=${bgmVolume},afade=t=in:st=0:d=0.15,afade=t=out:st=${fadeOutStart}:d=0.25[bgm]`,
            `[2:a]volume=${voiceVolume},afade=t=in:st=0:d=0.08,afade=t=out:st=${fadeOutStart}:d=0.2[voice]`,
            "[bgm][voice]amix=inputs=2:duration=shortest:dropout_transition=0,alimiter=limit=0.85[a]"
          ].join(";")
        : `[1:a]volume=${bgmVolume},afade=t=in:st=0:d=0.15,afade=t=out:st=${fadeOutStart}:d=0.25,alimiter=limit=0.85[a]`;

      if (kind && materialPath) {
        const visualInput =
          kind === "image"
            ? ["-loop", "1", "-t", String(duration), "-i", materialPath]
            : ["-stream_loop", "-1", "-t", String(duration), "-i", materialPath];

        await runFfmpeg([
          "-y",
          ...visualInput,
          ...audioInputs,
          "-filter_complex",
          `${visualFilter}[v];${audioFilter}`,
          "-map",
          "[v]",
          "-map",
          "[a]",
          "-shortest",
          "-c:v",
          "libx264",
          "-pix_fmt",
          "yuv420p",
          "-c:a",
          "aac",
          clipPath
        ]);
      } else {
        await runFfmpeg([
          "-y",
          "-f",
          "lavfi",
          "-i",
          `color=c=${colorToFfmpeg(scene.bgColor)}:s=${width}x${height}:r=30:d=${duration}`,
          ...audioInputs,
          "-filter_complex",
          `${visualFilter}[v];${audioFilter}`,
          "-map",
          "[v]",
          "-map",
          "[a]",
          "-shortest",
          "-c:v",
          "libx264",
          "-pix_fmt",
          "yuv420p",
          "-c:a",
          "aac",
          clipPath
        ]);
      }

      clipPaths.push(clipPath);
    }

    input.onProgress?.(78, "合成完整视频");
    const listFile = path.join(jobDir, "concat.txt");
    await writeFile(
      listFile,
      clipPaths
        .map((clipPath) => `file '${path.resolve(clipPath).replace(/\\/g, "/").replace(/'/g, "'\\''")}'`)
        .join("\n"),
      "utf8"
    );

    await runFfmpeg(["-y", "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", outputFile]);
    input.onProgress?.(95, "写入导出文件");

    return {
      path: outputFile,
      urlPath: `/rendered/${safeId}/output.mp4`,
      durationSec: input.renderPlan.totalDurationSec,
      ratio: input.renderPlan.ratio,
      resolution: input.renderPlan.resolution,
      usedFallback: false
    };
  } catch (error) {
    await writeFile(
      fallbackFile,
      JSON.stringify(
        {
          error: error instanceof Error ? error.message : String(error),
          renderPlan: input.renderPlan
        },
        null,
        2
      ),
      "utf8"
    );

    return {
      path: fallbackFile,
      urlPath: `/rendered/${safeId}/render-plan.json`,
      durationSec: input.renderPlan.totalDurationSec,
      ratio: input.renderPlan.ratio,
      resolution: input.renderPlan.resolution,
      usedFallback: true
    };
  }
}
