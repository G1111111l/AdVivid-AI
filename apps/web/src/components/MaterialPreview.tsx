import { Image as ImageIcon, RefreshCw, ShieldCheck, Trash2, Video } from "lucide-react";
import type { Material } from "@advivid/shared";
import { assetUrl } from "../utils/assets";

const typeLabels: Record<Material["type"], string> = {
  product_image: "商品图",
  product_video: "商品视频",
  reference_image: "参考图",
  reference_video: "参考视频",
  generated_video: "生成视频",
  audio: "音频"
};

const formatBytes = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return "-";
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
};

export function MaterialPreview({
  material,
  onAnalyze,
  onDelete
}: {
  material: Material;
  onAnalyze?: () => void;
  onDelete?: () => void;
}) {
  const src = assetUrl(material.url);
  const isProductMaterial = material.type === "product_image" || material.type === "product_video";
  const isVideo = material.mimeType.startsWith("video");
  const isImage = material.mimeType.startsWith("image");
  const hasCutout = Boolean(material.cutoutUrl && material.cutoutStatus === "ready");
  const RoleIcon = isVideo ? Video : ImageIcon;

  return (
    <div
      className={`rounded-md border bg-white p-3 ${
        isProductMaterial ? "border-teal-200" : "border-line"
      }`}
    >
      <div className="aspect-video overflow-hidden rounded bg-zinc-100">
        {isImage ? (
          <img
            src={src}
            alt={material.name}
            className={`h-full w-full ${isProductMaterial ? "object-contain" : "object-cover"}`}
          />
        ) : isVideo ? (
          <video
            src={src}
            className={`h-full w-full ${isProductMaterial ? "object-contain" : "object-cover"}`}
            muted
            controls
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-zinc-500">
            {material.type}
          </div>
        )}
      </div>
      <div className="mt-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-ink">{material.name}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-bold ${
                isProductMaterial
                  ? "bg-teal-50 text-teal-700"
                  : "bg-zinc-100 text-zinc-600"
              }`}
            >
              {isProductMaterial ? <ShieldCheck size={12} /> : <RoleIcon size={12} />}
              {typeLabels[material.type]}
            </span>
            <span className="rounded bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-500">
              {formatBytes(material.size)}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            title="重新分析"
            onClick={onAnalyze}
            className="grid h-8 w-8 place-items-center rounded-md border border-line bg-white text-zinc-500 hover:border-teal hover:text-teal"
          >
            <RefreshCw size={14} />
          </button>
          <button
            type="button"
            title="删除素材"
            onClick={onDelete}
            className="grid h-8 w-8 place-items-center rounded-md border border-line bg-white text-zinc-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      <div
        className={`mt-3 rounded-md border px-3 py-2 text-xs leading-5 ${
          isProductMaterial
            ? "border-teal-200 bg-teal-50 text-teal-800"
            : "border-zinc-200 bg-zinc-50 text-zinc-600"
        }`}
      >
        {isProductMaterial
          ? hasCutout
            ? "已生成透明商品前景，成片会把它叠加到 Seedance 场景中，替代模型自己生成的商品。"
            : "商品图会先进行抠图分析，生成透明前景后再参与视频融合。"
          : "作为场景、风格和镜头参考，帮助分镜匹配更合适的表达。"}
      </div>
      {hasCutout ? (
        <div className="mt-3 rounded-md border border-teal-200 bg-[linear-gradient(45deg,#f4f4f5_25%,transparent_25%),linear-gradient(-45deg,#f4f4f5_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#f4f4f5_75%),linear-gradient(-45deg,transparent_75%,#f4f4f5_75%)] bg-[length:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0] p-2">
          <div className="mb-2 text-xs font-bold text-teal-700">透明商品前景</div>
          <img
            src={assetUrl(material.cutoutUrl)}
            alt={`${material.name} cutout`}
            className="mx-auto max-h-28 object-contain"
          />
        </div>
      ) : material.cutoutStatus === "failed" ? (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
          自动抠图失败。建议上传白底或纯色背景商品图，或点击重新分析。
        </div>
      ) : null}
      {material.summary ? (
        <div className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-500">{material.summary}</div>
      ) : null}
      {!material.summary && material.tags.length === 0 ? (
        <div className="mt-3 rounded-md border border-dashed border-line px-3 py-2 text-xs text-zinc-500">
          尚未完成结构化分析，可点击刷新按钮重新分析。
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {material.tags.slice(0, 5).map((tag) => (
          <span key={tag} className="rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-600">
            {tag}
          </span>
        ))}
      </div>
      {material.slices.length > 0 ? (
        <div className="mt-3 border-t border-line pt-3">
          <div className="mb-2 text-xs font-bold uppercase tracking-normal text-zinc-500">
            {material.slices.length} slices
          </div>
          <div className="grid gap-2">
            {material.slices.slice(0, 4).map((slice) => (
              <div
                key={slice.id}
                className="grid grid-cols-[72px_minmax(0,1fr)] gap-2 rounded border border-line bg-mist p-2"
              >
                <div className="aspect-video overflow-hidden rounded bg-zinc-100">
                  {slice.thumbnailUrl ? (
                    <img
                      src={assetUrl(slice.thumbnailUrl)}
                      alt={slice.summary}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="grid h-full place-items-center text-[10px] font-semibold text-zinc-400">
                      {slice.index + 1}
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-ink">
                    {slice.startSec}s - {slice.endSec}s
                  </div>
                  <div className="mt-0.5 line-clamp-2 text-xs leading-4 text-zinc-600">
                    {slice.summary}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {slice.tags.slice(-2).map((tag) => (
                      <span
                        key={tag}
                        className="rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold text-teal"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
