# Python Agent Service

Python FastAPI service for the AdVivid creative Agent.

It uses LangGraph for the workflow:

```text
ProductAnalyzer
  -> MaterialRetriever
  -> StrategySelector
  -> ScriptWriter
  -> ScenePlanner
  -> ReviewAgent
  -> RenderPlanner
```

## Run

```bash
python -m pip install -r apps/agent-python/requirements.txt
python -m uvicorn app.main:app --app-dir apps/agent-python --host 0.0.0.0 --port 8002 --reload
```

The Node API calls this service at `PYTHON_AGENT_URL`.
