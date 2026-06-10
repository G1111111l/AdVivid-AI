# Final Acceptance Checklist

## Runtime

- Web: `http://localhost:5173`
- API: `http://localhost:4000/api/health`
- Python Agent: `http://localhost:8002/health`

## P0 Flow

1. Create or select a project in the left sidebar.
2. Fill product title, selling points, target audience, scenario, creative brief, strategy, and target duration.
3. Click `生成剧本`.
4. Open `任务` to watch the script-generation job and trace.
5. Return to `创作台` and edit scenes.
6. Select render ratio/resolution in `任务`, then click `一键成片` or `新任务`.
7. Preview and export the generated video.

## P1 Flow

- Choose one of five script strategies: 场景种草, 痛点开场, 测评对比, 开箱演示, 生活方式.
- Upload image or video materials.
- Re-analyze or delete materials from the material library.
- View material tags, summaries, and video slices.
- Use scene-level editing for title, visual, camera, voiceover, subtitle, duration, material binding, reorder, regeneration, and single-scene preview.
- Use the creative brief field to generate a new script direction without code changes.
- Export render jobs as 9:16 or 16:9, 720p or 1080p.
- View job progress, retry failed jobs, and inspect generation traces.
- View mock analytics charts for hook, style factor, CTR, and conversion.

## Stability

- Frontend API client retries local API candidates and shows a clear connection diagnostic instead of raw `Failed to fetch`.
- Python LangGraph Agent is preferred for script generation.
- Text/video model calls keep local fallback behavior for demo stability.
- Seedance segmented rendering can generate approximately 15-20 second videos when credentials are configured.
- FFmpeg fallback can render local demo videos without external video generation.

## Verification Commands

```bash
npm run check --workspaces --if-present
npm run lint
npm run build
node scripts/run-e2e-real-models.mjs
```

Use real video generation only when you intentionally want to spend video quota:

```bash
node scripts/run-e2e-real-models.mjs --render --seedance
```
