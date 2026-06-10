import { useEffect, useMemo, useState } from "react";
import { Film, Loader2, Play, Sparkles, Trash2 } from "lucide-react";
import type {
  GeneratedVideo,
  GenerationTrace,
  Product,
  RenderJob,
  Scene,
  VideoRatio
} from "@advivid/shared";
import {
  api,
  type MaterialRecommendation,
  type ModelStatus,
  type ProjectDetail
} from "./api/client";
import {
  initialDraft,
  productToDraft,
  sampleDrafts,
  tabs,
  toProductInput,
  type MaterialTypeOption,
  type ProductDraft,
  type Tab
} from "./appConfig";
import { IconButton, StatusPill } from "./components/ui";
import { JobsPage } from "./pages/JobsPage";
import { MaterialsPage } from "./pages/MaterialsPage";
import { StudioPage } from "./pages/StudioPage";

type RenderJobWithResult = RenderJob & {
  video?: GeneratedVideo;
  traces?: GenerationTrace[];
};
type RenderResolution = "720p" | "1080p";

export function App() {
  const [tab, setTab] = useState<Tab>("studio");
  const [draft, setDraft] = useState(initialDraft);
  const [projects, setProjects] = useState<
    Array<{ id: string; name: string; status: string; product?: Product; videos: GeneratedVideo[] }>
  >([]);
  const [detail, setDetail] = useState<ProjectDetail | undefined>();
  const [activeJob, setActiveJob] = useState<RenderJobWithResult | undefined>();
  const [modelStatus, setModelStatus] = useState<ModelStatus | undefined>();
  const [sceneRecommendations, setSceneRecommendations] = useState<MaterialRecommendation[]>([]);
  const [selectedSceneId, setSelectedSceneId] = useState<string | undefined>();
  const [materialType, setMaterialType] = useState<MaterialTypeOption>("product_image");
  const [materialQuery, setMaterialQuery] = useState("");
  const [renderRatio, setRenderRatio] = useState<VideoRatio>("9:16");
  const [renderResolution, setRenderResolution] = useState<RenderResolution>("720p");
  const [pendingDeleteProjectId, setPendingDeleteProjectId] = useState<string | undefined>();
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const selectedScene = useMemo(
    () => detail?.scenes.find((scene) => scene.id === selectedSceneId) ?? detail?.scenes[0],
    [detail?.scenes, selectedSceneId]
  );
  const latestVideo = detail?.videos.at(-1);
  const latestJob = activeJob ?? detail?.jobs[0];
  const selectedScenePreviewJob = useMemo<RenderJobWithResult | undefined>(() => {
    if (!selectedScene?.id) return undefined;

    const jobs: RenderJobWithResult[] = [];
    if (activeJob) jobs.push(activeJob);
    jobs.push(...(detail?.jobs ?? []));

    const matchingJobs = new Map<string, RenderJobWithResult>();
    for (const job of jobs) {
      const sceneId = job.renderPlan?.scenes[0]?.sceneId;
      if (job.taskType !== "scene_preview" || sceneId !== selectedScene.id) continue;

      const existing = matchingJobs.get(job.id);
      if (!existing || (!existing.video && job.video)) matchingJobs.set(job.id, job);
    }

    return [...matchingJobs.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  }, [activeJob, detail?.jobs, selectedScene?.id]);
  const traces = useMemo(
    () => [
      ...(detail?.traces ?? []),
      ...((activeJob?.traces as GenerationTrace[] | undefined) ?? [])
    ],
    [activeJob?.traces, detail?.traces]
  );
  const textMode =
    modelStatus?.textModelConfigured && !modelStatus.useMockAi ? "Text: Ark" : "Text: Fallback";
  const videoMode = modelStatus?.willAttemptSeedance ? "Video: Seedance" : "Video: FFmpeg";

  async function loadProjects(selectFirst = false) {
    const items = await api.listProjects();
    setProjects(items.map((item) => ({ ...item, status: item.status })));
    if (selectFirst && items[0]) await loadProject(items[0].id);
  }

  async function loadProject(projectId: string) {
    const next = await api.getProject(projectId);
    setDetail(next);
    setDraft(productToDraft(next.product));
    setSelectedSceneId((current) =>
      next.scenes.some((scene) => scene.id === current) ? current : next.scenes[0]?.id
    );
    setActiveJob(next.jobs[0]);
  }

  async function guarded(label: string, action: () => Promise<void>) {
    setBusy(label);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  function validateDraft() {
    const input = toProductInput(draft);
    if (!input.title) throw new Error("请先填写商品标题");
    if (!input.sellingPoints?.length) throw new Error("请至少填写 1 个核心卖点");
    return input;
  }

  function startNewSubject(nextDraft: ProductDraft = { ...initialDraft }) {
    setDetail(undefined);
    setActiveJob(undefined);
    setSelectedSceneId(undefined);
    setSceneRecommendations([]);
    setDraft({ ...nextDraft });
    setTab("studio");
    setNotice(nextDraft.title ? `已填入「${nextDraft.title}」示例` : "已切换到新主题");
    setError("");
  }

  useEffect(() => {
    void guarded("初始化", async () => {
      await api.health();
      setModelStatus(await api.modelStatus());
      await loadProjects(true);
    });
  }, []);

  useEffect(() => {
    if (!activeJob || !["queued", "running"].includes(activeJob.status)) return;

    const timer = window.setInterval(() => {
      void api.getJob(activeJob.id).then(async (job) => {
        setActiveJob(job);
        if (job.status === "succeeded" || job.status === "failed") {
          if (detail?.project.id) await loadProject(detail.project.id);
        }
      });
    }, 1200);

    return () => window.clearInterval(timer);
  }, [activeJob, detail?.project.id]);

  useEffect(() => {
    if (!selectedScene?.id || !detail?.materials.length) {
      setSceneRecommendations([]);
      return;
    }

    let active = true;
    void api
      .recommendSceneMaterials(selectedScene.id)
      .then((recommendations) => {
        if (active) setSceneRecommendations(recommendations);
      })
      .catch(() => {
        if (active) setSceneRecommendations([]);
      });

    return () => {
      active = false;
    };
  }, [selectedScene?.id, detail?.materials.length]);

  const createCurrentProject = () =>
    guarded("创建项目", async () => {
      const input = validateDraft();
      const result = await api.createProject({
        ...input,
        name: draft.title
      });
      await loadProjects();
      await loadProject(result.project.id);
      setTab("studio");
      setNotice("项目已创建");
    });

  const deleteProject = (projectId: string) =>
    guarded("删除项目", async () => {
      await api.deleteProject(projectId);
      setPendingDeleteProjectId(undefined);
      const items = await api.listProjects();
      setProjects(items.map((item) => ({ ...item, status: item.status })));

      if (detail?.project.id === projectId) {
        setActiveJob(undefined);
        setSelectedSceneId(undefined);
        setSceneRecommendations([]);

        if (items[0]) {
          await loadProject(items[0].id);
        } else {
          setDetail(undefined);
          setDraft({ ...initialDraft });
        }
      }

      setNotice("项目已删除");
    });

  const uploadMaterial = (file?: File) =>
    guarded("上传素材", async () => {
      if (!file) return;
      const projectId = detail?.project.id;
      if (!projectId) throw new Error("请先创建或选择一个项目，再上传商品素材");
      const response = await api.uploadMaterial(file, { type: materialType, projectId });
      setActiveJob(response.job);
      await loadProject(projectId);
      setTab("jobs");
      setNotice(`素材已入库，分析任务已提交：${response.material.name}`);
    });

  const analyzeMaterial = (materialId: string) =>
    guarded("分析素材", async () => {
      const job = await api.analyzeMaterial(materialId);
      setActiveJob(job);
      if (detail?.project.id) await loadProject(detail.project.id);
      setNotice("素材分析任务已提交");
    });

  const deleteMaterial = (materialId: string) =>
    guarded("删除素材", async () => {
      const material = detail?.materials.find((item) => item.id === materialId);
      const ok = window.confirm(`确定删除素材「${material?.name ?? "未命名素材"}」吗？`);
      if (!ok) return;

      await api.deleteMaterial(materialId);
      if (detail?.project.id) await loadProject(detail.project.id);
      setNotice("素材已删除");
    });

  const saveCurrentProduct = async () => {
    const input = validateDraft();
    let current = detail;
    if (!current) {
      const result = await api.createProject({
        ...input,
        name: draft.title
      });
      await loadProjects();
      current = await api.getProject(result.project.id);
      setDetail(current);
    } else if (current.product?.id) {
      await api.updateProduct(current.product.id, input);
      current = await api.getProject(current.project.id);
      setDetail(current);
      await loadProjects();
    }

    return current;
  };

  const generateScript = () =>
    guarded("生成剧本", async () => {
      const current = await saveCurrentProduct();
      if (!current) throw new Error("请先创建项目");

      const response = await api.generateScript({
        projectId: current.project.id,
        productId: current.product?.id
      });
      setActiveJob(response.job);
      await loadProject(response.project.id);
      await loadProjects();
      setTab("jobs");
      setNotice(`已提交「${draft.style}」剧本生成任务`);
    });

  const renderCurrentVideo = () =>
    guarded("提交渲染", async () => {
      if (!detail?.project.id) throw new Error("请先创建项目");
      const job = await api.renderVideo({
        projectId: detail.project.id,
        scriptId: detail.script?.id,
        ratio: renderRatio,
        resolution: renderResolution
      });
      setActiveJob(job);
      await loadProject(detail.project.id);
      setTab("jobs");
      setNotice("渲染任务已提交");
    });

  const updateSelectedScene = (patch: Partial<Scene>) =>
    guarded("保存分镜", async () => {
      if (!selectedScene) return;
      await api.updateScene(selectedScene.id, patch);
      if (detail?.project.id) await loadProject(detail.project.id);
      setNotice("分镜已保存");
    });

  const applyMaterialRecommendation = (recommendation: MaterialRecommendation) =>
    updateSelectedScene({
      materialId: recommendation.material.id,
      materialSliceId: recommendation.slice?.id ?? recommendation.material.slices[0]?.id,
      generationMode: "material_mix"
    });

  const moveScene = (scene: Scene, direction: -1 | 1) =>
    guarded("调整顺序", async () => {
      if (!detail) return;
      const scenes = [...detail.scenes].sort((a, b) => a.order - b.order);
      const index = scenes.findIndex((item) => item.id === scene.id);
      const target = index + direction;
      if (target < 0 || target >= scenes.length) return;
      const [item] = scenes.splice(index, 1);
      if (!item) return;
      scenes.splice(target, 0, item);
      await api.reorderScenes(scenes.map((item) => item.id));
      await loadProject(detail.project.id);
    });

  const regenerateSelectedScene = () =>
    guarded("重生成分镜", async () => {
      if (!selectedScene) return;
      await api.regenerateScene(selectedScene.id);
      if (detail?.project.id) await loadProject(detail.project.id);
    });

  const renderSelectedScenePreview = (patch?: Partial<Scene>) =>
    guarded("渲染单镜", async () => {
      if (!selectedScene) return;
      if (patch) await api.updateScene(selectedScene.id, patch);
      const job = await api.renderScenePreview(selectedScene.id);
      setActiveJob(job);
      if (detail?.project.id) await loadProject(detail.project.id);
      setNotice("单镜预览任务已提交，可在右侧预览区查看进度");
    });

  const searchMaterials = () =>
    guarded("检索素材", async () => {
      if (!detail?.project.id) return;
      const materials = await api.searchMaterials(detail.project.id, materialQuery);
      setDetail((current) => (current ? { ...current, materials } : current));
    });

  const retryLatestJob = () =>
    guarded("重试任务", async () => {
      if (!latestJob) return;
      const job = await api.retryJob(latestJob.id);
      setActiveJob(job);
    });

  return (
    <div className="min-h-screen">
      <div className="grid min-h-screen lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="flex min-h-screen flex-col border-r border-line bg-white lg:sticky lg:top-0 lg:h-screen">
          <div className="flex h-16 items-center gap-3 border-b border-line px-5">
            <div className="grid h-9 w-9 place-items-center rounded-md bg-ink text-white">
              <Film size={18} />
            </div>
            <div>
              <div className="text-sm font-black text-ink">AdVivid AI</div>
              <div className="text-xs text-zinc-500">AIGC Commerce Studio</div>
            </div>
          </div>
          <nav className="grid shrink-0 gap-1 p-3">
            {tabs.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setTab(item.id)}
                  className={`flex h-10 items-center gap-3 rounded-md px-3 text-left text-sm font-semibold transition ${
                    tab === item.id
                      ? "bg-ink text-white"
                      : "text-zinc-600 hover:bg-mist hover:text-ink"
                  }`}
                >
                  <Icon size={17} />
                  {item.label}
                </button>
              );
            })}
          </nav>
          <div className="flex min-h-0 flex-1 flex-col border-t border-line p-3">
            <div className="mb-2 px-2 text-xs font-bold uppercase tracking-normal text-zinc-500">
              Projects
            </div>
            <div className="grid min-h-0 flex-1 content-start gap-2 overflow-auto pr-1 scrollbar-thin">
              {projects.map((project) => {
                const confirmingDelete = pendingDeleteProjectId === project.id;

                return (
                  <div
                    key={project.id}
                    className={`rounded-md border p-2 transition ${
                      detail?.project.id === project.id
                        ? "border-teal bg-teal-50"
                        : "border-line bg-white hover:border-zinc-300"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setPendingDeleteProjectId(undefined);
                          void loadProject(project.id);
                        }}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="truncate text-sm font-bold text-ink">{project.name}</div>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <StatusPill status={project.status} />
                          <span className="text-xs text-zinc-500">{project.videos.length} video</span>
                        </div>
                      </button>
                      <button
                        type="button"
                        title="删除项目"
                        aria-label={`删除项目 ${project.name}`}
                        onClick={() =>
                          setPendingDeleteProjectId((current) =>
                            current === project.id ? undefined : project.id
                          )
                        }
                        disabled={Boolean(busy)}
                        className={`grid h-8 w-8 shrink-0 place-items-center rounded-md border transition disabled:cursor-not-allowed disabled:opacity-40 ${
                          confirmingDelete
                            ? "border-red-200 bg-red-50 text-red-600"
                            : "border-transparent text-zinc-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                        }`}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                    {confirmingDelete ? (
                      <div className="mt-2 rounded-md border border-red-200 bg-red-50 p-2">
                        <div className="text-xs font-semibold leading-5 text-red-700">
                          删除后会移除脚本、任务和视频记录。
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setPendingDeleteProjectId(undefined)}
                            disabled={Boolean(busy)}
                            className="h-8 rounded-md border border-line bg-white text-xs font-bold text-zinc-600 transition hover:border-zinc-300 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            取消
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteProject(project.id)}
                            disabled={Boolean(busy)}
                            className="h-8 rounded-md bg-red-600 text-xs font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            确认删除
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
              {projects.length === 0 ? (
                <div className="rounded-md border border-dashed border-line p-3 text-sm text-zinc-500">
                  暂无项目
                </div>
              ) : null}
            </div>
          </div>
        </aside>

        <main className="min-w-0">
          <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-line bg-white px-5 py-3">
            <div>
              <div className="text-xs font-bold uppercase tracking-normal text-zinc-500">
                电商 AIGC 带货视频生成系统
              </div>
              <h1 className="text-xl font-black text-ink">
                {detail?.project.name ?? "新建视频项目"}
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {modelStatus ? (
                <>
                  <span className="inline-flex h-8 items-center rounded border border-teal-200 bg-teal-50 px-2 text-xs font-bold text-teal-700">
                    {textMode}
                  </span>
                  <span className="inline-flex h-8 items-center rounded border border-indigo-200 bg-indigo-50 px-2 text-xs font-bold text-indigo-700">
                    {videoMode}
                  </span>
                  <span className="inline-flex h-8 items-center rounded border border-zinc-200 bg-zinc-50 px-2 text-xs font-bold text-zinc-600">
                    {modelStatus.queueDriver}
                  </span>
                </>
              ) : null}
              {detail ? <StatusPill status={detail.project.status} /> : null}
              {busy ? (
                <span className="inline-flex h-10 items-center gap-2 rounded-md border border-orange-200 bg-orange-50 px-3 text-sm font-semibold text-orange-700">
                  <Loader2 className="animate-spin" size={16} />
                  {busy}
                </span>
              ) : null}
              <IconButton icon={Sparkles} onClick={generateScript} disabled={Boolean(busy)}>
                生成剧本
              </IconButton>
              <IconButton
                icon={Play}
                variant="line"
                onClick={renderCurrentVideo}
                disabled={Boolean(busy || !detail?.script)}
              >
                一键成片
              </IconButton>
            </div>
          </header>

          {notice || error ? (
            <div
              className={`mx-5 mt-4 whitespace-pre-line rounded-md border px-4 py-3 text-sm ${
                error
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-teal-200 bg-teal-50 text-teal-700"
              }`}
            >
              {error || notice}
            </div>
          ) : null}

          <div className="grid gap-5 p-5">
            {tab === "studio" ? (
              <StudioPage
                draft={draft}
                detail={detail}
                selectedScene={selectedScene}
                busy={busy}
                onDraftChange={setDraft}
                sampleDrafts={sampleDrafts}
                onResetDraft={() => startNewSubject()}
                onUseSampleDraft={(nextDraft) => startNewSubject(nextDraft)}
                onCreateProject={createCurrentProject}
                onGenerateScript={generateScript}
                onSelectScene={setSelectedSceneId}
                onMoveScene={moveScene}
                onUpdateScene={updateSelectedScene}
                onRegenerateScene={regenerateSelectedScene}
                onRenderScenePreview={renderSelectedScenePreview}
                scenePreviewJob={selectedScenePreviewJob}
                recommendations={sceneRecommendations}
                onApplyRecommendation={applyMaterialRecommendation}
              />
            ) : null}

            {tab === "materials" ? (
              <MaterialsPage
                detail={detail}
                materialType={materialType}
                materialQuery={materialQuery}
                onMaterialTypeChange={setMaterialType}
                onMaterialQueryChange={setMaterialQuery}
                onUploadMaterial={uploadMaterial}
                onSearchMaterials={searchMaterials}
                onAnalyzeMaterial={analyzeMaterial}
                onDeleteMaterial={deleteMaterial}
              />
            ) : null}

            {tab === "jobs" ? (
              <JobsPage
                latestJob={latestJob}
                video={latestVideo ?? activeJob?.video}
                traces={traces}
                canRender={Boolean(detail?.script)}
                busy={busy}
                renderRatio={renderRatio}
                renderResolution={renderResolution}
                onRenderRatioChange={setRenderRatio}
                onRenderResolutionChange={setRenderResolution}
                onRenderVideo={renderCurrentVideo}
                onRetryJob={retryLatestJob}
              />
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}
