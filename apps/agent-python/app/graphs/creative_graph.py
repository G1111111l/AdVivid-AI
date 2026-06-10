from __future__ import annotations

from langgraph.graph import END, START, StateGraph

from app.nodes import (
    CreativeState,
    material_retriever,
    product_analyzer,
    render_planner,
    review_agent,
    scene_planner,
    script_writer,
    strategy_selector,
)
from app.schemas import GenerateScriptRequest, GenerateScriptResponse, Script


def build_creative_graph():
    graph = StateGraph(CreativeState)
    graph.add_node("ProductAnalyzer", product_analyzer)
    graph.add_node("MaterialRetriever", material_retriever)
    graph.add_node("StrategySelector", strategy_selector)
    graph.add_node("ScriptWriter", script_writer)
    graph.add_node("ScenePlanner", scene_planner)
    graph.add_node("ReviewAgent", review_agent)
    graph.add_node("RenderPlanner", render_planner)

    graph.add_edge(START, "ProductAnalyzer")
    graph.add_edge("ProductAnalyzer", "MaterialRetriever")
    graph.add_edge("MaterialRetriever", "StrategySelector")
    graph.add_edge("StrategySelector", "ScriptWriter")
    graph.add_edge("ScriptWriter", "ScenePlanner")
    graph.add_edge("ScenePlanner", "ReviewAgent")
    graph.add_edge("ReviewAgent", "RenderPlanner")
    graph.add_edge("RenderPlanner", END)
    return graph.compile()


CREATIVE_GRAPH = build_creative_graph()


async def run_creative_graph(request: GenerateScriptRequest) -> GenerateScriptResponse:
    state = await CREATIVE_GRAPH.ainvoke(
        {
            "projectId": request.projectId,
            "scriptId": request.scriptId,
            "product": request.product,
            "materials": request.materials,
            "trace": [],
        }
    )

    scenes = state["scenes"]
    script = Script(**state["scriptDraft"], scenes=scenes)
    return GenerateScriptResponse(
        script=script,
        scenes=scenes,
        renderPlan=state["renderPlan"],
        trace=state["trace"],
    )
