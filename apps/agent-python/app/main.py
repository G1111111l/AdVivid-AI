from __future__ import annotations

import warnings

from dotenv import load_dotenv
from fastapi import FastAPI

warnings.filterwarnings("ignore", message="The default value of `allowed_objects` will change.*")

from app.graphs.creative_graph import run_creative_graph
from app.schemas import GenerateScriptRequest, GenerateScriptResponse

load_dotenv()

app = FastAPI(title="AdVivid Python Agent", version="0.1.0")


@app.get("/health")
async def health():
    return {
        "ok": True,
        "service": "advivid-python-agent",
        "runtime": "python-langgraph",
    }


@app.post("/agent/generate-script", response_model=GenerateScriptResponse)
async def generate_script(request: GenerateScriptRequest):
    return await run_creative_graph(request)
