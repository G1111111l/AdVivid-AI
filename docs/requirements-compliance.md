# 赛题要求对照表

本文档用于把《电商场景 AIGC 带货视频生成系统》赛题要求逐项映射到当前项目实现，方便提交材料和答辩时快速说明。

## 总体目标

赛题目标：面向商家，围绕商品素材、Prompt 调整、分镜干预、素材混剪和高质量视频生成，打造电商短视频创作系统。

当前实现：

- `apps/web` 提供商家创作台、素材库、任务页和数据看板。
- `apps/api` 提供项目、商品、素材、剧本、分镜、任务、视频和看板 API。
- `apps/agent-python` 使用 Python LangChain/LangGraph 编排创作 Agent。
- `packages/video` 提供 FFmpeg 字幕、BGM、mock TTS 和成片合成。
- Seedance 视频生成已接入，失败时回退到本地 FFmpeg，保证演示稳定。

## 技术栈要求

| 赛题要求                        | 当前实现                                                                  |
| ------------------------------- | ------------------------------------------------------------------------- |
| React                           | `apps/web` 使用 React + Vite 构建商家工作台                               |
| Node.js                         | `apps/api` 使用 Fastify 承担 API、文件、任务和模型调度                    |
| TypeScript                      | 前端、API、worker、shared schema、视频包均为 TypeScript                   |
| 火山引擎 OpenAPI                | Ark 文本模型、Seedance 视频模型均通过服务端读取 `.env` 调用               |
| 开源模型/框架                   | Python LangChain + LangGraph + Pydantic；本地 mock embedding/检索；FFmpeg |
| 单 Git 仓库                     | monorepo 结构，`apps/*` 与 `packages/*` 放在同一仓库                      |
| ESLint/Prettier/Husky/StyleLint | 根目录已配置脚本与依赖，CI 中执行 lint/stylelint/build                    |
| CI/CD 思路                      | `.github/workflows/ci.yml` 已加入基础验证流水线                           |

## 核心链路要求

| 模块         | 赛题要求                                  | 当前实现                                                                              |
| ------------ | ----------------------------------------- | ------------------------------------------------------------------------------------- |
| 素材库       | 商品图、商品视频、参考素材上传与管理      | 支持图片/视频上传、预览、删除、重新分析                                               |
| 素材结构化   | 商品级、视频级、切片级摘要/标签/embedding | 图片生成摘要标签与 mock embedding；视频切 4 段、生成缩略图、摘要标签和 mock embedding |
| 素材检索     | 关键词、标签、向量混合检索                | `GET /api/materials/search` 和分镜素材推荐使用本地混合检索                            |
| 剧本生成     | 根据策略、商品、约束生成结构化剧本        | Python LangGraph 生成标题、叙事、hook、constraints、5-6 个连续分镜                    |
| Prompt 调整  | 支持用户微调生成方向                      | 创作台新增“创作补充要求 / Prompt 微调”，进入 Product schema 与 Agent prompt           |
| 分镜干预     | 改台词、改时长、替换素材、局部重生成      | 分镜编辑器支持标题/画面/镜头/台词/字幕/时长/素材绑定/排序/单镜重生成                  |
| 单镜预览     | 局部预览和快速重渲染                      | `POST /api/scenes/:id/render-preview`，前端右侧展示单镜任务与视频                     |
| 一键成片     | 输出 30 秒以内视频                        | 目标 15-20 秒，支持 Seedance 分段出片或 FFmpeg 兜底                                   |
| 字幕/BGM/TTS | 视频合成字幕、背景音乐和配音              | FFmpeg 烧录字幕、混入 mock BGM 和 mock TTS 音轨                                       |
| 多规格导出   | 9:16、16:9、720p、1080p                   | 任务页可选择导出比例和清晰度，传入 `/api/videos/render`                               |
| 长任务体验   | 进度、重试、失败提示、兜底                | local/BullMQ 两种队列；任务状态、进度、错误、retry 和 trace 可见                      |
| 数据回流     | 生成因子与转化效果看板                    | ECharts mock 看板展示播放、CTR、转化、Hook/风格因子对比                               |

## P0/P1/P2 完成度

P0 已完成：

- 商品信息录入。
- 素材上传、预览、素材记录保存。
- 剧本生成和基础分镜。
- 一键成片。
- 任务状态与进度。
- 在线预览和导出。

P1 已完成或可演示：

- Python LangGraph 创作 Agent。
- Agent trace 展示。
- 素材标签、摘要、视频切片、mock embedding。
- 混合检索和分镜素材推荐。
- 分镜级编辑、单镜重生成、单镜预览。
- 字幕、BGM、mock TTS。
- 任务重试、Seedance/FFmpeg 兜底。
- Mock 数据看板。

P2 已预留或文档化：

- A/B 与多因子归因：当前看板用 mock 指标展示思路。
- CI/CD：已加入 GitHub Actions 基础流水线。
- 可观测性：任务 trace 已实现，生产级日志/指标可继续扩展。
- 合规审核流：当前在文档中声明素材来源与 Key 安全要求，可继续做审核节点。

## 交付材料要求

| 提交项            | 当前位置                                           |
| ----------------- | -------------------------------------------------- |
| 项目名称          | `README.md`、`docs/submission-package.md`          |
| 参赛课题          | `docs/submission-package.md`                       |
| 团队成员与分工    | `docs/submission-package.md` 中预留填写            |
| 一句话业务价值    | `README.md`、`docs/submission-package.md`          |
| 在线 Demo 链接    | `docs/submission-package.md` 中预留填写            |
| 演示视频链接      | `docs/submission-package.md` 中预留填写            |
| 源代码仓库链接    | `docs/submission-package.md` 中预留填写            |
| README / 运行说明 | `README.md`                                        |
| 系统架构说明      | `docs/architecture.md`                             |
| API 清单          | `docs/api.md`                                      |
| 数据库说明        | `docs/database-plan.md`                            |
| AI Agent 流程说明 | `docs/submission-guide.md`、`docs/architecture.md` |
| 部署说明          | `docs/deployment.md`                               |
| 最终验收清单      | `docs/final-acceptance.md`                         |

## 演示建议

稳定演示优先使用：

```bash
STORE_DRIVER=json
QUEUE_DRIVER=local
USE_MOCK_AI=false
VIDEO_RENDER_PROVIDER=auto
SEEDANCE_RENDER_MODE=segments
SEEDANCE_TOTAL_DURATION_SECONDS=20
```

如果外部模型不稳定，临时改成：

```bash
USE_MOCK_AI=true
VIDEO_RENDER_PROVIDER=ffmpeg
```

这样仍然能完整展示素材、剧本、分镜、任务、预览、导出和看板，不会因为外部服务影响答辩。
