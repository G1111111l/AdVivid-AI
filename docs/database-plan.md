# PostgreSQL / Prisma 接入说明

当前项目已经接入两种数据存储模式：

```text
STORE_DRIVER=json
  -> 默认模式
  -> 不需要数据库
  -> 数据写入 data/store.json
  -> 最适合本地零配置演示

STORE_DRIVER=prisma
  -> PostgreSQL 模式
  -> 通过 Prisma Client 读写数据库
  -> 适合 Docker / 部署 / API 与 Worker 共享数据
```

## 已完成内容

- 已安装 `prisma` 和 `@prisma/client`。
- 已生成 Prisma Client。
- 已新增 `apps/api/src/services/prismaStore.ts`。
- 已通过 `STORE_DRIVER=json|prisma` 切换 JSON Store 和 Prisma Store。
- 已在 Prisma schema 中覆盖核心表：products、materials、material_slices、projects、scripts、scenes、render_jobs、generated_videos、generation_traces、analytics_mock_events。
- 已保留 pgvector 字段，并增加 `embeddingJson` 作为当前 mock embedding 的稳定落库字段。
- Docker Compose 已使用 `pgvector/pgvector:pg16`，并通过初始化 SQL 启用 `vector` 扩展。

## 本地 JSON 模式

`.env` 中保持：

```bash
STORE_DRIVER=json
```

然后运行：

```bash
npm run dev
```

这是当前最稳的开发和演示方式，不需要启动 PostgreSQL 或 Redis。

## PostgreSQL 模式

准备 PostgreSQL 后，把 `.env` 改成：

```bash
STORE_DRIVER=prisma
DATABASE_URL=postgresql://advivid:advivid@localhost:5432/advivid
```

初始化数据库结构：

```bash
npm run db:push
```

再启动项目：

```bash
npm run dev
```

## Docker Compose 模式

Docker Compose 会自动覆盖容器内数据库连接：

```text
DATABASE_URL=postgresql://advivid:advivid@postgres:5432/advivid
STORE_DRIVER=prisma
QUEUE_DRIVER=bullmq
```

启动：

```bash
docker compose -f infra/docker/docker-compose.yml up
```

外部运行数据和缓存默认放在：

```text
E:/envment/postgres-data
E:/envment/redis-data
E:/envment/npm-cache
E:/envment/pip-cache
E:/envment/prisma-engines
```

如果要改目录，可以设置：

```bash
ENVMENT_DIR=E:/envment
```

## 为什么同时有 vector 和 embeddingJson

当前素材检索使用本地 mock embedding，直接用 JSON 数组存储最稳定：

```text
materials.embeddingJson
material_slices.embeddingJson
```

同时 schema 保留了：

```text
materials.embedding
material_slices.embedding
```

这两个字段用于后续升级 pgvector 真实向量检索。这样现在能稳定运行，后面也能自然扩展到数据库向量召回。

## 常用命令

```bash
npm run db:generate
npm run db:push
npm run db:migrate
npm run db:studio
```

## 验收方式

JSON 模式：

```text
创建项目 -> 上传素材 -> 生成剧本 -> 编辑分镜 -> 一键成片 -> 查询任务 -> 预览导出
```

PostgreSQL 模式：

```text
STORE_DRIVER=prisma
db:push 成功
API 能启动
同样的端到端流程能写入 PostgreSQL
API 与 Worker 能通过同一个数据库共享任务状态
```
