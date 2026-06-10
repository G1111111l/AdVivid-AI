import { Download } from "lucide-react";
import type { GeneratedVideo } from "@advivid/shared";
import { api } from "../api/client";
import { assetUrl } from "../utils/assets";

export function VideoPreview({ video }: { video?: GeneratedVideo }) {
  if (!video) {
    return (
      <div className="flex aspect-[9/16] max-h-[540px] items-center justify-center rounded-md border border-dashed border-line bg-white text-sm text-zinc-500">
        暂无成片
      </div>
    );
  }

  const url = assetUrl(video.url);
  const isVideo = video.url.endsWith(".mp4") || video.url.endsWith(".webm");

  return (
    <div className="rounded-md border border-line bg-white p-3">
      {isVideo ? (
        <video src={url} className="mx-auto aspect-[9/16] max-h-[540px] rounded bg-black object-contain" controls />
      ) : (
        <div className="grid aspect-[9/16] max-h-[540px] place-items-center rounded bg-zinc-100 p-6 text-center text-sm text-zinc-600">
          已生成兜底渲染说明
        </div>
      )}
      <a
        href={api.url(`/api/videos/${video.id}/export`)}
        className="mt-3 inline-flex h-10 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-ink hover:border-teal hover:text-teal"
      >
        <Download size={16} />
        导出
      </a>
    </div>
  );
}
