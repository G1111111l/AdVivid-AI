import type {
  GenerationTrace,
  Material,
  Product,
  RenderPlan,
  Scene,
  Script
} from "@advivid/shared";
import { nowIso, renderPlanSchema, sceneSchema, scriptSchema } from "@advivid/shared";
import { SCRIPT_SYSTEM_PROMPT } from "../prompts/scriptPrompt.js";
import { callArkJson } from "../tools/arkClient.js";

export interface ProductProfile {
  category: string;
  heroBenefit: string;
  audience: string;
  scenario: string;
  tone: string;
  creativeBrief: string;
  keywords: string[];
}

export interface CreativeStrategy {
  name: string;
  hookType: string;
  factors: string[];
  rationale: string;
}

export interface ReviewResult {
  passed: boolean;
  issues: string[];
  suggestions: string[];
}

export interface CreativeAgentState {
  projectId: string;
  scriptId: string;
  product: Product;
  materials: Material[];
  productProfile?: ProductProfile;
  retrievedMaterials?: Material[];
  creativeStrategy?: CreativeStrategy;
  scriptDraft?: Omit<Script, "scenes">;
  scenes?: Scene[];
  reviewResult?: ReviewResult;
  renderPlan?: RenderPlan;
  trace: GenerationTrace[];
}

const id = () => crypto.randomUUID();

const trace = (
  state: CreativeAgentState,
  node: string,
  message: string,
  output?: unknown
): GenerationTrace => ({
  id: id(),
  projectId: state.projectId,
  node,
  status: "succeeded",
  message,
  output,
  createdAt: nowIso()
});

const firstNonEmpty = (values: string[], fallback: string) =>
  values.find((item) => item.trim().length > 0) ?? fallback;

const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean)));

export async function productAnalyzer(
  state: CreativeAgentState
): Promise<Partial<CreativeAgentState>> {
  const product = state.product;
  const keywords = unique([
    product.title,
    ...product.sellingPoints,
    product.targetAudience,
    product.scenario,
    product.style,
    product.creativeBrief
  ])
    .flatMap((item) => item.split(/[,\s，、/]+/))
    .filter((item) => item.length > 1)
    .slice(0, 12);

  const profile: ProductProfile = {
    category: product.title.includes("咖啡")
      ? "饮品"
      : product.title.includes("灯")
        ? "家居"
        : product.title.includes("包")
          ? "时尚配饰"
          : "精选商品",
    heroBenefit: firstNonEmpty(product.sellingPoints, "提升日常体验"),
    audience: product.targetAudience || "注重品质和效率的年轻消费者",
    scenario: product.scenario || "日常生活场景",
    tone: product.style || "场景种草",
    creativeBrief: product.creativeBrief,
    keywords
  };

  return {
    productProfile: profile,
    trace: [...state.trace, trace(state, "ProductAnalyzer", "完成商品画像理解", profile)]
  };
}

export async function materialRetriever(
  state: CreativeAgentState
): Promise<Partial<CreativeAgentState>> {
  const keywords = state.productProfile?.keywords ?? [];
  const scored = state.materials
    .map((material) => {
      const haystack = [material.name, material.summary, ...material.tags].join(" ").toLowerCase();
      const score = keywords.reduce(
        (total, keyword) => {
          return total + (haystack.includes(keyword.toLowerCase()) ? 2 : 0);
        },
        material.tags.length > 0 ? 1 : 0
      );
      return { material, score };
    })
    .sort((a, b) => b.score - a.score);

  const retrieved = (
    scored.length > 0 ? scored : state.materials.map((material) => ({ material, score: 1 }))
  )
    .slice(0, 8)
    .map((item) => item.material);

  return {
    retrievedMaterials: retrieved,
    trace: [
      ...state.trace,
      trace(state, "MaterialRetriever", `召回 ${retrieved.length} 个候选素材`, {
        materialIds: retrieved.map((item) => item.id)
      })
    ]
  };
}

export async function strategySelector(
  state: CreativeAgentState
): Promise<Partial<CreativeAgentState>> {
  const style = state.product.style;
  const strategies: Record<string, CreativeStrategy> = {
    痛点开场: {
      name: "痛点开场转利益点",
      hookType: "pain_point",
      factors: ["3 秒痛点", "对比前后", "明确利益点", "轻 CTA"],
      rationale: "适合突出商品解决问题的效率。"
    },
    场景种草: {
      name: "生活场景沉浸种草",
      hookType: "scene_hook",
      factors: ["真实使用场景", "材质细节", "轻旁白", "氛围 BGM"],
      rationale: "适合用素材真实性建立信任。"
    },
    测评对比: {
      name: "测评对比建立信任",
      hookType: "comparison",
      factors: ["开箱细节", "功能演示", "对比表达", "购买理由"],
      rationale: "适合功能明确、卖点直接的商品。"
    }
  };

  const selected = strategies[style] ?? strategies["场景种草"]!;

  return {
    creativeStrategy: selected,
    trace: [
      ...state.trace,
      trace(state, "StrategySelector", `选择策略：${selected.name}`, selected)
    ]
  };
}

export async function scriptWriter(
  state: CreativeAgentState
): Promise<Partial<CreativeAgentState>> {
  const product = state.product;
  const strategy = state.creativeStrategy;
  const profile = state.productProfile;
  const now = nowIso();
  const modelDraft = await callArkJson<{
    title?: string;
    narrative?: string;
    hook?: string;
    constraints?: string[];
  }>([
    { role: "system", content: SCRIPT_SYSTEM_PROMPT },
    {
      role: "user",
      content: JSON.stringify({
        product,
        strategy,
        profile,
        requirement: "只返回 JSON：title, narrative, hook, constraints"
      })
    }
  ]).catch(() => undefined);

  const scriptDraft = scriptSchema.omit({ scenes: true }).parse({
    id: state.scriptId,
    projectId: state.projectId,
    productId: product.id,
    title: modelDraft?.title ?? `${product.title}｜${strategy?.name ?? "场景种草"}短视频`,
    narrative:
      modelDraft?.narrative ??
      `用「${profile?.scenario ?? product.scenario}」串联商品外观、核心卖点和使用结果，形成可信的短视频种草路径。`,
    hook:
      modelDraft?.hook ??
      `${profile?.audience ?? product.targetAudience}常遇到的问题，用 ${product.title} 给出一个更轻松的选择。`,
    style: product.style,
    strategy: strategy?.name ?? "生活场景沉浸种草",
    constraints: modelDraft?.constraints ?? [
      "总时长不超过 30 秒",
      "不夸大商品功效",
      "每个分镜都有明确画面目标",
      "优先使用用户上传的真实素材"
    ],
    createdAt: now,
    updatedAt: now
  });

  return {
    scriptDraft,
    trace: [...state.trace, trace(state, "ScriptWriter", "生成结构化剧本草稿", scriptDraft)]
  };
}

const splitTerms = (value: string) =>
  value
    .split(/[、，,;；\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);

function buildContinuousBlueprints(product: Product, profile?: ProductProfile) {
  const points = product.sellingPoints.length
    ? [...product.sellingPoints]
    : [profile?.heroBenefit ?? "使用更方便", "随身携带更安心", "提升日常体验"];
  while (points.length < 3) points.push(points[points.length - 1] ?? product.title);

  const scenarios = splitTerms(product.scenario);
  while (scenarios.length < 3) scenarios.push(scenarios[scenarios.length - 1] ?? "日常场景");
  const audience = profile?.audience || product.targetAudience || "目标用户";

  return [
    {
      title: "真实场景开场",
      visual: `${scenarios[0]}里，人物遇到一个真实小麻烦，镜头先交代环境和人物状态，再让${product.title}在手边自然露出。`,
      camera: "环境中景切到人物表情，再轻推到商品位置，保持生活化节奏。",
      voiceover: `${audience}在${scenarios[0]}遇到这种小麻烦，真的很影响状态。`,
      subtitle: `${scenarios[0]}里的真实麻烦`,
      tag: "scenario_hook"
    },
    {
      title: "商品自然介入",
      visual: `承接上一镜，人物拿起同一个${product.title}开始使用，先给完整外观，再展示一个清晰起手动作。`,
      camera: "从手部拿起顺接到商品近景，镜头稳定推近关键结构。",
      voiceover: `这时候用${product.title}，核心就是${points[0]}。`,
      subtitle: `${product.title}，主打${points[0]}`,
      tag: "product_entry"
    },
    {
      title: "操作细节证明",
      visual: `用连续近景展示${product.title}的关键操作、材质或结构细节，让${points[0]}和${points[1]}能被看见。`,
      camera: "手部动作连续拍完，穿插两次细节特写，减少无关跳切。",
      voiceover: `不是只说方便，${points[0]}和${points[1]}这两个细节都能直接看出来。`,
      subtitle: `${points[0]}，${points[1]}`,
      tag: "feature_proof"
    },
    {
      title: "连续使用结果",
      visual: `承接操作完成后的状态，人物在${scenarios[1]}继续使用同一个${product.title}，画面保留商品和人物动作的因果关系。`,
      camera: "从商品近景拉到人物中景，再回到商品，形成一个完整使用闭环。",
      voiceover: `到了${scenarios[1]}，它还能继续派上用场。`,
      subtitle: `${scenarios[1]}也能用`,
      tag: "usage_result"
    },
    {
      title: "多场景种草",
      visual: `快速切换${scenarios[0]}、${scenarios[1]}、${scenarios[2]}，同一个${product.title}贯穿始终，突出${points[2]}。`,
      camera: "用相似构图做 match cut，每个场景都让商品占据画面中心。",
      voiceover: `${scenarios[0]}能用，${scenarios[1]}能用，${scenarios[2]}也能用，关键是${points[2]}。`,
      subtitle: `${scenarios[0]} / ${scenarios[1]} / ${scenarios[2]}`,
      tag: "scenario_montage"
    },
    {
      title: "轻 CTA 收束",
      visual: `人物满意地使用${product.title}，最后给商品干净特写和轻量小黄车提示，不出现大段文字。`,
      camera: "人物中景慢慢推到商品近景，最后稳定停留一秒。",
      voiceover: `想让${scenarios[0]}更轻松，可以点小黄车看看这款${product.title}。`,
      subtitle: "喜欢就点小黄车看看",
      tag: "conversion_cta"
    }
  ];
}

export async function scenePlanner(
  state: CreativeAgentState
): Promise<Partial<CreativeAgentState>> {
  const product = state.product;
  const materials = state.retrievedMaterials ?? [];
  const sceneBlueprints = buildContinuousBlueprints(product, state.productProfile);
  const baseDuration = Math.max(3, Math.floor(product.durationSec / sceneBlueprints.length));
  const now = nowIso();

  const scenes = sceneBlueprints.map((blueprint, index) => {
    const material = materials[index % Math.max(materials.length, 1)];
    return sceneSchema.parse({
      id: id(),
      projectId: state.projectId,
      scriptId: state.scriptId,
      order: index + 1,
      title: blueprint.title,
      visual: blueprint.visual,
      camera: blueprint.camera,
      voiceover: blueprint.voiceover,
      subtitle: blueprint.subtitle,
      bgm: "clean-pop",
      durationSec:
        index === sceneBlueprints.length - 1
          ? Math.max(3, product.durationSec - baseDuration * 5)
          : baseDuration,
      materialId: material?.id,
      materialSliceId: material?.slices[0]?.id,
      generationMode: material ? "material_mix" : "mock",
      tags: [blueprint.tag, product.style, ...(material?.tags.slice(0, 2) ?? [])],
      createdAt: now,
      updatedAt: now
    });
  });

  return {
    scenes,
    trace: [...state.trace, trace(state, "ScenePlanner", `规划 ${scenes.length} 个分镜`, scenes)]
  };
}

export async function reviewAgent(state: CreativeAgentState): Promise<Partial<CreativeAgentState>> {
  const scenes = state.scenes ?? [];
  const duration = scenes.reduce((sum, scene) => sum + scene.durationSec, 0);
  const issues: string[] = [];

  if (scenes.length < 5 || scenes.length > 8) issues.push("分镜数量应保持在 5-8 个。");
  if (duration > 30) issues.push("总时长超过 30 秒。");
  if (scenes.some((scene) => !scene.subtitle.trim())) issues.push("存在空字幕分镜。");

  const review: ReviewResult = {
    passed: issues.length === 0,
    issues,
    suggestions:
      issues.length > 0
        ? ["缩短单镜头时长", "补充空字幕", "保留最关键卖点"]
        : ["剧本结构完整，可以进入渲染计划。"]
  };

  return {
    reviewResult: review,
    trace: [
      ...state.trace,
      trace(state, "ReviewAgent", review.passed ? "质检通过" : "质检发现问题", review)
    ]
  };
}

export async function renderPlanner(
  state: CreativeAgentState
): Promise<Partial<CreativeAgentState>> {
  const colors = ["#113A5D", "#2C6E49", "#C2410C", "#6D28D9", "#0F766E", "#A16207"];
  const scenes = state.scenes ?? [];
  const renderPlan = renderPlanSchema.parse({
    ratio: "9:16",
    resolution: "720p",
    totalDurationSec: scenes.reduce((sum, scene) => sum + scene.durationSec, 0),
    scenes: scenes.map((scene, index) => {
      const material = state.materials.find((item) => item.id === scene.materialId);
      return {
        sceneId: scene.id,
        order: scene.order,
        durationSec: scene.durationSec,
        visual: scene.visual,
        subtitle: scene.subtitle,
        voiceover: scene.voiceover,
        materialUrl: material?.url,
        bgColor: colors[index % colors.length]
      };
    }),
    audio: {
      bgm: "clean-pop",
      tts: true
    }
  });

  return {
    renderPlan,
    trace: [...state.trace, trace(state, "RenderPlanner", "生成可执行渲染计划", renderPlan)]
  };
}

export const creativeNodes = {
  productAnalyzer,
  materialRetriever,
  strategySelector,
  scriptWriter,
  scenePlanner,
  reviewAgent,
  renderPlanner
};
