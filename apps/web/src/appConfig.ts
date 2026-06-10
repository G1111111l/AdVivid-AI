import type { Product } from "@advivid/shared";
import { Boxes, Clapperboard, Wand2, type LucideIcon } from "lucide-react";

export type Tab = "studio" | "materials" | "jobs";

export interface ProductDraft {
  title: string;
  sellingPointsText: string;
  targetAudience: string;
  scenario: string;
  style: string;
  creativeBrief: string;
  durationSec: number;
}

export const scriptStrategies = [
  {
    style: "场景种草",
    label: "场景种草",
    description: "从真实生活场景切入，适合日用品、食品饮品、家居和穿搭。",
    structure: "场景进入 -> 商品出现 -> 卖点证明 -> 多场景使用 -> 轻 CTA"
  },
  {
    style: "痛点开场",
    label: "痛点开场",
    description: "先放大用户麻烦，再让商品自然解决问题，转化目的更强。",
    structure: "痛点冲突 -> 商品介入 -> 操作演示 -> 结果对比 -> 入手理由"
  },
  {
    style: "测评对比",
    label: "测评对比",
    description: "突出功能差异、参数、材质或使用前后变化，适合功能型商品。",
    structure: "普通方案 -> 商品方案 -> 细节证明 -> 对比结果 -> 购买理由"
  },
  {
    style: "开箱演示",
    label: "开箱演示",
    description: "适合新品、礼盒、数码配件，用开箱和上手过程建立信任。",
    structure: "开箱露出 -> 组件细节 -> 上手操作 -> 使用场景 -> CTA"
  },
  {
    style: "生活方式",
    label: "生活方式",
    description: "弱广告感，强调人物状态、氛围和商品带来的生活质感。",
    structure: "生活片段 -> 商品陪伴 -> 细节特写 -> 情绪结果 -> 软转化"
  }
] as const;

export type ScriptStrategyStyle = (typeof scriptStrategies)[number]["style"];

export const initialDraft: ProductDraft = {
  title: "",
  sellingPointsText: "",
  targetAudience: "",
  scenario: "",
  style: "场景种草",
  creativeBrief: "剧情要连续，商品贯穿每个镜头，先解决真实小麻烦，再用操作细节证明卖点，结尾轻 CTA。",
  durationSec: 20
};

export const sampleDrafts: Array<{ label: string; draft: ProductDraft }> = [
  {
    label: "冷萃杯",
    draft: {
      title: "便携冷萃咖啡杯",
      sellingPointsText: "一杯完成冷萃，防漏随身携带，细密滤网保留香气",
      targetAudience: "通勤上班族、健身后需要低负担咖啡的人群",
      scenario: "早高峰地铁站、办公室工位、健身后补能",
      style: "场景种草",
      creativeBrief: "剧情要连续，商品贯穿每个镜头，先解决真实小麻烦，再用操作细节证明卖点，结尾轻 CTA。",
      durationSec: 20
    }
  },
  {
    label: "防晒霜",
    draft: {
      title: "清爽防晒乳",
      sellingPointsText: "轻薄不黏腻，通勤户外都能用，成膜快不搓泥",
      targetAudience: "每天通勤、周末户外、在意肤感的年轻消费者",
      scenario: "出门前梳妆台、地铁通勤、周末户外补涂",
      style: "生活方式",
      creativeBrief: "剧情从出门前赶时间切入，展示上脸肤感和户外补涂，最后强调清爽防晒的日常刚需。",
      durationSec: 18
    }
  },
  {
    label: "通勤包",
    draft: {
      title: "大容量通勤双肩包",
      sellingPointsText: "电脑独立仓，多分区收纳，防泼水面料，背负轻松",
      targetAudience: "上班族、学生党、短途出差人群",
      scenario: "早高峰出门、办公室拿电脑、下班健身或短途出差",
      style: "测评对比",
      creativeBrief: "用普通包翻找东西的痛点开场，再展示分区收纳和防泼水细节，结尾给通勤到出差的连续场景。",
      durationSec: 20
    }
  },
  {
    label: "露营灯",
    draft: {
      title: "可调光露营氛围灯",
      sellingPointsText: "三档亮度，续航持久，挂放两用，暖光不刺眼",
      targetAudience: "露营爱好者、租房青年、喜欢夜间氛围感的人群",
      scenario: "傍晚露营桌面、帐篷内阅读、床头夜灯",
      style: "场景种草",
      creativeBrief: "从夜晚光线不够的场景进入，连续展示调光、挂放、桌面氛围，最后用暖光生活感收口。",
      durationSec: 18
    }
  }
];

export const tabs = [
  { id: "studio", label: "创作台", icon: Wand2 },
  { id: "materials", label: "素材库", icon: Boxes },
  { id: "jobs", label: "任务", icon: Clapperboard }
] satisfies Array<{ id: Tab; label: string; icon: LucideIcon }>;

export const materialTypes = [
  ["product_image", "商品图"],
  ["product_video", "商品视频"],
  ["reference_image", "参考图"],
  ["reference_video", "参考视频"]
] as const;

export type MaterialTypeOption = (typeof materialTypes)[number][0];

export function toProductInput(draft: ProductDraft): Partial<Product> {
  return {
    title: draft.title.trim(),
    sellingPoints: draft.sellingPointsText
      .split(/[,，、\n]/)
      .map((item) => item.trim())
      .filter(Boolean),
    targetAudience: draft.targetAudience.trim(),
    scenario: draft.scenario.trim(),
    style: draft.style,
    creativeBrief: draft.creativeBrief.trim(),
    durationSec: Number(draft.durationSec)
  };
}

export function productToDraft(product?: Product): ProductDraft {
  if (!product) return { ...initialDraft };

  return {
    title: product.title,
    sellingPointsText: product.sellingPoints.join("，"),
    targetAudience: product.targetAudience,
    scenario: product.scenario,
    style: product.style || initialDraft.style,
    creativeBrief: product.creativeBrief || "",
    durationSec: product.durationSec
  };
}
