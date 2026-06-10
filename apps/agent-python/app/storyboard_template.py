from __future__ import annotations

import re
from typing import Any, Callable

from .schemas import Material, Product, Scene


def short_text(value: str, max_len: int) -> str:
    cleaned = re.sub(r"\s+", " ", value).strip()
    return cleaned[:max_len]


def target_story_duration(product: Product) -> int:
    return max(15, min(20, int(product.durationSec or 20)))


def split_terms(value: str) -> list[str]:
    return [item.strip() for item in re.split(r"[、,，/|;；\n]+", value or "") if item.strip()]


def audience_short(product: Product) -> str:
    terms = split_terms(product.targetAudience)
    return terms[0] if terms else "目标用户"


def scenario_terms(product: Product) -> list[str]:
    terms = split_terms(product.scenario)
    if not terms:
        terms = ["日常使用", "工作学习", "外出携带"]
    while len(terms) < 3:
        terms.append(terms[-1])
    return terms[:3]


def selling_points(product: Product) -> list[str]:
    points = [item.strip() for item in product.sellingPoints if item.strip()]
    if not points:
        points = ["解决核心痛点", "使用更方便", "提升日常体验"]
    while len(points) < 3:
        points.append(points[-1])
    return points[:3]


def preferred_scene_count(product: Product) -> int:
    duration = target_story_duration(product)
    if duration <= 16:
        return 5
    if len([item for item in product.sellingPoints if item.strip()]) >= 3:
        return 6
    return 5


def storyboard_durations(total_duration: int, scene_count: int | None = None) -> list[int]:
    total = max(15, min(20, int(total_duration)))
    count = max(5, min(6, int(scene_count or 5)))
    ratios = [0.14, 0.16, 0.2, 0.2, 0.16, 0.14] if count == 6 else [0.16, 0.2, 0.24, 0.24, 0.16]

    durations = [max(2, min(8, round(total * ratio))) for ratio in ratios]
    grow_order = list(range(2, count)) + [1, 0]
    shrink_order = [count - 1, 0, 1, 2, 3, 4][:count]

    while sum(durations) < total:
        for index in grow_order:
            if durations[index] < 8:
                durations[index] += 1
                break

    while sum(durations) > total:
        for index in shrink_order:
            if durations[index] > 2:
                durations[index] -= 1
                break

    return durations


def time_ranges(total_duration: int, scene_count: int | None = None) -> list[str]:
    elapsed = 0
    ranges: list[str] = []
    for duration in storyboard_durations(total_duration, scene_count):
        ranges.append(f"{elapsed}-{elapsed + duration}s")
        elapsed += duration
    return ranges


def product_kind(product: Product) -> str:
    text = f"{product.title} {' '.join(product.sellingPoints)}"
    if any(term in text for term in ["咖啡", "冷萃", "杯", "水杯", "饮", "茶"]):
        return "drinkware"
    if any(term in text for term in ["面霜", "精华", "口红", "防晒", "护肤", "美妆"]):
        return "beauty"
    if any(term in text for term in ["包", "鞋", "衣", "帽", "穿搭"]):
        return "fashion"
    if any(term in text for term in ["灯", "椅", "桌", "收纳", "家居"]):
        return "home"
    return "general"


def scenario_problem(scenario: str, product: Product) -> str:
    kind = product_kind(product)
    if "地铁" in scenario or "通勤" in scenario or "早高峰" in scenario:
        if kind == "drinkware":
            return "地铁站外咖啡店排队很长，通勤者看表皱眉，包侧袋露出同一个商品"
        return "早高峰人流中，目标用户一边赶路一边处理麻烦，手边出现同一个商品"
    if "办公室" in scenario or "工位" in scenario:
        return "办公室工位上任务堆叠，人物停下来拿起同一个商品，准备解决眼前的小麻烦"
    if "健身" in scenario or "运动" in scenario:
        return "运动后人物从包里拿出同一个商品，镜头给到汗水、包和商品的真实使用氛围"
    if "户外" in scenario or "露营" in scenario or "周末" in scenario:
        return "户外桌面或野餐垫上摆着同一个商品，人物自然伸手使用它"
    return f"{scenario}中人物遇到一个具体小麻烦，镜头让{product.title}在手边自然露出"


def feature_demo_visual(product: Product, points: list[str]) -> str:
    kind = product_kind(product)
    if kind == "drinkware":
        return (
            f"同一个{product.title}放在干净桌面上，手部近景依次完成加咖啡粉、倒入常温水、拧紧防漏盖、轻晃几下；"
            f"镜头切到滤网和杯盖细节，证明{points[0]}和{points[1]}"
        )
    if kind == "beauty":
        return (
            f"同一个{product.title}在梳妆台上打开，手背或脸侧少量试用，镜头展示质地、延展和吸收过程；"
            f"用真实近景证明{points[0]}和{points[1]}"
        )
    if kind == "fashion":
        return (
            f"人物拿起同一个{product.title}，展示开合、容量、材质或上身效果；"
            f"镜头从细节切到整体搭配，证明{points[0]}和{points[1]}"
        )
    if kind == "home":
        return (
            f"同一个{product.title}在真实家居环境里被安装、打开或整理使用；"
            f"镜头给到结构细节和使用前后变化，证明{points[0]}和{points[1]}"
        )
    return (
        f"近景展示同一个{product.title}的关键操作、材质和使用步骤；"
        f"用手部动作和细节特写证明{points[0]}和{points[1]}"
    )


def choose_opening(product: Product, profile: dict[str, Any]) -> dict[str, str]:
    style_text = f"{product.style} {profile.get('tone', '')} {profile.get('category', '')}"
    scenarios = scenario_terms(product)
    if any(term in style_text for term in ["测评", "对比", "开箱"]):
        return {
            "tag": "comparison_hook",
            "title": "对比开场",
            "goal": "用普通做法和商品方案的差异抓住注意力",
            "visual": f"{scenario_problem(scenarios[0], product)}；先给出普通做法的麻烦，再让{product.title}作为更轻松的选择进入画面",
            "camera": "先拍普通做法的手忙脚乱，再用一次顺滑推镜切到商品出现",
        }
    if any(term in style_text for term in ["生活", "种草", "场景"]):
        return {
            "tag": "scenario_hook",
            "title": "场景开场",
            "goal": "把用户带入真实生活场景，再引出需求",
            "visual": f"{scenario_problem(scenarios[0], product)}；人物动作不要夸张，商品先作为场景里的真实物件出现",
            "camera": "环境建立镜头后切人物表情，再轻推到商品露出，结尾停在商品上",
        }
    return {
        "tag": "pain_hook",
        "title": "痛点开场",
        "goal": "用目标人群的即时痛点建立观看理由",
        "visual": f"{scenario_problem(scenarios[0], product)}；最后一个动作明确暗示这个商品会解决问题",
        "camera": "广角交代麻烦，近景拍表情或手部动作，最后稳定落到商品",
    }


def build_story_arc(product: Product, profile: dict[str, Any]) -> list[dict[str, str]]:
    points = selling_points(product)
    scenarios = scenario_terms(product)
    audience = audience_short(product)
    opening = choose_opening(product, profile)
    scene_count = preferred_scene_count(product)

    arc = [
        {
            **opening,
            "voice": f"{audience}在{scenarios[0]}遇到这种小麻烦，真的很耽误状态。",
            "subtitle": f"{scenarios[0]}里的真实麻烦",
        },
        {
            "tag": "product_entry",
            "title": "产品自然出现",
            "goal": "让商品成为解决问题的自然选择，而不是硬插广告",
            "visual": (
                f"承接上一镜，人物把同一个{product.title}从包侧袋、桌面或手边拿起，先给完整外观，"
                f"再做一个最简单的使用起手动作，让观众明白它要解决{points[0]}"
            ),
            "camera": "从上一镜的商品位置顺接，手部拿起，稳定推近到商品主体和关键结构",
            "voice": f"这时候用上{product.title}，核心就是{points[0]}。",
            "subtitle": f"{product.title}，主打{points[0]}",
        },
        {
            "tag": "feature_proof",
            "title": "卖点证明",
            "goal": "用操作、细节、材质或过程证明卖点可信",
            "visual": feature_demo_visual(product, points),
            "camera": "连续近景特写，动作从开始到完成，不跳切到无关物品",
            "voice": f"它不是只说方便，{points[0]}和{points[1]}这两个细节能直接看出来。",
            "subtitle": f"{points[0]}，{points[1]}",
        },
    ]

    if scene_count == 6:
        arc.extend(
            [
                {
                    "tag": "usage_moment",
                    "title": "连续使用",
                    "goal": "让商品从展示进入真实使用，形成前后因果",
                    "visual": (
                        f"承接上一镜完成后的状态，人物在{scenarios[1]}继续使用同一个{product.title}；"
                        "画面保留商品在手里或桌面上的位置，让观众知道这是同一件商品"
                    ),
                    "camera": "从商品近景拉到人物中景，再回到商品，结尾保持商品可见",
                    "voice": f"到了{scenarios[1]}，它还能继续派上用场。",
                    "subtitle": f"{scenarios[1]}也能用",
                },
                {
                    "tag": "scenario_montage",
                    "title": "场景扩展",
                    "goal": "证明商品适合多个真实场景，放大购买理由",
                    "visual": (
                        f"三个短镜头快速切换：{scenarios[0]}拿着同一个{product.title}赶路，"
                        f"{scenarios[1]}把它放在手边使用，{scenarios[2]}从包里拿出继续用；"
                        f"每个镜头都让商品占画面中心，强调{points[2]}"
                    ),
                    "camera": "用相似构图做 match cut，每个场景以商品位置作视觉锚点",
                    "voice": f"{scenarios[0]}、{scenarios[1]}、{scenarios[2]}都能用，关键是{points[2]}。",
                    "subtitle": f"{scenarios[0]} / {scenarios[1]} / {scenarios[2]}",
                },
            ]
        )
    else:
        arc.append(
            {
                "tag": "scenario_montage",
                "title": "多场景种草",
                "goal": "把商品带进多个真实使用场景，证明它不是摆拍",
                "visual": (
                    f"快速切换{scenarios[0]}、{scenarios[1]}、{scenarios[2]}，同一个{product.title}贯穿始终；"
                    f"每次切换都保持商品颜色、形状和使用动作一致，突出{points[2]}"
                ),
                "camera": "三个场景保持相似商品特写构图，减少跳跃感",
                "voice": f"{scenarios[0]}能用，{scenarios[1]}能用，{scenarios[2]}也能用，关键是{points[2]}。",
                "subtitle": f"{scenarios[0]} / {scenarios[1]} / {scenarios[2]}都能用",
            }
        )

    arc.append(
        {
            "tag": "conversion_cta",
            "title": "结果收束",
            "goal": "用人物满意状态和商品特写完成转化引导",
            "visual": (
                f"人物满意地使用同一个{product.title}，自然看向镜头微笑；"
                "最后给商品干净特写，可以出现轻量黄色购物车入口提示，但不要生成大段可读文字或水印"
            ),
            "camera": "人物中景慢慢推到商品近景，最后稳定停留一秒，适合做结尾",
            "voice": f"想让{scenarios[0]}更轻松，可以点小黄车看看这款{product.title}。",
            "subtitle": "喜欢就点小黄车看看",
        }
    )
    return arc


def build_story_script_draft(
    *,
    product: Product,
    project_id: str,
    script_id: str,
    strategy: dict[str, Any],
    profile: dict[str, Any],
    model_draft: dict[str, Any] | None,
    timestamp: str,
) -> dict[str, Any]:
    duration = target_story_duration(product)
    arc = build_story_arc(product, profile)
    ranges = time_ranges(duration, len(arc))
    audience = audience_short(product)
    points = selling_points(product)
    model_title = (model_draft or {}).get("title")
    title = (
        model_title
        if isinstance(model_title, str) and product.title in model_title and len(model_title) <= 42
        else f"{audience}必看！{duration}秒了解{product.title}"
    )
    narrative = "；".join(
        f"{ranges[index]}：{scene['goal']}，画面重点是{scene['visual']}" for index, scene in enumerate(arc)
    )
    hook = f"{audience}在{scenario_terms(product)[0]}遇到麻烦时，用{product.title}突出“{points[0]}”。"
    creative_brief = product.creativeBrief.strip()

    return {
        "id": script_id,
        "projectId": project_id,
        "productId": product.id,
        "title": title,
        "narrative": narrative,
        "hook": hook,
        "style": product.style or "连贯剧情带货",
        "strategy": strategy.get("name") or "主题一致的短视频带货叙事",
        "constraints": [
            f"总时长控制在 {duration} 秒左右，分镜数量根据商品复杂度保持 5-6 个。",
            "剧本可以自由变化，但必须有明确的起因、商品介入、卖点证明、使用结果和转化引导。",
            "每个分镜都要承接上一分镜，避免像多个无关广告片段硬拼。",
            f"全片主商品必须始终是“{product.title}”，不能漂移到其他商品类别。",
            "卖点表达要具体可信，不夸大功效，不生成水印或不可控大段文字。",
            f"额外创作要求：{creative_brief}" if creative_brief else "额外创作要求：保持剧情连续、画面主题一致、商品贯穿全片。",
        ],
        "createdAt": timestamp,
        "updatedAt": timestamp,
    }


def _material_for_index(materials: list[Material], index: int) -> Material | None:
    if not materials:
        return None
    return materials[index % len(materials)]


def build_story_scenes(
    *,
    product: Product,
    project_id: str,
    script_id: str,
    profile: dict[str, Any],
    materials: list[Material],
    timestamp: str,
    new_id: Callable[[], str],
) -> list[Scene]:
    duration = target_story_duration(product)
    arc = build_story_arc(product, profile)
    durations = storyboard_durations(duration, len(arc))

    scenes: list[Scene] = []
    for index, stage in enumerate(arc):
        material = _material_for_index(materials, index)
        scenes.append(
            Scene(
                id=new_id(),
                projectId=project_id,
                scriptId=script_id,
                order=index + 1,
                title=stage["title"],
                visual=short_text(stage["visual"], 240),
                camera=short_text(stage["camera"], 120),
                voiceover=short_text(stage["voice"], 160),
                subtitle=short_text(stage["subtitle"], 72),
                bgm="clean-pop",
                durationSec=durations[index],
                materialId=material.id if material else None,
                materialSliceId=material.slices[0].id if material and material.slices else None,
                generationMode="material_mix" if material else "text_to_video",
                tags=[stage["tag"], product.style or "story", "continuous_sales"],
                createdAt=timestamp,
                updatedAt=timestamp,
            )
        )

    return scenes


def storyboard_prompt_text(product: Product) -> str:
    duration = target_story_duration(product)
    scenarios = scenario_terms(product)
    points = selling_points(product)
    return (
        "Create a natural e-commerce short-video story, not a rigid template. "
        f"Use 5 to 6 scenes and keep the total duration around {duration} seconds. "
        "The story must stay on-topic and continuous: opening context or pain point, product entry, "
        "credible feature proof, real usage/result, and a soft sales CTA. "
        f"Use the product exactly as the hero item: {product.title}. "
        f"Key selling points to prove: {', '.join(points)}. "
        f"Useful scenarios: {', '.join(scenarios)}. "
        f"User creative brief: {product.creativeBrief or 'keep continuity, product consistency, and soft conversion intent'}. "
        "Each scene must describe visible concrete actions, camera continuity, Chinese voiceover, short Chinese subtitle, "
        "durationSec, generationMode, and tags. Avoid abstract director notes, unrelated props, random product categories, "
        "hard scene jumps, watermarks, or large readable text overlays."
    )


def model_story_items_valid(product: Product, items: list[dict[str, Any]] | None) -> bool:
    if not items or len(items) < 5 or len(items) > 6:
        return False
    text = " ".join(
        str(item.get(field, "")) for item in items for field in ["title", "visual", "voiceover", "subtitle", "camera"]
    )
    generic_titles = ["hook", "核心卖点", "购买理由", "结果展示", "使用过程", "痛点/场景", "3 秒"]
    generic_count = sum(1 for item in items if any(term in str(item.get("title", "")).lower() for term in generic_titles))
    if generic_count >= 3:
        return False
    weak_visuals = sum(
        1
        for item in items
        if len(str(item.get("visual", "")).strip()) < 28 or "具体" in str(item.get("visual", "")) and product.title not in str(item.get("visual", ""))
    )
    if weak_visuals >= 2:
        return False
    required = [product.title, *selling_points(product)]
    hits = sum(1 for term in required if term and term in text)
    story_hits = sum(1 for term in ["痛点", "场景", "使用", "演示", "卖点", "入手", "小黄车", "购买"] if term in text)
    return hits >= 2 and story_hits >= 2
