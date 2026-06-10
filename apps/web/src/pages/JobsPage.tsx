import { RefreshCw, Upload } from "lucide-react";
import type { GeneratedVideo, GenerationTrace, RenderJob, VideoRatio } from "@advivid/shared";
import { TraceList } from "../components/TraceList";
import { Field, IconButton, Select, StatusPill } from "../components/ui";
import { VideoPreview } from "../components/VideoPreview";

interface JobsPageProps {
  latestJob?: RenderJob & { video?: GeneratedVideo; traces?: GenerationTrace[] };
  video?: GeneratedVideo;
  traces: GenerationTrace[];
  canRender: boolean;
  busy: string;
  renderRatio: VideoRatio;
  renderResolution: "720p" | "1080p";
  onRenderRatioChange: (ratio: VideoRatio) => void;
  onRenderResolutionChange: (resolution: "720p" | "1080p") => void;
  onRenderVideo: () => void;
  onRetryJob: () => void;
}

export function JobsPage({
  latestJob,
  video,
  traces,
  canRender,
  busy,
  renderRatio,
  renderResolution,
  onRenderRatioChange,
  onRenderResolutionChange,
  onRenderVideo,
  onRetryJob
}: JobsPageProps) {
  const taskLabels: Record<string, string> = {
    video_render: "整片渲染",
    scene_preview: "单镜预览",
    script_generation: "剧本生成",
    material_analysis: "素材分析"
  };

  const renderControls = (
    <div className="mt-4 grid gap-3 rounded-md border border-line bg-mist p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="导出比例">
          <Select
            value={renderRatio}
            onChange={(event) => onRenderRatioChange(event.target.value as VideoRatio)}
          >
            <option value="9:16">9:16 竖版</option>
            <option value="16:9">16:9 横版</option>
          </Select>
        </Field>
        <Field label="导出清晰度">
          <Select
            value={renderResolution}
            onChange={(event) => onRenderResolutionChange(event.target.value as "720p" | "1080p")}
          >
            <option value="720p">720p</option>
            <option value="1080p">1080p</option>
          </Select>
        </Field>
      </div>
      <div className="flex gap-2">
        <IconButton icon={Upload} onClick={onRenderVideo} disabled={Boolean(busy || !canRender)}>
          新任务
        </IconButton>
        <IconButton
          icon={RefreshCw}
          variant="line"
          disabled={!latestJob || busy === "重试任务"}
          onClick={onRetryJob}
        >
          重试
        </IconButton>
      </div>
    </div>
  );

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <section className="rounded-md border border-line bg-white p-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-black text-ink">任务进度</h2>
            {latestJob ? (
              <div className="mt-1 text-xs font-semibold text-zinc-500">
                {taskLabels[latestJob.taskType] ?? latestJob.taskType}
              </div>
            ) : null}
          </div>
          {latestJob ? <StatusPill status={latestJob.status} /> : null}
        </div>
        {latestJob ? (
          <div>
            <div className="h-3 overflow-hidden rounded bg-zinc-100">
              <div
                className="h-full bg-teal transition-all"
                style={{ width: `${latestJob.progress}%` }}
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-semibold text-ink">{latestJob.currentStep}</span>
              <span className="text-zinc-500">{latestJob.progress}%</span>
            </div>
            {latestJob.error ? (
              <div className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700">
                {latestJob.error}
              </div>
            ) : null}
            {renderControls}
          </div>
        ) : (
          <div>
            <div className="rounded-md border border-dashed border-line p-6 text-sm text-zinc-500">
              暂无任务
            </div>
            {renderControls}
          </div>
        )}
        <div className="mt-5">
          <h3 className="mb-3 text-sm font-bold text-ink">生成 Trace</h3>
          <TraceList traces={traces} />
        </div>
      </section>
      <VideoPreview video={video} />
    </div>
  );
}
