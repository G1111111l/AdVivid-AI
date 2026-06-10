import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Clapperboard,
  Download,
  FolderKanban,
  RefreshCw,
  RotateCcw,
  Save,
  WandSparkles
} from "lucide-react";
import type { GeneratedVideo, RenderJob, Scene } from "@advivid/shared";
import type { MaterialRecommendation, ProjectDetail } from "../api/client";
import { scriptStrategies, type ProductDraft } from "../appConfig";
import { Field, IconButton, Select, StatusPill, TextArea, TextInput } from "../components/ui";
import { assetUrl } from "../utils/assets";

interface StudioPageProps {
  draft: ProductDraft;
  detail?: ProjectDetail;
  selectedScene?: Scene;
  busy: string;
  onDraftChange: (draft: ProductDraft) => void;
  sampleDrafts: Array<{ label: string; draft: ProductDraft }>;
  onResetDraft: () => void;
  onUseSampleDraft: (draft: ProductDraft) => void;
  onCreateProject: () => void;
  onGenerateScript: () => void;
  onSelectScene: (sceneId: string) => void;
  onMoveScene: (scene: Scene, direction: -1 | 1) => void;
  onUpdateScene: (patch: Partial<Scene>) => void;
  onRegenerateScene: () => void;
  onRenderScenePreview: (patch?: Partial<Scene>) => void;
  scenePreviewJob?: RenderJob & { video?: GeneratedVideo };
  recommendations: MaterialRecommendation[];
  onApplyRecommendation: (recommendation: MaterialRecommendation) => void;
}

type SceneDraft = Pick<
  Scene,
  "title" | "visual" | "camera" | "voiceover" | "subtitle" | "durationSec"
>;

export function StudioPage({
  draft,
  detail,
  selectedScene,
  busy,
  onDraftChange,
  sampleDrafts,
  onResetDraft,
  onUseSampleDraft,
  onCreateProject,
  onGenerateScript,
  onSelectScene,
  onMoveScene,
  onUpdateScene,
  onRegenerateScene,
  onRenderScenePreview,
  scenePreviewJob,
  recommendations,
  onApplyRecommendation
}: StudioPageProps) {
  const selectedMaterial = detail?.materials.find(
    (material) => material.id === selectedScene?.materialId
  );
  const activeStrategy = scriptStrategies.find((strategy) => strategy.style === draft.style);
  const sortedScenes = useMemo(
    () => [...(detail?.scenes ?? [])].sort((a, b) => a.order - b.order),
    [detail?.scenes]
  );
  const totalDuration = sortedScenes.reduce((sum, scene) => sum + scene.durationSec, 0);
  const [sceneDraft, setSceneDraft] = useState<SceneDraft | undefined>();
  const scenePreviewVideo =
    scenePreviewJob?.video ?? detail?.videos.find((video) => video.jobId === scenePreviewJob?.id);
  const scenePreviewUrl = assetUrl(scenePreviewVideo?.url);
  const scenePreviewRunning =
    scenePreviewJob && ["queued", "running"].includes(scenePreviewJob.status);

  useEffect(() => {
    if (!selectedScene) {
      setSceneDraft(undefined);
      return;
    }

    setSceneDraft({
      title: selectedScene.title,
      visual: selectedScene.visual,
      camera: selectedScene.camera,
      voiceover: selectedScene.voiceover,
      subtitle: selectedScene.subtitle,
      durationSec: selectedScene.durationSec
    });
  }, [selectedScene?.id, selectedScene?.updatedAt]);

  const changeSceneDraft = <K extends keyof SceneDraft>(key: K, value: SceneDraft[K]) => {
    setSceneDraft((current) => (current ? { ...current, [key]: value } : current));
  };

  const saveSceneDraft = () => {
    if (!sceneDraft) return;
    onUpdateScene(sceneDraft);
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[400px_minmax(0,1fr)_380px]">
      <section className="rounded-md border border-line bg-white p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-black text-ink">商品与剧本类型</h2>
          <IconButton
            icon={RotateCcw}
            variant="line"
            onClick={onResetDraft}
            disabled={Boolean(busy)}
          >
            新主题
          </IconButton>
        </div>
        <div className="mb-4 flex flex-wrap gap-2">
          {sampleDrafts.map((sample) => (
            <button
              key={sample.label}
              type="button"
              onClick={() => onUseSampleDraft(sample.draft)}
              disabled={Boolean(busy)}
              className="h-8 rounded-md border border-line bg-white px-2 text-xs font-bold text-zinc-600 transition hover:border-teal hover:text-teal disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sample.label}
            </button>
          ))}
        </div>
        <div className="grid gap-3">
          <Field label="商品标题">
            <TextInput
              value={draft.title}
              placeholder="例如：清爽防晒乳 / 通勤双肩包 / 露营氛围灯"
              onChange={(event) => onDraftChange({ ...draft, title: event.target.value })}
            />
          </Field>
          <Field label="核心卖点">
            <TextArea
              value={draft.sellingPointsText}
              placeholder="用逗号、顿号或换行分隔，例如：轻薄不黏腻，成膜快，不搓泥"
              onChange={(event) =>
                onDraftChange({ ...draft, sellingPointsText: event.target.value })
              }
            />
          </Field>
          <Field label="目标人群">
            <TextInput
              value={draft.targetAudience}
              placeholder="例如：通勤上班族、户外人群、学生党"
              onChange={(event) => onDraftChange({ ...draft, targetAudience: event.target.value })}
            />
          </Field>
          <Field label="使用场景">
            <TextInput
              value={draft.scenario}
              placeholder="例如：早高峰出门、办公室、周末户外"
              onChange={(event) => onDraftChange({ ...draft, scenario: event.target.value })}
            />
          </Field>
          <Field label="创作补充要求 / Prompt 微调">
            <TextArea
              value={draft.creativeBrief}
              placeholder="补充你希望的剧情方向、镜头节奏、禁忌表达等"
              onChange={(event) => onDraftChange({ ...draft, creativeBrief: event.target.value })}
              className="min-h-24"
            />
          </Field>

          <div className="grid gap-2">
            <div className="text-sm font-semibold text-zinc-700">创作策略</div>
            <div className="grid gap-2">
              {scriptStrategies.map((strategy) => {
                const active = strategy.style === draft.style;
                return (
                  <button
                    type="button"
                    key={strategy.style}
                    onClick={() => onDraftChange({ ...draft, style: strategy.style })}
                    className={`rounded-md border p-3 text-left transition ${
                      active
                        ? "border-teal bg-teal-50"
                        : "border-line bg-white hover:border-zinc-300"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-black text-ink">{strategy.label}</div>
                      <span
                        className={`rounded px-2 py-1 text-[11px] font-bold ${
                          active ? "bg-teal text-white" : "bg-mist text-zinc-500"
                        }`}
                      >
                        {active ? "已选" : "选择"}
                      </span>
                    </div>
                    <div className="mt-1 text-xs leading-5 text-zinc-600">
                      {strategy.description}
                    </div>
                    <div className="mt-2 rounded bg-white px-2 py-1 text-[11px] font-semibold text-zinc-500">
                      {strategy.structure}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <Field label="目标时长">
            <TextInput
              type="number"
              min={15}
              max={20}
              value={draft.durationSec}
              onChange={(event) =>
                onDraftChange({ ...draft, durationSec: Number(event.target.value) })
              }
            />
          </Field>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <IconButton
              icon={FolderKanban}
              variant="line"
              onClick={onCreateProject}
              disabled={Boolean(busy)}
            >
              保存项目
            </IconButton>
            <IconButton icon={WandSparkles} onClick={onGenerateScript} disabled={Boolean(busy)}>
              生成剧本
            </IconButton>
          </div>
        </div>
      </section>

      <section className="rounded-md border border-line bg-white p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-black text-ink">剧本与分镜</h2>
            <p className="mt-1 text-sm text-zinc-500">
              {detail?.script?.strategy ?? activeStrategy?.structure ?? "等待 LangGraph Agent 生成"}
            </p>
          </div>
          <IconButton
            icon={RefreshCw}
            variant="line"
            onClick={onGenerateScript}
            disabled={Boolean(busy)}
          >
            重新生成
          </IconButton>
        </div>

        {detail?.script ? (
          <div className="mb-4 rounded-md border border-line bg-mist p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-bold text-ink">{detail.script.title}</div>
              <div className="rounded bg-white px-2 py-1 text-xs font-bold text-zinc-500">
                {totalDuration || draft.durationSec}s
              </div>
            </div>
            <div className="mt-2 text-sm leading-6 text-zinc-600">{detail.script.narrative}</div>
            <div className="mt-2 rounded border border-coral/20 bg-white px-3 py-2 text-sm font-semibold text-coral">
              {detail.script.hook}
            </div>
          </div>
        ) : (
          <div className="mb-4 rounded-md border border-dashed border-line p-5 text-sm text-zinc-500">
            选择商品、策略和目标时长后，即可生成新类型剧本。
          </div>
        )}

        <div className="grid gap-2">
          {sortedScenes.map((scene) => (
            <button
              key={scene.id}
              onClick={() => onSelectScene(scene.id)}
              className={`rounded-md border p-3 text-left transition ${
                selectedScene?.id === scene.id
                  ? "border-teal bg-teal-50"
                  : "border-line bg-white hover:border-zinc-300"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-ink">
                    {scene.order}. {scene.title}
                  </div>
                  <div className="mt-1 line-clamp-2 text-sm text-zinc-600">{scene.subtitle}</div>
                  <div className="mt-2 line-clamp-2 text-xs leading-5 text-zinc-500">
                    {scene.visual}
                  </div>
                  {scene.materialId ? (
                    <div className="mt-2 text-xs font-semibold text-teal">
                      已绑定素材：
                      {detail?.materials.find((material) => material.id === scene.materialId)
                        ?.name ?? "素材"}
                    </div>
                  ) : null}
                </div>
                <span className="shrink-0 rounded bg-white px-2 py-1 text-xs font-bold text-zinc-500">
                  {scene.durationSec}s
                </span>
              </div>
            </button>
          ))}
          {sortedScenes.length === 0 ? (
            <div className="rounded-md border border-dashed border-line p-6 text-center text-sm text-zinc-500">
              生成后显示分镜
            </div>
          ) : null}
        </div>
      </section>

      <section className="rounded-md border border-line bg-white p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-black text-ink">分镜编辑</h2>
          {selectedScene ? (
            <div className="flex gap-1">
              <button
                type="button"
                title="上移"
                className="grid h-9 w-9 place-items-center rounded-md border border-line hover:border-teal"
                onClick={() => onMoveScene(selectedScene, -1)}
              >
                <ChevronUp size={16} />
              </button>
              <button
                type="button"
                title="下移"
                className="grid h-9 w-9 place-items-center rounded-md border border-line hover:border-teal"
                onClick={() => onMoveScene(selectedScene, 1)}
              >
                <ChevronDown size={16} />
              </button>
            </div>
          ) : null}
        </div>

        {selectedScene && sceneDraft ? (
          <div className="grid gap-3">
            <Field label="绑定素材">
              <Select
                value={selectedScene.materialId ?? ""}
                onChange={(event) => {
                  const materialId = event.target.value;
                  const material = detail?.materials.find((item) => item.id === materialId);
                  onUpdateScene({
                    materialId,
                    materialSliceId: material?.slices[0]?.id ?? "",
                    generationMode: materialId ? "material_mix" : "mock"
                  });
                }}
              >
                <option value="">不绑定素材</option>
                {detail?.materials.map((material) => (
                  <option key={material.id} value={material.id}>
                    {material.name}
                  </option>
                ))}
              </Select>
            </Field>

            {selectedMaterial ? (
              <div className="rounded-md border border-line bg-mist p-2">
                <div className="aspect-video overflow-hidden rounded bg-zinc-100">
                  {selectedMaterial.mimeType.startsWith("image") ? (
                    <img
                      src={assetUrl(selectedMaterial.url)}
                      alt={selectedMaterial.name}
                      className="h-full w-full object-cover"
                    />
                  ) : selectedMaterial.mimeType.startsWith("video") ? (
                    <video
                      src={assetUrl(selectedMaterial.url)}
                      className="h-full w-full object-cover"
                      muted
                      controls
                    />
                  ) : (
                    <div className="grid h-full place-items-center text-sm text-zinc-500">
                      {selectedMaterial.type}
                    </div>
                  )}
                </div>
                <div className="mt-2 truncate text-xs font-semibold text-zinc-600">
                  {selectedMaterial.name}
                </div>
              </div>
            ) : null}

            {recommendations.length > 0 ? (
              <div className="rounded-md border border-line bg-white p-3">
                <div className="mb-2 text-xs font-bold uppercase tracking-normal text-zinc-500">
                  推荐素材
                </div>
                <div className="grid gap-2">
                  {recommendations.slice(0, 3).map((recommendation) => {
                    const previewUrl =
                      recommendation.slice?.thumbnailUrl ?? recommendation.material.url;
                    const isBound =
                      recommendation.material.id === selectedScene.materialId &&
                      (!recommendation.slice?.id ||
                        recommendation.slice.id === selectedScene.materialSliceId);

                    return (
                      <div
                        key={`${recommendation.material.id}-${
                          recommendation.slice?.id ?? "material"
                        }`}
                        className="grid grid-cols-[68px_minmax(0,1fr)] gap-2 rounded border border-line bg-mist p-2"
                      >
                        <div className="aspect-video overflow-hidden rounded bg-zinc-100">
                          {previewUrl ? (
                            <img
                              src={assetUrl(previewUrl)}
                              alt={recommendation.material.name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="grid h-full place-items-center text-[10px] font-semibold text-zinc-400">
                              推荐
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <div className="truncate text-xs font-bold text-ink">
                              {recommendation.material.name}
                            </div>
                            <span className="shrink-0 text-[10px] font-bold text-teal">
                              {recommendation.score.toFixed(1)}
                            </span>
                          </div>
                          <div className="mt-1 line-clamp-2 text-xs leading-4 text-zinc-600">
                            {recommendation.slice?.summary ?? recommendation.material.summary}
                          </div>
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <div className="min-w-0 truncate text-[10px] text-zinc-500">
                              {recommendation.reasons.join(" / ")}
                            </div>
                            <button
                              type="button"
                              disabled={isBound}
                              onClick={() => onApplyRecommendation(recommendation)}
                              className="shrink-0 rounded border border-line bg-white px-2 py-1 text-[10px] font-bold text-ink hover:border-teal hover:text-teal disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {isBound ? "已用" : "使用"}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <Field label="标题">
              <TextInput
                value={sceneDraft.title}
                onChange={(event) => changeSceneDraft("title", event.target.value)}
              />
            </Field>
            <Field label="画面">
              <TextArea
                value={sceneDraft.visual}
                onChange={(event) => changeSceneDraft("visual", event.target.value)}
              />
            </Field>
            <Field label="镜头">
              <TextArea
                value={sceneDraft.camera}
                onChange={(event) => changeSceneDraft("camera", event.target.value)}
              />
            </Field>
            <Field label="台词">
              <TextArea
                value={sceneDraft.voiceover}
                onChange={(event) => changeSceneDraft("voiceover", event.target.value)}
              />
            </Field>
            <Field label="字幕">
              <TextArea
                value={sceneDraft.subtitle}
                onChange={(event) => changeSceneDraft("subtitle", event.target.value)}
              />
            </Field>
            <Field label="时长">
              <TextInput
                type="number"
                min={1}
                max={8}
                value={sceneDraft.durationSec}
                onChange={(event) => changeSceneDraft("durationSec", Number(event.target.value))}
              />
            </Field>

            <div className="grid grid-cols-2 gap-2">
              <IconButton icon={Save} onClick={saveSceneDraft} disabled={Boolean(busy)}>
                保存分镜
              </IconButton>
              <IconButton
                icon={RotateCcw}
                variant="line"
                onClick={onRegenerateScene}
                disabled={Boolean(busy)}
              >
                单镜重生
              </IconButton>
            </div>
            <IconButton
              icon={Clapperboard}
              variant="line"
              onClick={() => onRenderScenePreview(sceneDraft)}
              disabled={Boolean(busy)}
            >
              单镜预览
            </IconButton>

            {scenePreviewJob ? (
              <div className="rounded-md border border-line bg-mist p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-bold uppercase tracking-normal text-zinc-500">
                    单镜预览
                  </div>
                  <StatusPill status={scenePreviewJob.status} />
                </div>
                {scenePreviewRunning ? (
                  <div className="mt-3">
                    <div className="h-2 overflow-hidden rounded bg-white">
                      <div
                        className="h-full bg-teal transition-all"
                        style={{ width: `${scenePreviewJob.progress}%` }}
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                      <span className="line-clamp-1 font-semibold text-ink">
                        {scenePreviewJob.currentStep}
                      </span>
                      <span className="shrink-0 text-zinc-500">{scenePreviewJob.progress}%</span>
                    </div>
                  </div>
                ) : null}
                {scenePreviewJob.error ? (
                  <div className="mt-3 rounded bg-red-50 p-2 text-xs leading-5 text-red-700">
                    {scenePreviewJob.error}
                  </div>
                ) : null}
                {scenePreviewVideo ? (
                  <div className="mt-3">
                    <video
                      src={scenePreviewUrl}
                      className="mx-auto aspect-[9/16] max-h-[360px] rounded bg-black object-contain"
                      controls
                    />
                    <a
                      href={scenePreviewUrl}
                      download
                      className="mt-2 inline-flex h-9 items-center gap-2 rounded border border-line bg-white px-3 text-xs font-bold text-ink hover:border-teal hover:text-teal"
                    >
                      <Download size={14} />
                      下载预览
                    </a>
                  </div>
                ) : !scenePreviewRunning ? (
                  <div className="mt-3 rounded border border-dashed border-line bg-white p-3 text-xs leading-5 text-zinc-500">
                    预览任务完成后会在这里显示视频。
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-line p-3 text-xs leading-5 text-zinc-500">
                点击“单镜预览”会只渲染当前分镜，适合检查局部画面、台词和节奏。
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-line p-6 text-center text-sm text-zinc-500">
            选择一个分镜
          </div>
        )}
      </section>
    </div>
  );
}
