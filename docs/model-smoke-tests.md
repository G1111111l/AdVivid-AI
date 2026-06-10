# Model Smoke Tests

This document records how to safely verify the external model integrations without exposing credentials.

## Text Model

Run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/check-ark-models.ps1
```

What it checks:

- `.env` exists.
- `ARK_API_KEY` is set.
- `ARK_TEXT_ENDPOINT` is set.
- `ARK_VIDEO_ENDPOINT` is set.
- A small JSON-only chat completion request succeeds.

The script prints only `set=true` and value lengths. It does not print API keys or endpoint ids.

## Python LangGraph Agent

Run:

```powershell
python apps/agent-python/scripts/test_agent_graph.py --require-ark
```

What it checks:

- Python Agent can load `.env`.
- LangGraph can execute the full creative workflow.
- `ScriptWriter` uses Ark instead of fallback.
- `ScenePlanner` uses Ark instead of fallback.
- The result contains valid scenes and a render plan.

Successful local result on 2026-06-09:

```text
ScriptWriter source: ark
ScenePlanner source: ark
scenes: 7
total duration: 24s
```

## Seedance Video

Run only when you accept real video-generation usage:

```powershell
python apps/agent-python/scripts/test_seedance_video.py --wait-seconds 420 --poll-seconds 8
```

What it checks:

- Seedance task creation succeeds.
- Polling reaches `succeeded`.
- The generated video URL can be downloaded.
- Output is saved under `rendered/seedance-tests/`.

Successful local result on 2026-06-09:

```text
task status: succeeded
duration: 5.05s
resolution: 720x1280
fps: 24
audio: AAC stereo
output: rendered/seedance-tests/20260609-015139-cgt-20260609015139-pxfwx.mp4
preview: rendered/seedance-tests/20260609-015139-cgt-20260609015139-pxfwx-preview.jpg
```

The generated files are runtime artifacts and are ignored by Git.

## Full API E2E

Run script generation only:

```powershell
node scripts/run-e2e-real-models.mjs
```

Run script generation and create a real Seedance render task:

```powershell
node scripts/run-e2e-real-models.mjs --render --seedance
```

This script calls the local API instead of importing server internals, so it verifies the same route path that the React app uses. Keep it as a manual smoke test because `--render --seedance` consumes real video-generation usage.

When `.env` uses `SEEDANCE_RENDER_MODE=segments`, one full render may create multiple 5-second Seedance tasks and then concatenate them into a 15-20 second video. For lower-cost smoke tests, use `SEEDANCE_RENDER_MODE=single`.

## Safety Rules

- Keep real keys only in `.env`.
- Do not paste `.env` into screenshots, docs, README, or commits.
- Do not run the Seedance script in loops.
- Use `VIDEO_RENDER_PROVIDER=ffmpeg` for stable no-cost demos.
- Use `VIDEO_RENDER_PROVIDER=auto` when you want the app to try Seedance and fall back to FFmpeg.
