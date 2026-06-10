import { Queue } from "bullmq";
import IORedis from "ioredis";
import { config } from "../config.js";
import { processMaterialAnalysisJob } from "./materialAnalysisRunner.js";
import { processRenderJob } from "./renderRunner.js";
import { processScriptGenerationJob } from "./scriptGenerationRunner.js";

export const RENDER_QUEUE_NAME = "video-render";
export const MATERIAL_ANALYSIS_QUEUE_NAME = "material-analysis";
export const SCRIPT_GENERATION_QUEUE_NAME = "script-generation";

export interface QueueJobData {
  jobId: string;
}

export interface EnqueueTaskResult {
  driver: "local" | "bullmq";
  queued: boolean;
  queueName: string;
}

let renderQueue: Queue<QueueJobData> | undefined;
let materialAnalysisQueue: Queue<QueueJobData> | undefined;
let scriptGenerationQueue: Queue<QueueJobData> | undefined;
let connection: IORedis | undefined;

export function createRedisConnection() {
  return new IORedis(config.redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false
  });
}

function getRenderQueue() {
  if (!connection) connection = createRedisConnection();
  if (!renderQueue) {
    renderQueue = new Queue<QueueJobData>(RENDER_QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: 2,
        backoff: {
          type: "exponential",
          delay: 5000
        },
        removeOnComplete: 100,
        removeOnFail: 100
      }
    });
  }
  return renderQueue;
}

function getMaterialAnalysisQueue() {
  if (!connection) connection = createRedisConnection();
  if (!materialAnalysisQueue) {
    materialAnalysisQueue = new Queue<QueueJobData>(MATERIAL_ANALYSIS_QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: 2,
        backoff: {
          type: "exponential",
          delay: 3000
        },
        removeOnComplete: 100,
        removeOnFail: 100
      }
    });
  }
  return materialAnalysisQueue;
}

function getScriptGenerationQueue() {
  if (!connection) connection = createRedisConnection();
  if (!scriptGenerationQueue) {
    scriptGenerationQueue = new Queue<QueueJobData>(SCRIPT_GENERATION_QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: 2,
        backoff: {
          type: "exponential",
          delay: 5000
        },
        removeOnComplete: 100,
        removeOnFail: 100
      }
    });
  }
  return scriptGenerationQueue;
}

function enqueueLocal(
  jobId: string,
  queueName: string,
  processor: (jobId: string) => Promise<void>
): EnqueueTaskResult {
  setTimeout(() => {
    void processor(jobId);
  }, 50);

  return {
    driver: "local",
    queued: true,
    queueName
  };
}

export async function enqueueRenderJob(jobId: string): Promise<EnqueueTaskResult> {
  if (config.queueDriver !== "bullmq") {
    return enqueueLocal(jobId, RENDER_QUEUE_NAME, processRenderJob);
  }

  const queue = getRenderQueue();
  await queue.add("render", { jobId }, { jobId });
  return {
    driver: "bullmq",
    queued: true,
    queueName: RENDER_QUEUE_NAME
  };
}

export async function enqueueMaterialAnalysisJob(jobId: string): Promise<EnqueueTaskResult> {
  if (config.queueDriver !== "bullmq") {
    return enqueueLocal(jobId, MATERIAL_ANALYSIS_QUEUE_NAME, processMaterialAnalysisJob);
  }

  const queue = getMaterialAnalysisQueue();
  await queue.add("analyze", { jobId }, { jobId });
  return {
    driver: "bullmq",
    queued: true,
    queueName: MATERIAL_ANALYSIS_QUEUE_NAME
  };
}

export async function enqueueScriptGenerationJob(jobId: string): Promise<EnqueueTaskResult> {
  if (config.queueDriver !== "bullmq") {
    return enqueueLocal(jobId, SCRIPT_GENERATION_QUEUE_NAME, processScriptGenerationJob);
  }

  const queue = getScriptGenerationQueue();
  await queue.add("generate", { jobId }, { jobId });
  return {
    driver: "bullmq",
    queued: true,
    queueName: SCRIPT_GENERATION_QUEUE_NAME
  };
}
