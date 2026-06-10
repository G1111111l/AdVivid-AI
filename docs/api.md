# API

## Health

- `GET /api/health`
- `GET /api/models/status`
- Python Agent: `GET http://localhost:8002/health`
- Python Agent generation: `POST http://localhost:8002/agent/generate-script`

`GET /api/models/status` returns safe runtime flags only, such as whether text/video endpoints are configured, whether mock AI is enabled, queue driver, store driver, and whether Seedance will be attempted. It never returns API keys or endpoint ids.

## Products

- `GET /api/products`
- `POST /api/products`
- `GET /api/products/:id`
- `PATCH /api/products/:id`

Product input supports `creativeBrief` for Prompt fine-tuning:

```json
{
  "title": "便携冷萃咖啡杯",
  "sellingPoints": ["一杯完成冷萃", "防漏随身携带"],
  "targetAudience": "通勤上班族",
  "scenario": "地铁站、办公室、健身后",
  "style": "场景种草",
  "creativeBrief": "剧情要连续，商品贯穿每个镜头，结尾轻 CTA。",
  "durationSec": 20
}
```

## Projects

- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:id`
- `GET /api/projects/:id/scenes`

## Materials

- `GET /api/materials?projectId=`
- `POST /api/materials?type=product_image&projectId=`
- `GET /api/materials/search?q=&projectId=`
- `GET /api/materials/:id`
- `POST /api/materials/:id/analyze`
- `DELETE /api/materials/:id`

After the material-analysis job succeeds, materials contain structured metadata:

```text
summary
tags
embedding
slices[]
```

For video materials, `slices[]` contains timeline ranges, generated thumbnails, slice summaries, tags, and mock embeddings.

`POST /api/materials` now returns the raw material record plus a material-analysis job:

```json
{
  "material": {},
  "job": {
    "taskType": "material_analysis",
    "status": "queued"
  },
  "queue": {
    "driver": "local",
    "queueName": "material-analysis"
  }
}
```

Poll `GET /api/jobs/:id` until the job succeeds, then reload the project or material list to see summary, tags, and slices.

## Scripts and Scenes

- `POST /api/scripts/generate`
- `GET /api/scripts/:id`
- `PATCH /api/scripts/:id`
- `POST /api/scripts/:id/regenerate`
- `PATCH /api/scenes/:id`
- `POST /api/scenes/:id/regenerate`
- `POST /api/scenes/:id/render-preview`
- `POST /api/scenes/reorder`
- `GET /api/scenes/:id/material-recommendations?limit=6`

`PATCH /api/scenes/:id` can update text fields, duration, order-adjacent metadata, and scene material binding:

```json
{
  "materialId": "material-id",
  "materialSliceId": "optional-slice-id",
  "generationMode": "material_mix"
}
```

Set `materialId` to an empty string to unbind the scene material.

`POST /api/scripts/generate` returns a script-generation job instead of blocking the HTTP request until the Agent completes:

```json
{
  "project": {},
  "product": {},
  "job": {
    "taskType": "script_generation",
    "status": "queued"
  },
  "queue": {
    "driver": "bullmq",
    "queueName": "script-generation"
  }
}
```

After the job succeeds, reload `GET /api/projects/:id` to receive the saved script and scenes.

`POST /api/scenes/:id/regenerate` rewrites the selected scene only. It uses Ark text generation when configured and falls back to a local scene rewrite when model calls are disabled or fail.

`POST /api/scenes/:id/render-preview` creates a render job for the selected scene only. The result appears in the same job/progress/video preview flow as full-video rendering.

`GET /api/scenes/:id/material-recommendations` returns scene-level recommendations from local hybrid retrieval:

```json
[
  {
    "material": {},
    "slice": {},
    "score": 5.4,
    "reasons": ["关键词匹配：detail", "推荐切片：3s-6s"]
  }
]
```

## Videos and Jobs

- `POST /api/videos/render`
- `GET /api/videos/:id`
- `GET /api/videos/:id/export`
- `GET /api/jobs/:id`
- `POST /api/jobs/:id/retry`
- `GET /api/jobs/:id/traces`

`POST /api/videos/render` uses the backend render provider setting:

```text
VIDEO_RENDER_PROVIDER=auto | seedance | ffmpeg
```

Request body:

```json
{
  "projectId": "project-id",
  "scriptId": "optional-script-id",
  "ratio": "9:16",
  "resolution": "720p"
}
```

`ratio` accepts `9:16` or `16:9`; `resolution` accepts `720p` or `1080p`.

When Seedance is enabled, the job trace records `SeedanceRenderer`. If Seedance fails, the same job falls back to local FFmpeg and still returns a playable/exportable result when FFmpeg succeeds.

The local FFmpeg fallback uses the render plan fields:

```text
audio.bgm
audio.tts
audio.bgmVolume
audio.voiceVolume
subtitleStyle.position
subtitleStyle.maxCharsPerLine
subtitleStyle.maxLines
subtitleStyle.fontScale
subtitleStyle.boxOpacity
```

These fields control styled subtitles, low-volume BGM, and mock narration in the exported mp4.

Render job execution uses:

```text
QUEUE_DRIVER=local | bullmq
```

In `local` mode, the API process executes the job processor directly. In `bullmq` mode, the API enqueues `{ jobId }` into the matching Redis queue; `apps/worker` consumes the queue and updates the same job record.

Current task queues:

```text
material-analysis
script-generation
video-render
```

## Analytics

- `GET /api/analytics/mock`
- `GET /api/analytics/projects/:id`
