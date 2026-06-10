import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import ffmpegStatic from "ffmpeg-static";
import type { Material, MaterialSlice, Scene } from "@advivid/shared";
import { nowIso } from "@advivid/shared";
import { config } from "../config.js";

export interface MaterialRecommendation {
  material: Material;
  slice?: MaterialSlice;
  score: number;
  reasons: string[];
}

const tokenMap: Record<string, string[]> = {
  coffee: ["咖啡", "提神", "办公室"],
  lamp: ["灯光", "家居", "氛围"],
  bag: ["通勤", "收纳", "穿搭"],
  beauty: ["美妆", "细节", "质感"],
  outdoor: ["户外", "轻便", "旅行"]
};

export function createEmbedding(text: string) {
  const vector = Array.from({ length: 12 }, (_, index) => {
    const codeSum = Array.from(text).reduce((sum, char, charIndex) => {
      return sum + char.charCodeAt(0) * (index + charIndex + 1);
    }, 0);
    return Number(((codeSum % 997) / 997).toFixed(4));
  });
  return vector;
}

function tokenize(text: string) {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .split(/[\s,，、。.!?！？;；:：/\\|"'“”‘’()（）[\]{}<>《》]+/)
        .map((token) => token.trim())
        .filter((token) => token.length > 0)
    )
  );
}

function cosineSimilarity(left: number[], right: number[]) {
  const length = Math.min(left.length, right.length);
  if (length === 0) return 0;

  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < length; index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }

  if (leftNorm === 0 || rightNorm === 0) return 0;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

function scoreText(input: {
  query: string;
  queryTokens: string[];
  queryEmbedding: number[];
  candidateText: string;
  candidateTags: string[];
  candidateEmbedding: number[];
}) {
  const haystack = input.candidateText.toLowerCase();
  const tagSet = new Set(input.candidateTags.map((tag) => tag.toLowerCase()));
  const keywordHits = input.queryTokens.filter((token) => haystack.includes(token) || tagSet.has(token));
  const tagHits = input.queryTokens.filter((token) => Array.from(tagSet).some((tag) => tag.includes(token) || token.includes(tag)));
  const semanticScore = cosineSimilarity(input.queryEmbedding, input.candidateEmbedding);
  const exactTitleBonus = input.query && haystack.includes(input.query.toLowerCase()) ? 1.5 : 0;
  const score = keywordHits.length * 2.2 + tagHits.length * 1.3 + semanticScore * 3 + exactTitleBonus;
  const reasons = [
    ...keywordHits.slice(0, 3).map((token) => `关键词匹配：${token}`),
    ...tagHits.slice(0, 2).map((token) => `标签相关：${token}`)
  ];

  if (semanticScore > 0.75) reasons.push("语义向量相似");

  return {
    score,
    reasons: Array.from(new Set(reasons))
  };
}

const sliceRoles = [
  { key: "hook", label: "开场外观", startSec: 0, endSec: 3 },
  { key: "detail", label: "核心细节", startSec: 3, endSec: 6 },
  { key: "demo", label: "使用动作", startSec: 6, endSec: 9 },
  { key: "result", label: "结果展示", startSec: 9, endSec: 12 }
];
const ffmpegBinary = () => ffmpegStatic || process.env.FFMPEG_BIN || process.env.FFMPEG_PATH || "ffmpeg";

const runFfmpeg = (args: string[]) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpegBinary(), args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `ffmpeg exited with code ${code}`));
    });
  });

const runFfmpegBuffer = (args: string[]) =>
  new Promise<Buffer>((resolve, reject) => {
    const child = spawn(ffmpegBinary(), args, { stdio: ["ignore", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout.push(Buffer.from(chunk));
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(stdout));
      else reject(new Error(stderr || `ffmpeg exited with code ${code}`));
    });
  });

const runFfmpegWithInput = (args: string[], input: Buffer) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpegBinary(), args, { stdio: ["pipe", "ignore", "pipe"] });
    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `ffmpeg exited with code ${code}`));
    });

    child.stdin.end(input);
  });

async function probeImageDimensions(inputPath: string) {
  const stderr = await new Promise<string>((resolve, reject) => {
    const child = spawn(ffmpegBinary(), ["-hide_banner", "-i", inputPath, "-frames:v", "1", "-f", "null", "-"], {
      stdio: ["ignore", "ignore", "pipe"]
    });
    let output = "";
    child.stderr.on("data", (chunk) => {
      output += String(chunk);
    });
    child.on("error", reject);
    child.on("close", () => resolve(output));
  });
  const match = stderr.match(/,\s*(\d{2,5})x(\d{2,5})(?:[,\s]|$)/);
  if (!match) throw new Error("Could not probe image dimensions.");
  return {
    width: Number(match[1]),
    height: Number(match[2])
  };
}

function colorDistance(left: [number, number, number], right: [number, number, number]) {
  const red = left[0] - right[0];
  const green = left[1] - right[1];
  const blue = left[2] - right[2];
  return Math.sqrt(red * red + green * green + blue * blue);
}

function averageBorderColor(buffer: Buffer, width: number, height: number): [number, number, number] {
  const samples: Array<[number, number, number]> = [];
  const sampleSize = Math.min(8, width, height);
  const corners: Array<[number, number]> = [
    [0, 0],
    [width - sampleSize, 0],
    [0, height - sampleSize],
    [width - sampleSize, height - sampleSize]
  ];

  for (const [startX, startY] of corners) {
    for (let y = startY; y < startY + sampleSize; y += 1) {
      for (let x = startX; x < startX + sampleSize; x += 1) {
        const offset = (y * width + x) * 4;
        samples.push([buffer[offset] ?? 255, buffer[offset + 1] ?? 255, buffer[offset + 2] ?? 255]);
      }
    }
  }

  return [0, 1, 2].map((channel) =>
    Math.round(samples.reduce((sum, sample) => sum + sample[channel]!, 0) / samples.length)
  ) as [number, number, number];
}

function removeConnectedBackground(buffer: Buffer, width: number, height: number) {
  const background = averageBorderColor(buffer, width, height);
  const brightness = background[0] + background[1] + background[2];
  const threshold = brightness > 690 ? 86 : 58;
  const total = width * height;
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;

  const enqueueIfBackground = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const pixelIndex = y * width + x;
    if (visited[pixelIndex]) return;
    const offset = pixelIndex * 4;
    const color: [number, number, number] = [
      buffer[offset] ?? 255,
      buffer[offset + 1] ?? 255,
      buffer[offset + 2] ?? 255
    ];
    if (colorDistance(background, color) > threshold) return;
    visited[pixelIndex] = 1;
    queue[tail] = pixelIndex;
    tail += 1;
  };

  for (let x = 0; x < width; x += 1) {
    enqueueIfBackground(x, 0);
    enqueueIfBackground(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    enqueueIfBackground(0, y);
    enqueueIfBackground(width - 1, y);
  }

  while (head < tail) {
    const pixelIndex = queue[head]!;
    head += 1;
    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);
    buffer[pixelIndex * 4 + 3] = 0;
    enqueueIfBackground(x + 1, y);
    enqueueIfBackground(x - 1, y);
    enqueueIfBackground(x, y + 1);
    enqueueIfBackground(x, y - 1);
  }

  return buffer;
}

async function decodeImageToRgba(inputPath: string, width: number, height: number) {
  return runFfmpegBuffer([
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    inputPath,
    "-vf",
    `scale=${width}:${height},format=rgba`,
    "-frames:v",
    "1",
    "-f",
    "rawvideo",
    "pipe:1"
  ]);
}

async function encodeRgbaPng(input: {
  buffer: Buffer;
  width: number;
  height: number;
  outputPath: string;
}) {
  await runFfmpegWithInput(
    [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgba",
      "-s",
      `${input.width}x${input.height}`,
      "-i",
      "pipe:0",
      "-frames:v",
      "1",
      input.outputPath
    ],
    input.buffer
  );
}

export async function createProductCutout(material: Material) {
  if (material.type !== "product_image" || !material.mimeType.startsWith("image")) {
    return {
      cutoutUrl: undefined,
      cutoutPath: undefined,
      cutoutStatus: "not_applicable" as const
    };
  }

  const outputDir = path.join(config.uploadDir, "material-cutouts", material.id);
  await mkdir(outputDir, { recursive: true });
  const hardCutoutPath = path.join(outputDir, "product-cutout-hard.png");
  const outputPath = path.join(outputDir, "product-cutout.png");
  const outputUrl = `/uploads/material-cutouts/${material.id}/product-cutout.png`;

  try {
    const sourceDimensions = await probeImageDimensions(material.path);
    const width = Math.min(900, sourceDimensions.width);
    const height = Math.max(1, Math.round((sourceDimensions.height / sourceDimensions.width) * width));
    const rgba = await decodeImageToRgba(material.path, width, height);
    if (rgba.length < width * height * 4) {
      throw new Error("Decoded image buffer is shorter than expected.");
    }
    const cutoutBuffer = removeConnectedBackground(Buffer.from(rgba), width, height);
    await encodeRgbaPng({
      buffer: cutoutBuffer,
      width,
      height,
      outputPath: hardCutoutPath
    });
    await runFfmpeg([
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      hardCutoutPath,
      "-filter_complex",
      "[0:v]format=rgba,split[fg][alpha];[alpha]alphaextract,boxblur=2:1[softalpha];[fg][softalpha]alphamerge",
      "-frames:v",
      "1",
      outputPath
    ]);

    return {
      cutoutUrl: outputUrl,
      cutoutPath: outputPath,
      cutoutStatus: "ready" as const
    };
  } catch {
    return {
      cutoutUrl: material.cutoutUrl,
      cutoutPath: material.cutoutPath,
      cutoutStatus: "failed" as const
    };
  }
}

async function createThumbnail(inputPath: string, outputPath: string, atSec: number) {
  try {
    await runFfmpeg([
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-ss",
      String(Math.max(0, atSec)),
      "-i",
      inputPath,
      "-frames:v",
      "1",
      "-vf",
      "scale=360:-1",
      "-q:v",
      "3",
      outputPath
    ]);
    return true;
  } catch {
    return false;
  }
}

async function createVideoSlices(material: Material, tags: string[]) {
  const outputDir = path.join(config.uploadDir, "material-slices", material.id);
  await mkdir(outputDir, { recursive: true });
  const existingByIndex = new Map(material.slices.map((slice) => [slice.index, slice]));

  return Promise.all(
    sliceRoles.map(async (role, index): Promise<MaterialSlice> => {
      const thumbnailName = `slice-${index + 1}.jpg`;
      const thumbnailPath = path.join(outputDir, thumbnailName);
      const thumbnailUrl = `/uploads/material-slices/${material.id}/${thumbnailName}`;
      let captured = await createThumbnail(material.path, thumbnailPath, role.startSec + 0.5);
      if (!captured && role.startSec > 0) {
        captured = await createThumbnail(material.path, thumbnailPath, 0.5);
      }
      const existing = existingByIndex.get(index);
      const sliceTags = Array.from(new Set([...tags, role.key]));
      const summary = `${material.name} 第 ${index + 1} 段：${role.label}，适合用于${role.key === "hook" ? "开场吸引" : role.key === "detail" ? "卖点细节" : role.key === "demo" ? "使用演示" : "结果收束"}镜头。`;

      return {
        id: existing?.id ?? crypto.randomUUID(),
        materialId: material.id,
        index,
        startSec: role.startSec,
        endSec: role.endSec,
        thumbnailUrl: captured ? thumbnailUrl : existing?.thumbnailUrl,
        summary,
        tags: sliceTags,
        embedding: createEmbedding(`${material.name} ${summary} ${sliceTags.join(" ")}`),
        createdAt: existing?.createdAt ?? nowIso()
      };
    })
  );
}

function createImageSlice(material: Material, tags: string[], embedding: number[]) {
  const existing = material.slices[0];
  return [
    {
      id: existing?.id ?? crypto.randomUUID(),
      materialId: material.id,
      index: 0,
      startSec: 0,
      endSec: 0,
      thumbnailUrl: material.url,
      summary: `${material.name} 图片主体清晰，可用于商品外观或卖点展示。`,
      tags,
      embedding,
      createdAt: existing?.createdAt ?? nowIso()
    }
  ];
}

export async function analyzeMaterial(material: Material): Promise<Material> {
  const lowerName = material.name.toLowerCase();
  const inferred = Object.entries(tokenMap).flatMap(([keyword, tags]) =>
    lowerName.includes(keyword) ? tags : []
  );
  const typeTags = material.mimeType.startsWith("video")
    ? ["视频素材", "可切片"]
    : material.mimeType.startsWith("image")
      ? ["图片素材", "商品外观"]
      : ["参考素材"];
  const tags = Array.from(new Set([...material.tags, ...typeTags, ...inferred])).slice(0, 8);
  const cutout = await createProductCutout(material);
  const finalTags =
    cutout.cutoutStatus === "ready"
      ? Array.from(new Set([...tags, "商品抠图", "透明前景"])).slice(0, 10)
      : tags;
  const summary =
    cutout.cutoutStatus === "ready"
      ? `${material.name} 已结构化为${typeTags[0]}，并生成透明商品前景，可自然叠加到生成视频中。`
      : `${material.name} 已结构化为${typeTags[0]}，适合用于商品真实外观、使用场景和细节展示。`;
  const embedding = createEmbedding(`${material.name} ${summary} ${finalTags.join(" ")}`);

  const slices: MaterialSlice[] = material.mimeType.startsWith("video")
    ? await createVideoSlices(material, finalTags)
    : createImageSlice(material, finalTags, embedding);

  return {
    ...material,
    ...cutout,
    summary,
    tags: finalTags,
    embedding,
    slices,
    updatedAt: nowIso()
  };
}

export function searchMaterials(materials: Material[], query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return materials;
  const queryTokens = tokenize(normalized);
  const queryEmbedding = createEmbedding(normalized);

  return materials
    .map((material) => {
      const materialScore = scoreText({
        query: normalized,
        queryTokens,
        queryEmbedding,
        candidateText: [material.name, material.summary, ...material.tags].join(" "),
        candidateTags: material.tags,
        candidateEmbedding: material.embedding
      }).score;
      const sliceScore = Math.max(
        0,
        ...material.slices.map(
          (slice) =>
            scoreText({
              query: normalized,
              queryTokens,
              queryEmbedding,
              candidateText: [slice.summary, ...slice.tags].join(" "),
              candidateTags: slice.tags,
              candidateEmbedding: slice.embedding
            }).score
        )
      );
      const score = Math.max(materialScore, sliceScore);
      return { material, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.material);
}

export function recommendMaterialsForScene(materials: Material[], scene: Scene, limit = 6): MaterialRecommendation[] {
  const query = [scene.title, scene.visual, scene.subtitle, scene.voiceover, scene.camera, ...scene.tags].join(" ");
  const queryTokens = tokenize(query);
  const queryEmbedding = createEmbedding(query);

  return materials
    .flatMap((material) => {
      const materialMatch = scoreText({
        query,
        queryTokens,
        queryEmbedding,
        candidateText: [material.name, material.summary, ...material.tags].join(" "),
        candidateTags: material.tags,
        candidateEmbedding: material.embedding
      });

      const sliceMatches = material.slices.map((slice) => ({
        slice,
        ...scoreText({
          query,
          queryTokens,
          queryEmbedding,
          candidateText: [slice.summary, ...slice.tags].join(" "),
          candidateTags: slice.tags,
          candidateEmbedding: slice.embedding
        })
      }));

      const bestSlice = sliceMatches.sort((a, b) => b.score - a.score)[0];
      const score = Math.max(materialMatch.score, bestSlice?.score ?? 0);
      const reasons = [...materialMatch.reasons, ...(bestSlice?.reasons ?? [])];
      if (material.mimeType.startsWith("video") && bestSlice) reasons.push(`推荐切片：${bestSlice.slice.startSec}s-${bestSlice.slice.endSec}s`);
      if (material.id === scene.materialId) reasons.push("当前已绑定");

      return [
        {
          material,
          slice: bestSlice?.slice,
          score: Number(score.toFixed(3)),
          reasons: Array.from(new Set(reasons)).slice(0, 4)
        }
      ];
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
