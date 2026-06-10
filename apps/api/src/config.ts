import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const dirname = path.dirname(fileURLToPath(import.meta.url));
export const rootDir = path.resolve(dirname, "../../..");

dotenv.config({ path: path.join(rootDir, ".env") });

const numberEnv = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
};

const videoRenderProvider = ["auto", "seedance", "ffmpeg"].includes(
  process.env.VIDEO_RENDER_PROVIDER ?? ""
)
  ? (process.env.VIDEO_RENDER_PROVIDER as "auto" | "seedance" | "ffmpeg")
  : "auto";

const seedanceRenderMode = ["single", "segments"].includes(process.env.SEEDANCE_RENDER_MODE ?? "")
  ? (process.env.SEEDANCE_RENDER_MODE as "single" | "segments")
  : "single";

const queueDriver = ["local", "bullmq"].includes(process.env.QUEUE_DRIVER ?? "")
  ? (process.env.QUEUE_DRIVER as "local" | "bullmq")
  : "local";

const storeDriver = ["json", "prisma"].includes(process.env.STORE_DRIVER ?? "")
  ? (process.env.STORE_DRIVER as "json" | "prisma")
  : "json";

const seedanceImageInputMode = ["data_url", "url"].includes(
  process.env.SEEDANCE_IMAGE_INPUT_MODE ?? ""
)
  ? (process.env.SEEDANCE_IMAGE_INPUT_MODE as "data_url" | "url")
  : "data_url";

const seedancePostCompositeMode = ["auto", "always", "off"].includes(
  process.env.SEEDANCE_POST_COMPOSITE_MODE ?? ""
)
  ? (process.env.SEEDANCE_POST_COMPOSITE_MODE as "auto" | "always" | "off")
  : "auto";

export const config = {
  rootDir,
  host: process.env.API_HOST ?? "0.0.0.0",
  port: Number(process.env.API_PORT ?? 4000),
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
  publicWebOrigin:
    process.env.PUBLIC_WEB_ORIGIN ?? process.env.WEB_ORIGIN ?? "http://localhost:5173",
  dataDir: path.resolve(rootDir, process.env.LOCAL_DATA_DIR ?? "data"),
  uploadDir: path.resolve(rootDir, process.env.LOCAL_UPLOAD_DIR ?? "uploads"),
  renderDir: path.resolve(rootDir, process.env.LOCAL_RENDER_DIR ?? "rendered"),
  agentRuntime: process.env.AGENT_RUNTIME ?? "python",
  pythonAgentUrl: process.env.PYTHON_AGENT_URL ?? "http://localhost:8002",
  pythonAgentTimeoutSeconds: numberEnv("PYTHON_AGENT_TIMEOUT_SECONDS", 240),
  useMockAi: process.env.USE_MOCK_AI !== "false",
  storeDriver,
  queueDriver,
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  renderWorkerConcurrency: numberEnv("RENDER_WORKER_CONCURRENCY", 1),
  videoRenderProvider,
  seedanceWaitSeconds: numberEnv("SEEDANCE_WAIT_SECONDS", 420),
  seedancePollSeconds: numberEnv("SEEDANCE_POLL_SECONDS", 8),
  seedanceTargetDurationSec: numberEnv("SEEDANCE_TARGET_DURATION_SECONDS", 5),
  seedanceRenderMode,
  seedanceTotalDurationSec: numberEnv("SEEDANCE_TOTAL_DURATION_SECONDS", 20),
  seedanceSegmentDurationSec: numberEnv("SEEDANCE_SEGMENT_DURATION_SECONDS", 5),
  seedanceMaxSegments: numberEnv("SEEDANCE_MAX_SEGMENTS", 4),
  seedanceImageInputMode,
  seedancePostCompositeMode,
  ark: {
    baseUrl: process.env.ARK_BASE_URL ?? "https://ark.cn-beijing.volces.com/api/v3",
    apiKey: process.env.ARK_API_KEY ?? "",
    textEndpoint: process.env.ARK_TEXT_ENDPOINT ?? "",
    videoEndpoint: process.env.ARK_VIDEO_ENDPOINT ?? ""
  }
};
