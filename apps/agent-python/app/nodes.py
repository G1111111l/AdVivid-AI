from __future__ import annotations

import asyncio
import json
import os
import uuid
from datetime import UTC, datetime
from typing import Any, TypedDict

import httpx
from langchain_core.prompts import ChatPromptTemplate

from .schemas import GenerationTrace, Material, Product, RenderPlan, RenderScene, Scene
from .storyboard_template import (
    build_story_scenes,
    build_story_script_draft,
    model_story_items_valid,
    storyboard_durations,
    storyboard_prompt_text,
    target_story_duration,
)


def now_iso() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def new_id() -> str:
    return str(uuid.uuid4())


class CreativeState(TypedDict, total=False):
    projectId: str
    scriptId: str
    product: Product
    materials: list[Material]
    productProfile: dict[str, Any]
    retrievedMaterials: list[Material]
    creativeStrategy: dict[str, Any]
    scriptDraft: dict[str, Any]
    scenes: list[Scene]
    reviewResult: dict[str, Any]
    renderPlan: RenderPlan
    trace: list[GenerationTrace]


def _trace(state: CreativeState, node: str, message: str, output: Any | None = None) -> GenerationTrace:
    if hasattr(output, "model_dump"):
        output = output.model_dump(mode="json")
    if isinstance(output, list):
        output = [item.model_dump(mode="json") if hasattr(item, "model_dump") else item for item in output]

    return GenerationTrace(
        id=new_id(),
        projectId=state["projectId"],
        node=node,
        status="succeeded",
        message=message,
        output=output,
        createdAt=now_iso(),
    )


def _with_trace(state: CreativeState, node: str, message: str, output: Any | None = None) -> list[GenerationTrace]:
    return [*state.get("trace", []), _trace(state, node, message, output)]


def _first_non_empty(values: list[str], fallback: str) -> str:
    for value in values:
        if value.strip():
            return value.strip()
    return fallback


def _parse_json_content(content: str) -> dict[str, Any]:
    cleaned = content.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:].strip()

    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start >= 0 and end > start:
        cleaned = cleaned[start : end + 1]

    return json.loads(cleaned)


def _ark_configured() -> tuple[str, str, str] | None:
    if os.getenv("USE_MOCK_AI", "true").lower() != "false":
        return None
    api_key = os.getenv("ARK_API_KEY")
    endpoint = os.getenv("ARK_TEXT_ENDPOINT")
    base_url = os.getenv("ARK_BASE_URL", "https://ark.cn-beijing.volces.com/api/v3")
    if not api_key or not endpoint:
        return None
    return api_key, endpoint, base_url


def _to_openai_role(role: str) -> str:
    return "user" if role == "human" else role


async def _call_ark_json(messages: list[Any], *, temperature: float, timeout: int) -> dict[str, Any]:
    configured = _ark_configured()
    if not configured:
        raise RuntimeError("Ark text model is not configured.")

    api_key, endpoint, base_url = configured
    payload = {
        "model": endpoint,
        "messages": [{"role": _to_openai_role(message.type), "content": str(message.content)} for message in messages],
        "temperature": temperature,
        "response_format": {"type": "json_object"},
    }

    last_error: Exception | None = None
    retries = max(1, min(3, int(os.getenv("ARK_TEXT_RETRIES", "2"))))
    for attempt in range(retries):
        try:
            async with httpx.AsyncClient(timeout=timeout, trust_env=False) as client:
                response = await client.post(
                    f"{base_url}/chat/completions",
                    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                    json=payload,
                )
                response.raise_for_status()
                content = response.json()["choices"][0]["message"]["content"]
            return _parse_json_content(content)
        except Exception as error:
            last_error = error
            if attempt < retries - 1:
                await asyncio.sleep(1.5 * (attempt + 1))

    raise last_error or RuntimeError("Ark request failed.")


def product_analyzer(state: CreativeState) -> dict[str, Any]:
    product = state["product"]
    text_items = [
        product.title,
        *product.sellingPoints,
        product.targetAudience,
        product.scenario,
        product.style,
        product.creativeBrief,
    ]
    keywords: list[str] = []
    for item in text_items:
        for token in item.replace("，", " ").replace("、", " ").replace("/", " ").split():
            if len(token) > 1 and token not in keywords:
                keywords.append(token)

    title = product.title
    if any(term in title for term in ["咖啡", "杯", "茶", "饮"]):
        category = "饮品器具"
    elif any(term in title for term in ["灯", "椅", "桌", "床"]):
        category = "家居生活"
    elif any(term in title for term in ["包", "鞋", "衣", "帽"]):
        category = "服饰配件"
    elif any(term in title for term in ["面霜", "精华", "口红", "防晒"]):
        category = "美妆个护"
    else:
        category = "精选商品"

    profile = {
        "category": category,
        "heroBenefit": _first_non_empty(product.sellingPoints, "提升日常体验"),
        "audience": product.targetAudience or "注重效率和品质的年轻消费者",
        "scenario": product.scenario or "日常生活场景",
        "tone": product.style or "痛点开场 + 场景种草",
        "creativeBrief": product.creativeBrief,
        "keywords": keywords[:12],
    }

    return {
        "productProfile": profile,
        "trace": _with_trace(state, "ProductAnalyzer", "Python Agent 完成商品画像理解", profile),
    }


def material_retriever(state: CreativeState) -> dict[str, Any]:
    keywords = state.get("productProfile", {}).get("keywords", [])
    scored: list[tuple[int, Material]] = []
    for material in state.get("materials", []):
        slice_parts: list[str] = []
        for item in material.slices:
            slice_parts.extend([item.summary, *item.tags])
        haystack = " ".join([material.name, material.summary, *material.tags, *slice_parts]).lower()
        score = sum(2 for keyword in keywords if keyword.lower() in haystack)
        score += 1 if material.tags else 0
        score += min(3, sum(1 for item in material.slices if item.tags))
        scored.append((score, material))

    scored.sort(key=lambda item: item[0], reverse=True)
    retrieved = [material for _, material in scored[:8]]

    return {
        "retrievedMaterials": retrieved,
        "trace": _with_trace(
            state,
            "MaterialRetriever",
            f"Python Agent 召回 {len(retrieved)} 个候选素材",
            {
                "materialIds": [material.id for material in retrieved],
                "sliceIds": [item.id for material in retrieved for item in material.slices[:2]],
            },
        ),
    }


def strategy_selector(state: CreativeState) -> dict[str, Any]:
    product = state["product"]
    selected = {
        "name": "主题一致的连续带货叙事",
        "hookType": "story_hook",
        "factors": ["真实开场", "商品介入", "卖点证明", "场景连续", "轻 CTA"],
        "rationale": "根据商品和人群选择自然剧情，不套固定公式，但保证主题、卖点和转化链路完整。",
        "preferredStyle": product.style or "场景种草",
    }

    return {
        "creativeStrategy": selected,
        "trace": _with_trace(state, "StrategySelector", f"Python Agent 选择策略：{selected['name']}", selected),
    }


async def _ark_script_draft(product: Product, strategy: dict[str, Any], profile: dict[str, Any]) -> dict[str, Any] | None:
    if not _ark_configured():
        return None

    prompt = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                (
                    "You are an e-commerce short-video creative agent. Return JSON only with "
                    "title, narrative, hook, constraints. Write the final content in Chinese. "
                    "The script must be time-boxed and action-based, not generic selling points."
                ),
            ),
            (
                "user",
                (
                    "Product: {product}\nStrategy: {strategy}\nProfile: {profile}\nCreative brief: {creative_brief}\n"
                    "Required storyboard template: {storyboard_template}\n"
                    "Generate a practical e-commerce video script summary with second ranges, "
                    "visual actions, product proof, multi-scenario usage, and CTA."
                ),
            ),
        ]
    )
    messages = prompt.format_messages(
        product=product.model_dump(mode="json"),
        strategy=strategy,
        profile=profile,
        creative_brief=product.creativeBrief or "保持剧情连续、主题一致、商品贯穿全片。",
        storyboard_template=storyboard_prompt_text(product),
    )
    return await _call_ark_json(messages, temperature=0.4, timeout=35)


async def script_writer(state: CreativeState) -> dict[str, Any]:
    product = state["product"]
    strategy = state.get("creativeStrategy", {})
    profile = state.get("productProfile", {})
    model_draft = None
    model_error = ""
    try:
        model_draft = await _ark_script_draft(product, strategy, profile)
    except Exception as error:
        model_error = str(error)[:500]
        model_draft = None

    timestamp = now_iso()
    script_draft = build_story_script_draft(
        product=product,
        project_id=state["projectId"],
        script_id=state["scriptId"],
        strategy=strategy,
        profile=profile,
        model_draft=model_draft,
        timestamp=timestamp,
    )
    source = "ark" if model_draft is not None else "fallback"
    output = {**script_draft, "source": source}
    if model_error:
        output["fallbackReason"] = model_error

    return {
        "scriptDraft": script_draft,
        "trace": _with_trace(
            state,
            "ScriptWriter",
            "Python Agent 按连续剧情原则生成结构化剧本草稿",
            output,
        ),
    }


def _compact_materials(materials: list[Material]) -> list[dict[str, Any]]:
    compact: list[dict[str, Any]] = []
    for material in materials[:8]:
        compact.append(
            {
                "id": material.id,
                "type": material.type,
                "name": material.name,
                "summary": material.summary,
                "tags": material.tags[:8],
                "slices": [
                    {
                        "id": item.id,
                        "summary": item.summary,
                        "tags": item.tags[:6],
                    }
                    for item in material.slices[:4]
                ],
            }
        )
    return compact


async def _ark_scene_plan(
    product: Product,
    strategy: dict[str, Any],
    profile: dict[str, Any],
    script_draft: dict[str, Any],
    materials: list[Material],
) -> list[dict[str, Any]] | None:
    if not _ark_configured():
        return None

    prompt = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                (
                    "You are an e-commerce short-video storyboard director. Return JSON only. "
                    "Write Chinese voiceover/subtitles. Create 5 to 6 natural connected scenes. "
                    "Do not invent unrelated products, categories, medical effects, or random scenes."
                ),
            ),
            (
                "user",
                (
                    "Product title: {product_title}\nSelling points: {selling_points}\n"
                    "Target audience: {audience}\nScenarios: {scenario}\n"
                    "Creative brief: {creative_brief}\n"
                    "Strategy: {strategy}\nProfile: {profile}\nScript draft: {script}\n"
                    "Available materials: {materials}\n"
                    "Required storyboard template: {storyboard_template}\n"
                    "Return JSON format: "
                    '{{"scenes":[{{"title":"","visual":"","camera":"","voiceover":"","subtitle":"",'
                    '"bgm":"clean-pop","durationSec":4,"materialId":"","materialSliceId":"",'
                    '"generationMode":"material_mix|text_to_video|mock","tags":["pain_hook"]}}]}}'
                ),
            ),
        ]
    )
    messages = prompt.format_messages(
        product_title=product.title,
        selling_points="、".join(product.sellingPoints),
        audience=product.targetAudience,
        scenario=product.scenario,
        creative_brief=product.creativeBrief or "保持剧情连续、主题一致、商品贯穿全片。",
        strategy=strategy,
        profile=profile,
        script=script_draft,
        materials=_compact_materials(materials),
        storyboard_template=storyboard_prompt_text(product),
    )
    payload = await _call_ark_json(messages, temperature=0.2, timeout=55)
    scenes = payload.get("scenes")
    if not isinstance(scenes, list):
        return None
    return [item for item in scenes if isinstance(item, dict)]


def _clean_text(value: Any, fallback: str, max_len: int) -> str:
    text = str(value).strip() if value is not None else ""
    return (text or fallback)[:max_len]


def _normalize_model_items(product: Product, items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized = items[:6]
    durations = storyboard_durations(target_story_duration(product), len(normalized))
    for index, item in enumerate(normalized):
        item["durationSec"] = durations[index]
    return normalized


def _scene_from_model_item(
    *,
    state: CreativeState,
    item: dict[str, Any],
    index: int,
    material: Material | None,
    timestamp: str,
) -> Scene:
    material_id = item.get("materialId") if isinstance(item.get("materialId"), str) and item.get("materialId") else None
    slice_id = (
        item.get("materialSliceId")
        if isinstance(item.get("materialSliceId"), str) and item.get("materialSliceId")
        else None
    )
    if material and not material_id:
        material_id = material.id
    if material and material.slices and not slice_id:
        slice_id = material.slices[0].id

    tags = item.get("tags") if isinstance(item.get("tags"), list) else []
    clean_tags = [str(tag) for tag in tags if str(tag).strip()][:6]
    mode = item.get("generationMode")
    generation_mode = mode if mode in ["material_mix", "text_to_video", "image_to_video", "mock"] else None

    return Scene(
        id=new_id(),
        projectId=state["projectId"],
        scriptId=state["scriptId"],
        order=index + 1,
        title=_clean_text(item.get("title"), f"分镜 {index + 1}", 40),
        visual=_clean_text(item.get("visual"), "展示商品在真实场景中的使用动作。", 240),
        camera=_clean_text(item.get("camera"), "稳定中景，轻微推进到商品主体。", 120),
        voiceover=_clean_text(item.get("voiceover"), item.get("subtitle") or "这个细节让使用更轻松。", 160),
        subtitle=_clean_text(item.get("subtitle"), item.get("voiceover") or "真实场景，清楚种草", 72),
        bgm=_clean_text(item.get("bgm"), "clean-pop", 40),
        durationSec=int(item.get("durationSec") or 4),
        materialId=material_id,
        materialSliceId=slice_id,
        generationMode=generation_mode or ("material_mix" if material_id else "text_to_video"),
        tags=clean_tags or ["storyboard", state["product"].style],
        createdAt=timestamp,
        updatedAt=timestamp,
    )


async def scene_planner(state: CreativeState) -> dict[str, Any]:
    product = state["product"]
    profile = state.get("productProfile", {})
    materials = state.get("retrievedMaterials", [])
    timestamp = now_iso()
    model_items: list[dict[str, Any]] | None = None
    model_error = ""

    try:
        model_items = await _ark_scene_plan(
            product=product,
            strategy=state.get("creativeStrategy", {}),
            profile=profile,
            script_draft=state.get("scriptDraft", {}),
            materials=materials,
        )
    except Exception as error:
        model_error = str(error)[:500]
        model_items = None

    if model_story_items_valid(product, model_items):
        normalized_items = _normalize_model_items(product, model_items or [])
        material_map = {material.id: material for material in materials}
        scenes = []
        for index, item in enumerate(normalized_items):
            material_id = item.get("materialId") if isinstance(item.get("materialId"), str) else None
            material = material_map.get(material_id or "") or (materials[index % len(materials)] if materials else None)
            scenes.append(_scene_from_model_item(state=state, item=item, index=index, material=material, timestamp=timestamp))

        return {
            "scenes": scenes,
            "trace": _with_trace(
                state,
                "ScenePlanner",
                f"Python Agent 调用火山方舟按连续剧情原则规划 {len(scenes)} 个分镜",
                {"source": "ark", "scenes": [scene.model_dump(mode="json") for scene in scenes]},
            ),
        }

    if not model_error and model_items is not None:
        model_error = "Ark scene plan did not pass product/story continuity validation."

    scenes = build_story_scenes(
        product=product,
        project_id=state["projectId"],
        script_id=state["scriptId"],
        profile=profile,
        materials=materials,
        timestamp=timestamp,
        new_id=new_id,
    )

    return {
        "scenes": scenes,
        "trace": _with_trace(
            state,
            "ScenePlanner",
            f"Python Agent 使用连续剧情兜底规划 {len(scenes)} 个分镜",
            {
                "source": "fallback",
                "fallbackReason": model_error,
                "modelItemCount": len(model_items or []),
                "scenes": [scene.model_dump(mode="json") for scene in scenes],
            },
        ),
    }


def review_agent(state: CreativeState) -> dict[str, Any]:
    scenes = state.get("scenes", [])
    duration = sum(scene.durationSec for scene in scenes)
    target_duration = target_story_duration(state["product"])
    issues: list[str] = []
    if len(scenes) < 5 or len(scenes) > 6:
        issues.append("分镜数量应保持在 5-6 个，避免过碎或过短。")
    if duration > 30:
        issues.append("总时长超过 30 秒。")
    if abs(duration - target_duration) > 2:
        issues.append(f"当前总时长 {duration} 秒，与目标 {target_duration} 秒偏差较大。")
    if any(not scene.subtitle.strip() for scene in scenes):
        issues.append("存在空字幕分镜。")

    review = {
        "passed": not issues,
        "issues": issues,
        "suggestions": ["剧本结构完整，可以进入渲染计划。"] if not issues else ["检查分镜时长和字幕内容。"],
    }
    return {
        "reviewResult": review,
        "trace": _with_trace(
            state,
            "ReviewAgent",
            "Python Agent 质检通过" if not issues else "Python Agent 质检发现问题",
            review,
        ),
    }


def render_planner(state: CreativeState) -> dict[str, Any]:
    colors = ["#113A5D", "#2C6E49", "#C2410C", "#6D28D9", "#0F766E", "#A16207"]
    materials = {material.id: material for material in state.get("materials", [])}
    scenes = state.get("scenes", [])
    render_scenes = []
    for index, scene in enumerate(scenes):
        material = materials.get(scene.materialId or "")
        render_scenes.append(
            RenderScene(
                sceneId=scene.id,
                order=scene.order,
                durationSec=scene.durationSec,
                visual=scene.visual,
                camera=scene.camera,
                subtitle=scene.subtitle,
                voiceover=scene.voiceover,
                materialUrl=material.url if material else None,
                bgColor=colors[index % len(colors)],
            )
        )

    render_plan = RenderPlan(
        ratio="9:16",
        resolution="720p",
        totalDurationSec=sum(scene.durationSec for scene in scenes),
        scenes=render_scenes,
    )
    return {
        "renderPlan": render_plan,
        "trace": _with_trace(state, "RenderPlanner", "Python Agent 输出视频渲染计划", render_plan),
    }
