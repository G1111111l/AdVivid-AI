# Deployment

This project has two running modes:

```text
local learning mode
  -> npm scripts
  -> JSON store by default
  -> optional local Redis/PostgreSQL

production demo mode
  -> Docker Compose
  -> PostgreSQL + pgvector
  -> Redis + BullMQ worker
  -> Python LangGraph Agent
  -> Nginx gateway
```

## Local Learning Mode

Use this when you are still reading the code and changing features:

```bash
npm install
npm run setup:python
npm run dev
```

Open:

- Web: `http://localhost:5173`
- API: `http://localhost:4000/api/health`
- Python Agent: `http://localhost:8002/health`

For the queue version:

```bash
npm run dev:queue
```

Set `QUEUE_DRIVER=bullmq` and start Redis before using this mode.

## Production Demo Mode

Use this when you want a closer-to-submission deployment:

```bash
copy .env.example .env
docker compose --env-file .env -f infra/docker/docker-compose.prod.yml up --build -d
```

On Windows, prefer the helper scripts first:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/check-docker-env.ps1
powershell -ExecutionPolicy Bypass -File scripts/start-prod-compose.ps1
```

`start-prod-compose.ps1` refuses to continue when it detects Docker Desktop's default WSL disk under the user profile, because Docker image layers may then be downloaded outside `E:/envment`. Move Docker Desktop's disk image location to `E:/envment` before pulling images, or rerun with `-AllowDockerDefaultDataRoot` only if you accept the current Docker data location.

Open:

- Web: `http://localhost`
- API through Nginx: `http://localhost/api/health`

The production Compose file starts:

- `postgres`: PostgreSQL with pgvector.
- `redis`: queue backend.
- `agent-python`: Python FastAPI + LangGraph service.
- `api`: Fastify API with Prisma.
- `worker`: BullMQ worker for material analysis, script generation, and video rendering.
- `web`: static React build served by Nginx.
- `nginx`: public gateway.

## Windows Data Location

Runtime service data is stored under `ENVMENT_DIR`, which defaults to:

```text
E:/envment
```

The production Compose file uses this directory for:

- PostgreSQL data.
- Redis append-only data.
- npm cache.
- Prisma engine cache.
- pip cache.
- uploaded materials.
- generated videos.
- local data fallback.

## Environment Checklist

Required for stable production demo:

```bash
STORE_DRIVER=prisma
QUEUE_DRIVER=bullmq
AGENT_RUNTIME=python
PYTHON_AGENT_URL=http://agent-python:8001
DATABASE_URL=postgresql://advivid:advivid@postgres:5432/advivid
REDIS_URL=redis://redis:6379
VITE_API_BASE_URL=/api
```

For real model calls, also set:

```bash
USE_MOCK_AI=false
ARK_API_KEY=
ARK_TEXT_ENDPOINT=
ARK_VIDEO_ENDPOINT=
VIDEO_RENDER_PROVIDER=auto
```

Keep real keys only in `.env`. Do not put them in `.env.example`, README, screenshots, or commit history.

After updating model credentials, run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/check-ark-models.ps1
```

This checks Ark credentials and sends a small text-model request. It does not create a Seedance video task. To test real Seedance output explicitly, run:

```powershell
python apps/agent-python/scripts/test_seedance_video.py --wait-seconds 420 --poll-seconds 8
```

To verify that the Python LangGraph Agent itself can use the Ark text endpoint, run:

```powershell
python apps/agent-python/scripts/test_agent_graph.py --require-ark
```

## Useful Commands

Start:

```bash
docker compose --env-file .env -f infra/docker/docker-compose.prod.yml up --build -d
```

View logs:

```bash
docker compose --env-file .env -f infra/docker/docker-compose.prod.yml logs -f api worker agent-python
```

Stop:

```bash
docker compose --env-file .env -f infra/docker/docker-compose.prod.yml down
```

Reset local service data only when you are sure you no longer need the demo database and generated files: stop the stack, then manually delete the corresponding folders under `E:/envment`.

## Cloud Server Notes

On a single cloud server:

1. Install Docker and Docker Compose.
2. Clone the repository.
3. Create `.env` from `.env.example`.
4. Fill `ARK_API_KEY`, text endpoint, and video endpoint only on the server.
5. Set `PUBLIC_WEB_ORIGIN` to your domain or server IP.
6. Run the production Compose command.
7. Open port `80` in the cloud firewall.

For a real domain, point the domain to the server IP and later add HTTPS with a standard Nginx/Certbot setup.
