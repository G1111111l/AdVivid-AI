# 小白上手路线

这份文档用来回答三个问题：

1. 现在项目做到计划里的哪一步。
2. 每个文件夹负责什么。
3. 接下来应该按什么顺序学习和继续开发。

## 当前处于哪一步

当前项目不是空架子，已经进入 **P1 功能增强阶段**。

按照最初 16 步计划来看，状态大致是：

| 原计划步骤 | 当前状态 | 说明 |
| --- | --- | --- |
| 第 1 步：基础环境与仓库初始化 | 已完成 | monorepo、web、api、worker、shared、agent、video 目录都已建立 |
| 第 2 步：数据库和基础 API | 已完成基础版 | 基础 API 已有；默认 JSON store，可通过 `STORE_DRIVER=prisma` 切换 PostgreSQL/Prisma |
| 第 3 步：前端基础框架 | 已完成 MVP | 已有商家工作台、素材库、任务页、看板页 |
| 第 4 步：素材上传与存储 | 已完成 MVP | 支持上传图片/视频到本地 uploads，并保存素材记录 |
| 第 5 步：P0 剧本生成 | 已完成 MVP | 可以通过 Python Agent 生成剧本和分镜 |
| 第 6 步：LangGraph 创作 Agent | 已完成基础版 | 已改为 Python FastAPI + LangChain + LangGraph |
| 第 7 步：任务队列与进度 | 部分完成 | 已支持本地 runner 和 BullMQ/Redis worker 两种模式 |
| 第 8 步：一键成片 Mock 闭环 | 已完成 MVP | 本地 FFmpeg 可生成 9:16 mp4 |
| 第 9 步：字幕、BGM、TTS | 已完成基础版 | FFmpeg 兜底视频已有安全区字幕、BGM 混音和 mock TTS 旁白占位 |
| 第 10 步以后 | 待做 | 素材切片、Embedding、真实队列、数据库、部署、包装材料 |

P1 当前进度：

| P1 子任务 | 当前状态 | 说明 |
| --- | --- | --- |
| P1-1：拆分前端结构 | 已完成 | `App.tsx` 已拆成 pages、components、utils 和 appConfig |
| P1-2：真实 Seedance 接入渲染流程 | 已完成 | `/api/videos/render` 会按配置尝试 Seedance，并在失败时回退 FFmpeg |
| P1-3：分镜级编辑增强 | 已完成基础版 | 已支持分镜绑定/替换素材、单分镜重生成、单分镜预览渲染 |
| P1-4：素材结构化 | 部分完成 | 已支持素材摘要、标签、视频切片、切片缩略图展示 |
| P1-5：Embedding 检索 | 部分完成 | 已支持本地 mock embedding、混合检索、分镜推荐素材 |
| P1-6：任务队列 | 已完成基础版 | 已支持本地模式和 BullMQ/Redis worker 模式，覆盖素材分析、剧本生成、视频渲染三类任务 |
| P1-7：数据库接入 | 已完成基础版 | 已支持 Prisma + PostgreSQL，并保留 JSON store 作为零配置演示模式 |

一句话总结：

```text
现在已经跑通了“商品信息 -> AI 剧本/分镜 -> 一键渲染 -> 预览导出”的本地 MVP。
并且已经进入 P1：前端结构已拆分，真实 Seedance 渲染已接入主流程且保留 FFmpeg 兜底。
```

## 当前项目怎么分层

```text
apps/web
  React 前端。商家看到和操作的页面都在这里。

apps/api
  Node.js / Fastify 后端。负责 API、上传、项目数据、任务状态、调用 Python Agent、调用渲染逻辑。

apps/agent-python
  Python AI 服务。负责 LangChain / LangGraph 创作流程。

apps/worker
  BullMQ Worker 服务。QUEUE_DRIVER=bullmq 时负责消费视频渲染任务。

packages/shared
  前后端共享 TypeScript 类型和 Zod schema。

packages/video
  本地 FFmpeg 视频合成逻辑。

packages/agent
  TypeScript Agent 兜底版本。当前主线已转为 Python，可先不重点学习。

docs
  架构、API、演示脚本、学习路线文档。

infra
  Docker、Nginx、部署相关配置。

data / uploads / rendered
  运行时目录。分别存本地数据、上传素材、生成视频。
```

## 推荐学习顺序

### 1. 先学会启动和验证

运行：

```bash
npm run dev
```

会同时启动：

```text
Web 前端：http://localhost:5173
Node API：http://localhost:4000
Python Agent：http://localhost:8002
```

你要理解：

```text
浏览器页面来自 apps/web。
页面按钮请求 apps/api。
apps/api 再调用 apps/agent-python 或 packages/video。
```

### 2. 看前端入口

先看：

```text
apps/web/src/App.tsx
apps/web/src/api/client.ts
```

学习目标：

```text
知道页面有哪几个 tab。
知道“生成剧本”“一键成片”“上传素材”按钮分别调用哪个 API。
```

### 3. 看后端 API

先看：

```text
apps/api/src/server.ts
apps/api/src/services/store.ts
apps/api/src/services/renderRunner.ts
```

学习目标：

```text
知道 /api/projects、/api/materials、/api/scripts/generate、/api/videos/render、/api/jobs/:id 分别做什么。
```

### 4. 看 Python Agent

先看：

```text
apps/agent-python/app/main.py
apps/agent-python/app/graphs/creative_graph.py
apps/agent-python/app/nodes.py
apps/agent-python/app/schemas.py
```

学习目标：

```text
理解 LangGraph 是怎么把多个 AI 节点串起来的。
```

当前节点顺序：

```text
ProductAnalyzer
 -> MaterialRetriever
 -> StrategySelector
 -> ScriptWriter
 -> ScenePlanner
 -> ReviewAgent
 -> RenderPlanner
```

### 5. 看视频生成

先看：

```text
packages/video/src/index.ts
apps/api/src/services/renderRunner.ts
```

再看真实视频模型测试脚本：

```text
apps/agent-python/scripts/test_seedance_video.py
```

学习目标：

```text
理解当前有两条视频路线：
1. 本地 FFmpeg 兜底视频，稳定适合演示。
2. 火山 Seedance 真实视频生成，效果更强但消耗额度。
```

### 6. 最后再看工程化

后面再学：

```text
Prisma / PostgreSQL
Redis / BullMQ
Docker
Nginx
云服务器部署
```

这些是把项目从本地 MVP 升级为可部署系统的内容，不建议一开始就钻进去。

## 下一步开发顺序

### 已完成：整理 P0 主链路

目标：

```text
让本地 Demo 从创建项目到导出视频稳定跑通。
```

要做：

```text
1. 确认中文文案和视频字幕不乱码。
2. 确认 Python Agent 输出结构稳定。
3. 确认生成剧本后 scenes 能正确保存和编辑。
4. 确认一键成片任务进度和导出可用。
```

### 已完成：拆分前端 App.tsx

当前 `apps/web/src/App.tsx` 已经很大，适合 Demo，但不适合学习。

已经拆成：

```text
pages/StudioPage.tsx
pages/MaterialsPage.tsx
pages/JobsPage.tsx
pages/AnalyticsPage.tsx
components/TraceList.tsx
components/VideoPreview.tsx
components/MaterialPreview.tsx
components/AnalyticsPanel.tsx
components/ui.tsx
```

效果：

```text
你以后能更容易看懂每个页面的职责。
```

### 已完成：把真实 Seedance 接进渲染流程

当前已经通过脚本测试了真实视频生成 key。

现在 `/api/videos/render` 已经支持：

```text
优先调用 Seedance
  -> 成功：保存真实生成视频
  -> 失败：回退本地 FFmpeg 兜底视频
```

效果：

```text
演示时既有真实 AIGC 能力，又不会因为模型失败导致整个系统不可用。
```

### 部分完成：增强分镜级编辑

目标：

```text
让用户可以更细地控制每个分镜，而不是只编辑文字。
```

建议做：

```text
1. 分镜绑定素材。已完成
2. 支持替换单个分镜素材。已完成
3. FFmpeg 兜底渲染使用绑定素材作为画面。已完成
4. 支持单分镜重新生成文案和画面描述。已完成
5. 支持基于当前分镜重新生成渲染计划。已完成单镜预览版
```

效果：

```text
系统会更像“可编辑的电商创作工作台”，而不是一次性黑盒生成工具。
```

### 部分完成：素材结构化

目标：

```text
让上传素材不只是一个文件，而是带有标签、摘要、切片和可检索信息的资产。
```

建议做：

```text
1. 图片素材生成更稳定的标签和摘要。已完成基础版
2. 视频素材用 FFmpeg 抽帧或切片。已完成基础版
3. 每个视频切片保存时间段、缩略图、摘要、标签。已完成基础版
4. 前端素材库展示切片结果。已完成
5. 后续让分镜自动推荐素材。已在 P1-5 完成基础版
```

### 部分完成：Embedding 检索和素材召回

目标：

```text
让系统可以根据“场景、卖点、分镜需求”自动找到合适素材。
```

建议做：

```text
1. 先保留当前本地 embedding mock。已完成
2. 实现素材和切片的混合检索评分。已完成
3. 让 MaterialRetriever 使用切片级结果。已完成基础版
4. 前端在分镜编辑器里显示“推荐素材”。已完成
5. 后面再升级为 PostgreSQL + pgvector。待做
```

### 部分完成：任务队列

目标：

```text
把当前 API 进程内执行的长任务，迁移到 Redis + BullMQ + worker。
```

建议做：

```text
1. 接入 Redis 连接配置。已完成
2. 建立 material-analysis / script-generation / video-render 队列。已完成
3. /api/materials、/api/scripts/generate、/api/videos/render 创建 job 并入队。已完成
4. apps/worker 消费三类队列。已完成
5. 前端继续通过 /api/jobs/:id 查询进度。已完成
6. 失败任务可按 taskType 回到对应队列重试。已完成
```

运行方式：

```text
QUEUE_DRIVER=local
  npm run dev

QUEUE_DRIVER=bullmq
  先启动 Redis
  npm run dev:queue
```

### 已完成基础版：接数据库

当前默认仍然使用本地 JSON 文件，适合本地演示。

同时已经可以切换到：

```text
Prisma + PostgreSQL
```

当前能力：

```text
Prisma schema 已完成基础版。
@prisma/client / prisma 已安装。
Prisma Client 已生成。
apps/api/src/services/prismaStore.ts 已实现。
STORE_DRIVER=json 使用本地文件。
STORE_DRIVER=prisma 使用 PostgreSQL。
Docker Compose 的 Postgres/Redis 数据目录默认放在 E:/envment。
```

效果：

```text
项目数据更接近真实后端系统。
```

### 已完成基础版：接任务队列

当前任务支持两种执行方式。

默认本地模式：

```text
QUEUE_DRIVER=local
API 创建 job
API 进程内异步执行任务
适合零配置演示
```

BullMQ 模式：

```text
Redis + BullMQ + apps/worker
API 创建 job 并入队
worker 消费 material-analysis / script-generation / video-render
前端通过 /api/jobs/:id 轮询进度
```

效果：

```text
长任务更稳定，API 不负责真正执行耗时任务。
```

## 现在最应该做什么

当前最推荐继续做：

```text
继续补充云端部署、演示材料，或者增强真实 TTS / 对象存储。
```

原因：

```text
P1 的 AI 和素材亮点已经有了基础闭环。
下一步补任务队列，可以明显提升工程完整度，也更符合“长任务稳定体验”的项目亮点。
```
