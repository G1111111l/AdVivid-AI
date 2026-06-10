import type {
  GenerationTrace,
  Material,
  Product,
  RenderPlan,
  Scene,
  Script
} from "@advivid/shared";
import { config } from "../config.js";

export interface PythonAgentInput {
  projectId: string;
  scriptId: string;
  product: Product;
  materials: Material[];
}

export interface PythonAgentResult {
  script: Script;
  scenes: Scene[];
  renderPlan: RenderPlan;
  trace: GenerationTrace[];
}

export async function runPythonCreativeAgent(input: PythonAgentInput): Promise<PythonAgentResult> {
  const response = await fetch(`${config.pythonAgentUrl}/agent/generate-script`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(config.pythonAgentTimeoutSeconds * 1000)
  });

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(`Python Agent failed: ${response.status} ${message}`);
  }

  return (await response.json()) as PythonAgentResult;
}
