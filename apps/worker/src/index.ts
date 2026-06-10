import { Worker } from "bullmq";
import { config } from "../../api/src/config.js";
import { processMaterialAnalysisJob } from "../../api/src/services/materialAnalysisRunner.js";
import {
  createRedisConnection,
  MATERIAL_ANALYSIS_QUEUE_NAME,
  RENDER_QUEUE_NAME,
  SCRIPT_GENERATION_QUEUE_NAME,
  type QueueJobData
} from "../../api/src/services/renderQueue.js";
import { processRenderJob } from "../../api/src/services/renderRunner.js";
import { processScriptGenerationJob } from "../../api/src/services/scriptGenerationRunner.js";
import { store } from "../../api/src/services/store.js";

async function bootstrap() {
  await store.init();

  if (config.queueDriver !== "bullmq") {
    console.log(`[worker] QUEUE_DRIVER=${config.queueDriver}. Worker is idle because local API runner is enabled.`);
    console.log("[worker] Set QUEUE_DRIVER=bullmq and start Redis to consume long jobs here.");
    return;
  }

  const connection = createRedisConnection();
  const workers: Array<Worker<QueueJobData>> = [];

  const renderWorker = new Worker<QueueJobData>(
    RENDER_QUEUE_NAME,
    async (job) => {
      console.log(`[worker] Processing render job ${job.data.jobId}`);
      await processRenderJob(job.data.jobId);
    },
    {
      connection,
      concurrency: Math.max(1, config.renderWorkerConcurrency)
    }
  );

  const materialWorker = new Worker<QueueJobData>(
    MATERIAL_ANALYSIS_QUEUE_NAME,
    async (job) => {
      console.log(`[worker] Processing material analysis job ${job.data.jobId}`);
      await processMaterialAnalysisJob(job.data.jobId);
    },
    {
      connection,
      concurrency: Math.max(1, config.renderWorkerConcurrency)
    }
  );

  const scriptWorker = new Worker<QueueJobData>(
    SCRIPT_GENERATION_QUEUE_NAME,
    async (job) => {
      console.log(`[worker] Processing script generation job ${job.data.jobId}`);
      await processScriptGenerationJob(job.data.jobId);
    },
    {
      connection,
      concurrency: 1
    }
  );

  workers.push(renderWorker, materialWorker, scriptWorker);

  for (const worker of workers) {
    worker.on("ready", () => {
      console.log(`[worker] Ready. queue=${worker.name}, redis=${config.redisUrl}`);
    });

    worker.on("completed", (job) => {
      console.log(`[worker] Completed queue job ${worker.name}:${job.id}`);
    });

    worker.on("failed", (job, error) => {
      console.error(`[worker] Failed queue job ${worker.name}:${job?.id ?? "unknown"}: ${error.message}`);
    });
  }

  const shutdown = async () => {
    console.log("[worker] Shutting down...");
    await Promise.all(workers.map((item) => item.close()));
    await connection.quit();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown();
  });
  process.on("SIGTERM", () => {
    void shutdown();
  });
}

bootstrap().catch((error) => {
  console.error("[worker] Fatal error", error);
  process.exit(1);
});
