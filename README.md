# AdVivid AI

An AIGC commerce video studio for the challenge project. The MVP supports product setup, material upload, material analysis, Python LangGraph script generation, scene editing, one-click rendering, progress tracing, preview/export, and mock analytics.

## Demo Video

<video src="https://github.com/G1111111l/AdVivid-AI/raw/main/docs/assets/seedance-output.mp4" controls width="360"></video>

[Open demo video](docs/assets/seedance-output.mp4)

## Tech Stack

- Frontend: React, Vite, TypeScript, TailwindCSS, ECharts, lucide-react
- Backend: Node.js, TypeScript, Fastify
- Agent: Python, FastAPI, LangChain, LangGraph, Pydantic
- Video: ffmpeg-static, FFmpeg render pipeline with styled subtitles, BGM, and mock TTS audio
- Real video model: Volcengine Ark / Seedance async task API with FFmpeg fallback
- Data: local JSON store by default, optional Prisma + PostgreSQL/pgvector store
- Queue: local async runner by default, optional BullMQ/Redis worker for material analysis, script generation, and video rendering

## Quick Start

```bash
npm install
npm run setup:python
npm run dev
```

Open:

- Web: http://122.51.232.163
- API health: http://localhost:4000/api/health
- Python Agent health: http://localhost:8002/health

The local MVP writes runtime files into `data/`, `uploads/`, and `rendered/`. These folders are ignored by Git.
`STORE_DRIVER=json` is the default because it needs no database.

For PostgreSQL persistence, start Postgres/Redis with Docker Compose or your own local services, set `STORE_DRIVER=prisma`, then initialize the schema:

```bash
npm run db:push
npm run dev
```

For Redis-backed long jobs, start Redis, set `QUEUE_DRIVER=bullmq`, and run:

```bash
npm run dev:queue
```

## Demo Flow

1. Create a product project from the studio page.
2. Upload product images or videos in the material library.
3. Generate a script. The API creates a script-generation job, then Node/Python runs the LangGraph creative workflow.
4. Edit scene subtitles, voiceover, visual descriptions, or duration.
5. Submit one-click rendering. The API can try Seedance first and fall back to local FFmpeg with subtitles, BGM, and mock narration.
6. Watch job progress and trace.
7. Preview and export the generated video.
8. Open the analytics panel to view mock creative-factor performance.

## Project Docs

- [Architecture](docs/architecture.md)
- [API overview](docs/api.md)
- [Demo script](docs/demo-script.md)
- [Database plan](docs/database-plan.md)
- [Deployment](docs/deployment.md)
- [Model smoke tests](docs/model-smoke-tests.md)
- [Final acceptance checklist](docs/final-acceptance.md)

The project is currently in the P1 enhancement stage. The local end-to-end flow already exists, Seedance rendering is wired behind a safe fallback, BullMQ/Redis queues are available for material analysis, script generation, and rendering, and PostgreSQL persistence can be enabled through Prisma. A production-demo Docker Compose setup is available under `infra/docker/docker-compose.prod.yml`. Object storage is still a planned upgrade.

## Production Demo

For a closer-to-submission stack:

```bash
docker compose --env-file .env -f infra/docker/docker-compose.prod.yml up --build -d
```

This starts Nginx, static React web, Fastify API, BullMQ worker, Python LangGraph Agent, PostgreSQL/pgvector, and Redis. Runtime service data and caches are kept under `ENVMENT_DIR`, which defaults to `E:/envment`.

On Windows, run `powershell -ExecutionPolicy Bypass -File scripts/check-docker-env.ps1` before starting Docker. This checks Docker availability and prepares the `E:/envment` runtime folders.

After changing Ark credentials in `.env`, run `powershell -ExecutionPolicy Bypass -File scripts/check-ark-models.ps1` to verify the text model without creating a Seedance video task.
Run `python apps/agent-python/scripts/test_agent_graph.py --require-ark` when you want to verify the full Python LangGraph text-generation path.

## Environment

Copy `.env.example` to `.env` and fill only local/private values. Never commit real API keys.

Important variables:

```bash
API_PORT=4000
VITE_API_BASE_URL=http://localhost:4000
AGENT_RUNTIME=python
PYTHON_AGENT_URL=http://localhost:8002
PYTHON_AGENT_TIMEOUT_SECONDS=240
STORE_DRIVER=json
DATABASE_URL=postgresql://advivid:advivid@localhost:5432/advivid
ENVMENT_DIR=E:/envment
REDIS_URL=redis://localhost:6379
QUEUE_DRIVER=local
RENDER_WORKER_CONCURRENCY=1
USE_MOCK_AI=true
ARK_API_KEY=
ARK_TEXT_ENDPOINT=
ARK_VIDEO_ENDPOINT=
ARK_TEXT_RETRIES=2
VIDEO_RENDER_PROVIDER=auto
SEEDANCE_WAIT_SECONDS=420
SEEDANCE_POLL_SECONDS=8
SEEDANCE_TARGET_DURATION_SECONDS=5
SEEDANCE_RENDER_MODE=single
SEEDANCE_TOTAL_DURATION_SECONDS=20
SEEDANCE_SEGMENT_DURATION_SECONDS=5
SEEDANCE_MAX_SEGMENTS=4
```

`VIDEO_RENDER_PROVIDER` accepts:

- `auto`: use Seedance only when `USE_MOCK_AI=false` and video credentials exist.
- `seedance`: always try Seedance first, then fall back to FFmpeg if it fails.
- `ffmpeg`: always use the local FFmpeg renderer.

`SEEDANCE_RENDER_MODE=segments` creates multiple 5-second Seedance clips from the scene plan and concatenates them into an approximately 15-20 second complete video. Keep `single` when you want to spend only one video-generation task.

`QUEUE_DRIVER` accepts:

- `local`: API runs long jobs directly, best for zero-setup demos.
- `bullmq`: API enqueues long jobs into Redis and `apps/worker` consumes material-analysis, script-generation, and video-render queues.

## Architecture

```text
React Web
  -> Fastify API
    -> Local JSON store or Prisma PostgreSQL store
    -> Upload and render storage
    -> Python FastAPI LangGraph Agent
    -> Local task runner or BullMQ Redis queues
    -> Seedance async video task client
    -> FFmpeg video renderer
```

The Node API prefers the Python Agent when `AGENT_RUNTIME=python`. If the Python service is unavailable, it falls back to the TypeScript mock Agent so demos do not break.

## Safety

- API keys live only in `.env`.
- Do not put real keys in `.env.example`.
- Frontend never receives model credentials.
- Uploaded files are stored under `uploads/`.
- Runtime artifacts are ignored by Git.
- Agent outputs are represented through Pydantic/Zod-compatible schemas.
