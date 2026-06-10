import type { Material, Product, RenderPlan, Scene, Script, GenerationTrace } from "@advivid/shared";
import { creativeNodes, type CreativeAgentState } from "../nodes/mockNodes.js";

export interface RunCreativeAgentInput {
  projectId: string;
  scriptId: string;
  product: Product;
  materials: Material[];
}

export interface RunCreativeAgentResult {
  script: Script;
  scenes: Scene[];
  renderPlan: RenderPlan;
  trace: GenerationTrace[];
}

async function runSerial(input: RunCreativeAgentInput): Promise<CreativeAgentState> {
  let state: CreativeAgentState = {
    ...input,
    trace: []
  };

  for (const node of [
    creativeNodes.productAnalyzer,
    creativeNodes.materialRetriever,
    creativeNodes.strategySelector,
    creativeNodes.scriptWriter,
    creativeNodes.scenePlanner,
    creativeNodes.reviewAgent,
    creativeNodes.renderPlanner
  ]) {
    const update = await node(state);
    state = { ...state, ...update };
  }

  return state;
}

async function runWithLangGraph(input: RunCreativeAgentInput): Promise<CreativeAgentState> {
  const mod = await import("@langchain/langgraph");
  const Annotation = mod.Annotation as any;
  const StateGraph = mod.StateGraph as any;
  const START = mod.START as string;
  const END = mod.END as string;

  const State = Annotation.Root({
    projectId: Annotation(),
    scriptId: Annotation(),
    product: Annotation(),
    materials: Annotation(),
    productProfile: Annotation(),
    retrievedMaterials: Annotation(),
    creativeStrategy: Annotation(),
    scriptDraft: Annotation(),
    scenes: Annotation(),
    reviewResult: Annotation(),
    renderPlan: Annotation(),
    trace: Annotation({
      reducer: (_left: GenerationTrace[], right: GenerationTrace[]) => right,
      default: () => []
    })
  });

  const graph = new StateGraph(State)
    .addNode("ProductAnalyzer", creativeNodes.productAnalyzer)
    .addNode("MaterialRetriever", creativeNodes.materialRetriever)
    .addNode("StrategySelector", creativeNodes.strategySelector)
    .addNode("ScriptWriter", creativeNodes.scriptWriter)
    .addNode("ScenePlanner", creativeNodes.scenePlanner)
    .addNode("ReviewAgent", creativeNodes.reviewAgent)
    .addNode("RenderPlanner", creativeNodes.renderPlanner)
    .addEdge(START, "ProductAnalyzer")
    .addEdge("ProductAnalyzer", "MaterialRetriever")
    .addEdge("MaterialRetriever", "StrategySelector")
    .addEdge("StrategySelector", "ScriptWriter")
    .addEdge("ScriptWriter", "ScenePlanner")
    .addEdge("ScenePlanner", "ReviewAgent")
    .addEdge("ReviewAgent", "RenderPlanner")
    .addEdge("RenderPlanner", END)
    .compile();

  return graph.invoke({
    ...input,
    trace: []
  });
}

export async function runCreativeAgent(input: RunCreativeAgentInput): Promise<RunCreativeAgentResult> {
  let state: CreativeAgentState;

  try {
    state = await runWithLangGraph(input);
  } catch {
    state = await runSerial(input);
  }

  if (!state.scriptDraft || !state.scenes || !state.renderPlan) {
    throw new Error("Creative agent did not produce a complete script.");
  }

  return {
    script: {
      ...state.scriptDraft,
      scenes: state.scenes
    },
    scenes: state.scenes,
    renderPlan: state.renderPlan,
    trace: state.trace
  };
}
