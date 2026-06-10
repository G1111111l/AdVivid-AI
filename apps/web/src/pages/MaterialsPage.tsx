import { ImagePlus, Search, ShieldCheck } from "lucide-react";
import type { ProjectDetail } from "../api/client";
import { materialTypes, type MaterialTypeOption } from "../appConfig";
import { MaterialPreview } from "../components/MaterialPreview";
import { Field, Select, TextInput } from "../components/ui";

interface MaterialsPageProps {
  detail?: ProjectDetail;
  materialType: MaterialTypeOption;
  materialQuery: string;
  onMaterialTypeChange: (type: MaterialTypeOption) => void;
  onMaterialQueryChange: (query: string) => void;
  onUploadMaterial: (file?: File) => void;
  onSearchMaterials: () => void;
  onAnalyzeMaterial: (materialId: string) => void;
  onDeleteMaterial: (materialId: string) => void;
}

export function MaterialsPage({
  detail,
  materialType,
  materialQuery,
  onMaterialTypeChange,
  onMaterialQueryChange,
  onUploadMaterial,
  onSearchMaterials,
  onAnalyzeMaterial,
  onDeleteMaterial
}: MaterialsPageProps) {
  const materials = detail?.materials ?? [];
  const productMaterials = materials.filter((material) => material.type.startsWith("product_"));
  const referenceMaterials = materials.filter((material) => material.type.startsWith("reference_"));
  const uploadAccept = materialType.endsWith("_video") ? "video/*" : "image/*";
  const uploadDisabled = !detail?.project.id;

  return (
    <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
      <section className="rounded-md border border-line bg-white p-4">
        <h2 className="text-base font-black text-ink">素材入库</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-500">
          商品图会先生成透明前景，再自然叠加到生成视频中；参考素材只参与标签、摘要和分镜建议。
        </p>
        <div className="mt-4 grid gap-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-md border border-teal-200 bg-teal-50 p-3">
              <div className="text-xs font-bold text-teal-700">商品素材</div>
              <div className="mt-1 text-2xl font-black text-teal-800">
                {productMaterials.length}
              </div>
            </div>
            <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
              <div className="text-xs font-bold text-zinc-600">参考素材</div>
              <div className="mt-1 text-2xl font-black text-zinc-800">
                {referenceMaterials.length}
              </div>
            </div>
          </div>
          <Field label="类型">
            <Select
              value={materialType}
              onChange={(event) => onMaterialTypeChange(event.target.value as MaterialTypeOption)}
              disabled={uploadDisabled}
            >
              {materialTypes.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <label
            className={`flex min-h-36 flex-col items-center justify-center gap-3 rounded-md border border-dashed px-4 text-center text-sm font-semibold transition ${
              uploadDisabled
                ? "cursor-not-allowed border-zinc-200 bg-zinc-50 text-zinc-400"
                : "cursor-pointer border-line bg-mist text-zinc-600 hover:border-teal hover:text-teal"
            }`}
          >
            <ImagePlus size={24} />
            <span>{uploadDisabled ? "请先创建或选择项目" : "上传当前项目素材"}</span>
            <span className="text-xs font-medium text-zinc-400">
              {materialType.endsWith("_video") ? "支持视频文件" : "支持图片文件"}
            </span>
            <input
              type="file"
              className="hidden"
              disabled={uploadDisabled}
              accept={uploadAccept}
              onChange={(event) => onUploadMaterial(event.target.files?.[0])}
            />
          </label>
          <div className="rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-xs leading-5 text-teal-800">
            <div className="mb-1 flex items-center gap-1.5 font-bold">
              <ShieldCheck size={13} />
              商品一致性规则
            </div>
            成片时系统会用上传商品前景替代模型生成的商品，尽量保持包装、颜色、形状与原图一致。
          </div>
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
            请上传自有或已获授权的素材；参考素材仅用于结构化分析和创作参考。
          </div>
          <div className="flex gap-2">
            <TextInput
              placeholder="关键词、标签、场景"
              value={materialQuery}
              onChange={(event) => onMaterialQueryChange(event.target.value)}
            />
            <button
              type="button"
              className="grid h-10 w-10 place-items-center rounded-md bg-ink text-white"
              disabled={!detail?.project.id}
              onClick={onSearchMaterials}
            >
              <Search size={16} />
            </button>
          </div>
        </div>
      </section>
      <section className="rounded-md border border-line bg-white p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-black text-ink">结构化资产</h2>
          <span className="text-sm font-semibold text-zinc-500">
            {materials.length} items
          </span>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {materials.map((material) => (
            <MaterialPreview
              key={material.id}
              material={material}
              onAnalyze={() => onAnalyzeMaterial(material.id)}
              onDelete={() => onDeleteMaterial(material.id)}
            />
          ))}
          {!materials.length ? (
            <div className="rounded-md border border-dashed border-line p-6 text-sm leading-6 text-zinc-500">
              {detail
                ? "暂无素材。建议先上传 1 张商品图，后续成片会优先保持商品外观一致。"
                : "请先在创作台创建或选择项目，再为该项目上传商品素材。"}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
