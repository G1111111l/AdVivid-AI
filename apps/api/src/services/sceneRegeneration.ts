import type { Material, Product, Scene } from "@advivid/shared";
import { config } from "../config.js";

interface RegenerateSceneInput {
  scene: Scene;
  product: Product;
  material?: Material;
}

type ScenePatch = Pick<Scene, "title" | "visual" | "camera" | "voiceover" | "subtitle" | "bgm" | "durationSec" | "tags">;

function parseJsonObject(content: string) {
  let cleaned = content.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
  }
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) cleaned = cleaned.slice(start, end + 1);
  return JSON.parse(cleaned) as Record<string, unknown>;
}

function cleanText(value: unknown, fallback: string, max: number) {
  const text = typeof value === "string" && value.trim() ? value.trim() : fallback;
  return text.slice(0, max);
}

function cleanTags(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  const tags = value.map((item) => String(item).trim()).filter(Boolean);
  return Array.from(new Set(tags)).slice(0, 6);
}

function boundedDuration(value: unknown, fallback: number) {
  const duration = Number(value);
  if (!Number.isFinite(duration)) return fallback;
  return Math.max(1, Math.min(8, Math.round(duration)));
}

async function regenerateWithArk(input: RegenerateSceneInput) {
  if (config.useMockAi || !config.ark.apiKey || !config.ark.textEndpoint) return undefined;

  const materialText = input.material
    ? {
        name: input.material.name,
        summary: input.material.summary,
        tags: input.material.tags,
        slices: input.material.slices.slice(0, 4).map((slice) => ({
          id: slice.id,
          range: `${slice.startSec}s-${slice.endSec}s`,
          summary: slice.summary,
          tags: slice.tags
        }))
      }
    : undefined;

  const response = await fetch(`${config.ark.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.ark.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: config.ark.textEndpoint,
      temperature: 0.45,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "你是电商短视频分镜导演。只返回 JSON，字段为 title, visual, camera, voiceover, subtitle, bgm, durationSec, tags。不要解释。"
        },
        {
          role: "user",
          content: JSON.stringify(
            {
              task: "请只重写当前单个分镜，保持商品一致、表达更清晰、适合短视频带货。",
              product: {
                title: input.product.title,
                sellingPoints: input.product.sellingPoints,
                targetAudience: input.product.targetAudience,
                scenario: input.product.scenario,
                style: input.product.style
              },
              currentScene: input.scene,
              boundMaterial: materialText,
              constraints: [
                "字幕不超过 24 个中文字符",
                "旁白口语化",
                "不要夸大商品功效",
                "如果有绑定素材，visual 要贴合素材内容"
              ]
            },
            null,
            2
          )
        }
      ]
    })
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Ark scene regeneration failed: HTTP ${response.status} ${body.slice(0, 300)}`);
  }

  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("Ark scene regeneration returned empty content.");
  return parseJsonObject(content);
}

function fallbackRegenerate(input: RegenerateSceneInput): Record<string, unknown> {
  const point = input.product.sellingPoints[0] ?? input.product.title;
  const materialHint = input.material
    ? `结合「${input.material.name}」的真实素材，突出${input.material.tags.slice(0, 2).join("、") || "商品细节"}。`
    : `用干净背景展示 ${input.product.title} 的核心卖点。`;

  return {
    title: `${input.scene.title} · 优化版`,
    visual: `${materialHint} 画面聚焦商品主体，补充近景细节和使用场景，让用户一眼看懂价值。`,
    camera: "先中景建立场景，再轻推到商品细节，最后稳定停留 0.5 秒。",
    voiceover: `${input.product.title} 的${point}，让${input.product.scenario || "日常使用"}更轻松。`,
    subtitle: `${point}，真实好用`,
    bgm: input.scene.bgm || "clean-pop",
    durationSec: input.scene.durationSec,
    tags: Array.from(new Set([...input.scene.tags, "regenerated", "scene_edit"]))
  };
}

export async function regenerateScene(input: RegenerateSceneInput): Promise<ScenePatch & { source: "ark" | "fallback" }> {
  let payload: Record<string, unknown> | undefined;
  let source: "ark" | "fallback" = "ark";

  try {
    payload = await regenerateWithArk(input);
  } catch {
    payload = undefined;
  }

  if (!payload) {
    payload = fallbackRegenerate(input);
    source = "fallback";
  }

  return {
    title: cleanText(payload.title, input.scene.title, 40),
    visual: cleanText(payload.visual, input.scene.visual, 240),
    camera: cleanText(payload.camera, input.scene.camera, 120),
    voiceover: cleanText(payload.voiceover, input.scene.voiceover, 160),
    subtitle: cleanText(payload.subtitle, input.scene.subtitle, 72),
    bgm: cleanText(payload.bgm, input.scene.bgm || "clean-pop", 40),
    durationSec: boundedDuration(payload.durationSec, input.scene.durationSec),
    tags: cleanTags(payload.tags, Array.from(new Set([...input.scene.tags, "regenerated"]))),
    source
  };
}
