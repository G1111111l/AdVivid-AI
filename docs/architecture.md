# Architecture

```text
apps/web
  React merchant studio

apps/api
  Fastify HTTP API
  Projects, materials, scripts, scenes, render jobs, exports

apps/agent-python
  Python FastAPI + LangChain + LangGraph creative workflow
  ProductAnalyzer -> MaterialRetriever -> StrategySelector
  -> ScriptWriter -> ScenePlanner -> ReviewAgent -> RenderPlanner

packages/agent
  TypeScript Agent fallback

packages/video
  FFmpeg rendering, styled subtitles, mock TTS, BGM mix, output files

packages/shared
  Shared TypeScript types and Zod schemas
```

## Current MVP Data Flow

```text
Create project
  -> Upload materials
  -> Analyze material metadata
  -> Generate script through Python LangGraph
  -> Persist script, scenes, trace
  -> Edit scenes and bind materials
  -> Submit script/material/render jobs
  -> Local runner or BullMQ worker consumes long jobs
  -> Seedance renders real video when enabled
  -> FFmpeg renders fallback mp4 using bound material visuals when available
  -> Preview/export video
```

## Video Render Strategy

The render API uses a safe provider switch:

```text
VIDEO_RENDER_PROVIDER=auto
  -> if USE_MOCK_AI=false and ARK video credentials exist, try Seedance first
  -> otherwise use local FFmpeg

VIDEO_RENDER_PROVIDER=seedance
  -> always try Seedance first
  -> fall back to FFmpeg on errors, timeout, or missing result URL

VIDEO_RENDER_PROVIDER=ffmpeg
  -> always use local FFmpeg
```

Seedance task metadata is written under each render job folder in `rendered/`. Secrets are read only from `.env` and are not returned to the frontend.

## Scene-Level Material Binding

Each scene can store `materialId` and `materialSliceId`. The studio page lets the merchant bind or replace the material for a selected scene.

When a render job is created, the API resolves scene `materialId` values into `materialUrl` entries in the render plan. The local FFmpeg renderer uses those image or video files as the visual background for each scene. Scenes without bound materials still use the generated color-card fallback.

The local FFmpeg renderer also adds a complete demo audio/subtitle layer:

```text
subtitleStyle
  -> safe bottom subtitle area
  -> auto line wrapping
  -> readable translucent background box

audio.bgm
  -> low-volume mock BGM bed

audio.tts
  -> mock voiceover tone track
  -> mixed with BGM through FFmpeg amix
```

Each scene writes sidecar text files for title, subtitle, and voiceover under the render job folder. This keeps the FFmpeg command safe from shell quoting problems and makes generated assets easier to inspect.

The scene editor also supports two scene-level actions:

```text
POST /api/scenes/:id/regenerate
  -> rewrites only the selected scene
  -> uses Ark when configured, otherwise local fallback

POST /api/scenes/:id/render-preview
  -> creates a one-scene render job
  -> reuses the same job polling and video preview flow
```

## Material Structuring

Uploaded materials are analyzed before they are saved:

```text
image
  -> summary
  -> tags
  -> one image slice
  -> mock embedding

video
  -> summary
  -> tags
  -> 4 timeline slices
  -> FFmpeg thumbnail per slice
  -> slice summary, tags, mock embedding
```

Slice thumbnails are written to `uploads/material-slices/{materialId}/` and served through `/uploads/...`. If a video is shorter than the planned slice timestamp, the analyzer falls back to an early frame so the UI still has a thumbnail.

## Local Hybrid Retrieval

Before PostgreSQL + pgvector is introduced, the project uses a local hybrid retrieval layer:

```text
scene text
  -> title + visual + subtitle + voiceover + tags
  -> keyword tokens
  -> mock embedding

materials and slices
  -> name + summary + tags + slice summary
  -> keyword score
  -> tag score
  -> cosine similarity over mock embeddings
  -> ranked recommendations
```

The studio page calls `GET /api/scenes/:id/material-recommendations` and shows recommended materials directly in the scene editor. Applying a recommendation writes `materialId` and `materialSliceId` back to the scene.

## Long Task Queue

The project supports two long-task execution modes:

```text
QUEUE_DRIVER=local
  -> API creates the job record
  -> API process runs the matching processor directly
  -> best for zero-setup local demos

QUEUE_DRIVER=bullmq
  -> API creates the job record
  -> API enqueues { jobId } into Redis
  -> apps/worker consumes the matching queue
  -> frontend keeps polling /api/jobs/:id
```

Current queues:

```text
material-analysis
  -> analyzes uploaded materials
  -> writes summary, tags, embeddings, slices

script-generation
  -> runs Python LangGraph Agent or TypeScript fallback
  -> writes script, scenes, trace

video-render
  -> tries Seedance when enabled
  -> falls back to FFmpeg
  -> writes generated video
```

The default MVP still uses a local JSON store because it is the fastest zero-setup demo path. The API can also switch to Prisma + PostgreSQL through `STORE_DRIVER=prisma`, which lets the API and BullMQ worker share project, job, trace, material, script, and video state through the database.

## Production Upgrade Path

- Use `STORE_DRIVER=prisma` as the deployment store.
- Use `infra/docker/docker-compose.prod.yml` for the production-demo topology: Nginx, static web, API, worker, Python Agent, PostgreSQL/pgvector, and Redis.
- Upgrade retrieval from `embeddingJson` mock vectors to pgvector similarity queries.
- Add dedicated concurrency and retry policies per queue.
- Store uploaded and generated assets in object storage.
- Expand Ark/Seedance model adapters for scene-level regeneration and image-to-video.
- Add LangGraph checkpointing for long-running Agent workflows.
