from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class Product(BaseModel):
    id: str
    title: str
    sellingPoints: list[str] = Field(default_factory=list)
    targetAudience: str = ""
    scenario: str = ""
    style: str = "场景种草"
    creativeBrief: str = ""
    language: str = "zh-CN"
    durationSec: int = 24
    createdAt: str
    updatedAt: str


class MaterialSlice(BaseModel):
    id: str
    materialId: str
    index: int
    startSec: int | float = 0
    endSec: int | float = 0
    thumbnailUrl: str | None = None
    summary: str = ""
    tags: list[str] = Field(default_factory=list)
    embedding: list[float] = Field(default_factory=list)
    createdAt: str


class Material(BaseModel):
    id: str
    projectId: str | None = None
    type: str
    name: str
    mimeType: str
    size: int
    url: str
    path: str
    summary: str = ""
    tags: list[str] = Field(default_factory=list)
    embedding: list[float] = Field(default_factory=list)
    slices: list[MaterialSlice] = Field(default_factory=list)
    createdAt: str
    updatedAt: str


class Scene(BaseModel):
    id: str
    projectId: str
    scriptId: str
    order: int
    title: str
    visual: str
    camera: str
    voiceover: str
    subtitle: str
    bgm: str
    durationSec: int
    materialId: str | None = None
    materialSliceId: str | None = None
    generationMode: Literal["material_mix", "text_to_video", "image_to_video", "mock"] = "mock"
    tags: list[str] = Field(default_factory=list)
    createdAt: str
    updatedAt: str


class Script(BaseModel):
    id: str
    projectId: str
    productId: str
    title: str
    narrative: str
    hook: str
    style: str
    strategy: str
    constraints: list[str]
    scenes: list[Scene]
    createdAt: str
    updatedAt: str


class RenderScene(BaseModel):
    sceneId: str
    order: int
    durationSec: int
    visual: str
    camera: str = ""
    subtitle: str
    voiceover: str
    materialUrl: str | None = None
    bgColor: str | None = None


class RenderAudio(BaseModel):
    bgm: str = "clean-pop"
    tts: bool = True


class RenderPlan(BaseModel):
    ratio: Literal["9:16", "16:9"] = "9:16"
    resolution: Literal["720p", "1080p"] = "720p"
    totalDurationSec: int
    scenes: list[RenderScene]
    audio: RenderAudio = Field(default_factory=RenderAudio)


class GenerationTrace(BaseModel):
    id: str
    jobId: str | None = None
    projectId: str | None = None
    node: str
    status: Literal["started", "succeeded", "failed"]
    message: str
    input: Any | None = None
    output: Any | None = None
    createdAt: str


class GenerateScriptRequest(BaseModel):
    projectId: str
    scriptId: str
    product: Product
    materials: list[Material] = Field(default_factory=list)


class GenerateScriptResponse(BaseModel):
    script: Script
    scenes: list[Scene]
    renderPlan: RenderPlan
    trace: list[GenerationTrace]
