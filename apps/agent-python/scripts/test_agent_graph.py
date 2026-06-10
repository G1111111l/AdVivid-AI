from __future__ import annotations

import argparse
import asyncio
import sys
import warnings
from datetime import UTC, datetime
from pathlib import Path

from dotenv import load_dotenv

warnings.filterwarnings("ignore", message="The default value of `allowed_objects` will change.*")

ROOT = Path(__file__).resolve().parents[3]
AGENT_ROOT = ROOT / "apps" / "agent-python"
sys.path.insert(0, str(AGENT_ROOT))

from app.graphs.creative_graph import run_creative_graph  # noqa: E402
from app.schemas import GenerateScriptRequest, Material, MaterialSlice, Product  # noqa: E402


def now_iso() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def sample_request() -> GenerateScriptRequest:
    now = now_iso()
    material = Material(
        id="material-selfcheck-1",
        projectId="project-selfcheck",
        type="product_image",
        name="portable-cold-brew-cup.jpg",
        mimeType="image/jpeg",
        size=1024,
        url="/uploads/selfcheck/portable-cold-brew-cup.jpg",
        path="uploads/selfcheck/portable-cold-brew-cup.jpg",
        summary="A portable cold brew coffee cup with a leak-proof lid, fine filter, and clear body.",
        tags=["coffee", "cold_brew", "portable", "office", "outdoor"],
        embedding=[],
        slices=[
            MaterialSlice(
                id="slice-selfcheck-1",
                materialId="material-selfcheck-1",
                index=0,
                startSec=0,
                endSec=0,
                thumbnailUrl="/uploads/selfcheck/portable-cold-brew-cup.jpg",
                summary="Close-up product detail showing the filter and lid.",
                tags=["detail", "filter", "lid"],
                embedding=[],
                createdAt=now,
            )
        ],
        createdAt=now,
        updatedAt=now,
    )

    product = Product(
        id="product-selfcheck",
        title="便携冷萃咖啡杯",
        sellingPoints=["一杯完成冷萃", "防漏随身携带", "细密滤网保留香气"],
        targetAudience="通勤上班族、健身后需要低负担咖啡的人群",
        scenario="早高峰通勤、办公室补能、周末户外",
        style="场景种草",
        language="zh-CN",
        durationSec=24,
        createdAt=now,
        updatedAt=now,
    )

    return GenerateScriptRequest(
        projectId="project-selfcheck",
        scriptId="script-selfcheck",
        product=product,
        materials=[material],
    )


def trace_source(response, node: str) -> str:
    for trace in response.trace:
        if trace.node == node and isinstance(trace.output, dict):
            source = trace.output.get("source")
            if isinstance(source, str):
                return source
    return "unknown"


async def run(require_ark: bool) -> int:
    load_dotenv(ROOT / ".env")
    response = await run_creative_graph(sample_request())

    script_source = trace_source(response, "ScriptWriter")
    scene_source = trace_source(response, "ScenePlanner")
    print("[agent] graph succeeded")
    print(f"[agent] script title: {response.script.title}")
    print(f"[agent] scenes: {len(response.scenes)}")
    print(f"[agent] total duration: {response.renderPlan.totalDurationSec}s")
    print(f"[agent] ScriptWriter source: {script_source}")
    print(f"[agent] ScenePlanner source: {scene_source}")
    if response.scenes:
        print(f"[agent] first subtitle: {response.scenes[0].subtitle}")

    if require_ark and (script_source != "ark" or scene_source != "ark"):
        print("[agent] Ark was required, but at least one node used fallback.")
        return 1

    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run a Python LangGraph Agent self-check.")
    parser.add_argument("--require-ark", action="store_true", help="Fail if ScriptWriter or ScenePlanner uses fallback.")
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    raise SystemExit(asyncio.run(run(args.require_ark)))
