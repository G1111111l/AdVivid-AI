/* global console, fetch, process, setTimeout */

const baseUrl = process.env.E2E_API_BASE_URL ?? "http://localhost:4000";
const shouldRender = process.argv.includes("--render");
const shouldCreateSeedance = process.argv.includes("--seedance");
const planOnly = process.argv.includes("--plan-only");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(path, init) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`${path} failed with HTTP ${response.status}: ${body.slice(0, 500)}`);
  }

  return response.json();
}

async function pollJob(jobId, label, timeoutMs = 520_000) {
  const startedAt = Date.now();
  let lastState = "";

  while (Date.now() - startedAt < timeoutMs) {
    const job = await request(`/api/jobs/${jobId}`);
    const state = `${job.status}|${job.progress}|${job.currentStep}`;
    if (state !== lastState) {
      console.log(`[${label}] ${job.status} ${job.progress}% ${job.currentStep}`);
      lastState = state;
    }

    if (["succeeded", "failed", "cancelled"].includes(job.status)) return job;
    await sleep(3000);
  }

  throw new Error(`${label} timed out. jobId=${jobId}`);
}

function compactTraceSources(traces) {
  return traces
    .filter((trace) =>
      ["ScriptWriter", "ScenePlanner", "SeedanceRenderer", "RenderWorker"].includes(trace.node)
    )
    .map((trace) => ({
      node: trace.node,
      status: trace.status,
      message: trace.message,
      source: trace.output?.source,
      provider: trace.output?.provider,
      usedFallback: trace.output?.usedFallback,
      url: trace.output?.url
    }));
}

const modelStatus = await request("/api/models/status");
console.log("[status]", JSON.stringify(modelStatus));

if (planOnly) {
  console.log("[done] plan-only check succeeded.");
  process.exit(0);
}

if (shouldCreateSeedance && !shouldRender) {
  throw new Error("Use --render together with --seedance.");
}

if (shouldCreateSeedance && !modelStatus.willAttemptSeedance) {
  throw new Error("Seedance was requested, but /api/models/status says it will not be attempted.");
}

const productInput = {
  title: "便携冷萃咖啡杯",
  sellingPoints: ["一杯完成冷萃", "防漏随身携带", "细密滤网保留香气"],
  targetAudience: "通勤上班族、健身后需要低负担咖啡的人群",
  scenario: "早高峰地铁站、办公室工位、健身后补能",
  style: "场景种草",
  creativeBrief:
    "剧情要连续，商品贯穿每个镜头，先解决真实小麻烦，再用操作细节证明卖点，结尾轻 CTA。",
  durationSec: 20,
  name: shouldRender ? "E2E Real Model Demo" : "E2E Script Demo"
};

const created = await request("/api/projects", {
  method: "POST",
  body: JSON.stringify(productInput)
});
console.log("[project]", created.project.id);

const scriptSubmit = await request("/api/scripts/generate", {
  method: "POST",
  body: JSON.stringify({
    projectId: created.project.id,
    productId: created.product.id
  })
});
console.log("[script-job]", scriptSubmit.job.id, JSON.stringify(scriptSubmit.queue));

const scriptJob = await pollJob(scriptSubmit.job.id, "script");
if (scriptJob.status !== "succeeded") {
  throw new Error(`Script job failed: ${scriptJob.error || scriptJob.currentStep}`);
}

const detailAfterScript = await request(`/api/projects/${created.project.id}`);
console.log(
  "[script-result]",
  JSON.stringify({
    scriptId: detailAfterScript.script?.id,
    title: detailAfterScript.script?.title,
    scenes: detailAfterScript.scenes.length,
    sceneSummary: detailAfterScript.scenes.map((scene) => ({
      order: scene.order,
      title: scene.title,
      durationSec: scene.durationSec,
      subtitle: scene.subtitle
    }))
  })
);
console.log("[trace-sources]", JSON.stringify(compactTraceSources(detailAfterScript.traces)));

if (!shouldRender) {
  console.log(
    "[done] script-only E2E succeeded. Add --render --seedance to create a real video task."
  );
  process.exit(0);
}

const renderSubmit = await request("/api/videos/render", {
  method: "POST",
  body: JSON.stringify({
    projectId: created.project.id,
    scriptId: detailAfterScript.script?.id,
    ratio: "9:16",
    resolution: "720p"
  })
});
console.log("[render-job]", renderSubmit.id);

const renderJob = await pollJob(renderSubmit.id, "render", 900_000);
if (renderJob.status !== "succeeded") {
  throw new Error(`Render job failed: ${renderJob.error || renderJob.currentStep}`);
}

const detailAfterRender = await request(`/api/projects/${created.project.id}`);
const video = detailAfterRender.videos.at(-1);
console.log("[render-traces]", JSON.stringify(compactTraceSources(detailAfterRender.traces)));
console.log("[video]", JSON.stringify(video));
console.log("[done] full E2E succeeded.");
