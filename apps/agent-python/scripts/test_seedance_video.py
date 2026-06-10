from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import time
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv


ROOT = Path(__file__).resolve().parents[3]
OUTPUT_DIR = ROOT / "rendered" / "seedance-tests"


def load_settings() -> tuple[str, str, str]:
    load_dotenv(ROOT / ".env")
    api_key = os.getenv("ARK_API_KEY", "").strip()
    model = os.getenv("ARK_VIDEO_ENDPOINT", "").strip()
    base_url = os.getenv("ARK_BASE_URL", "https://ark.cn-beijing.volces.com/api/v3").strip().rstrip("/")

    missing = [name for name, value in [("ARK_API_KEY", api_key), ("ARK_VIDEO_ENDPOINT", model)] if not value]
    if missing:
        raise RuntimeError(f"Missing required env values: {', '.join(missing)}")

    return api_key, model, base_url


def safe_filename(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_-]+", "-", value).strip("-")
    return cleaned[:80] or "seedance-video"


def extract_task_id(payload: dict[str, Any]) -> str:
    for key in ["id", "task_id", "taskId"]:
        value = payload.get(key)
        if isinstance(value, str) and value:
            return value
    data = payload.get("data")
    if isinstance(data, dict):
        return extract_task_id(data)
    raise RuntimeError(f"Could not find task id in response: {json.dumps(payload, ensure_ascii=False)[:600]}")


def extract_video_url(payload: dict[str, Any]) -> str | None:
    content = payload.get("content")
    if isinstance(content, dict):
        for key in ["video_url", "url"]:
            value = content.get(key)
            if isinstance(value, str) and value:
                return value
        value = content.get("video")
        if isinstance(value, dict):
            url = value.get("url")
            if isinstance(url, str) and url:
                return url

    data = payload.get("data")
    if isinstance(data, dict):
        return extract_video_url(data)

    for key in ["video_url", "url"]:
        value = payload.get(key)
        if isinstance(value, str) and value.startswith("http"):
            return value

    return None


async def create_task(client: httpx.AsyncClient, base_url: str, model: str, prompt: str) -> dict[str, Any]:
    response = await client.post(
        f"{base_url}/contents/generations/tasks",
        json={
            "model": model,
            "content": [
                {
                    "type": "text",
                    "text": prompt,
                }
            ],
        },
    )
    response.raise_for_status()
    return response.json()


async def get_task(client: httpx.AsyncClient, base_url: str, task_id: str) -> dict[str, Any]:
    response = await client.get(f"{base_url}/contents/generations/tasks/{task_id}")
    response.raise_for_status()
    return response.json()


async def download_video(client: httpx.AsyncClient, url: str, output_path: Path) -> None:
    async with client.stream("GET", url) as response:
        response.raise_for_status()
        with output_path.open("wb") as file:
            async for chunk in response.aiter_bytes():
                file.write(chunk)


async def run(args: argparse.Namespace) -> None:
    api_key, model, base_url = load_settings()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    prompt = args.prompt.strip()

    print("Seedance test settings:")
    print(f"- base_url: {base_url}")
    print(f"- model endpoint set: yes, len={len(model)}")
    print(f"- api key set: yes, len={len(api_key)}")
    print(f"- prompt: {prompt}")

    async with httpx.AsyncClient(headers=headers, timeout=120) as client:
        create_payload = await create_task(client, base_url, model, prompt)
        task_id = extract_task_id(create_payload)
        timestamp = time.strftime("%Y%m%d-%H%M%S")
        stem = f"{timestamp}-{safe_filename(task_id)}"
        metadata_path = OUTPUT_DIR / f"{stem}.json"
        metadata_path.write_text(
            json.dumps({"create": create_payload}, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        print(f"Task created: {task_id}")
        print(f"Metadata: {metadata_path}")

        final_payload: dict[str, Any] | None = None
        start = time.time()
        while time.time() - start <= args.wait_seconds:
            payload = await get_task(client, base_url, task_id)
            status = str(payload.get("status") or payload.get("data", {}).get("status") or "unknown")
            elapsed = int(time.time() - start)
            print(f"[{elapsed:03d}s] status={status}")

            metadata_path.write_text(
                json.dumps({"create": create_payload, "latest": payload}, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )

            if status in {"succeeded", "failed", "cancelled", "expired"}:
                final_payload = payload
                break
            await asyncio.sleep(args.poll_seconds)

        if final_payload is None:
            print(f"Timed out after {args.wait_seconds}s. Task id: {task_id}")
            return

        status = str(final_payload.get("status") or final_payload.get("data", {}).get("status") or "unknown")
        if status != "succeeded":
            print(f"Task ended with status={status}. See metadata for details.")
            return

        video_url = extract_video_url(final_payload)
        if not video_url:
            print("Task succeeded, but no video URL was found in response. See metadata.")
            return

        output_path = OUTPUT_DIR / f"{stem}.mp4"
        await download_video(client, video_url, output_path)
        print(f"Downloaded video: {output_path}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create and poll a Seedance video generation task.")
    parser.add_argument(
        "--prompt",
        default=(
            "A 5-second vertical 9:16 product commercial video. "
            "A portable cold brew coffee cup on a clean desk, close-up product details, "
            "fresh ice coffee swirling, bright natural light, smooth camera push-in. "
            "--ratio 9:16 --resolution 720p --duration 5"
        ),
    )
    parser.add_argument("--wait-seconds", type=int, default=420)
    parser.add_argument("--poll-seconds", type=int, default=8)
    return parser.parse_args()


if __name__ == "__main__":
    asyncio.run(run(parse_args()))
