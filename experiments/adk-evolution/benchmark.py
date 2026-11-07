"""Isolated orchestration overhead benchmark; no LLM or game mutation."""
import asyncio
import json
import statistics
import time
from google.adk.agents import SequentialAgent, LoopAgent, BaseAgent
from google.adk.events import Event
from google.adk.runners import InMemoryRunner
from google.genai import types

class NoopAgent(BaseAgent):
    async def _run_async_impl(self, ctx):
        yield Event(author=self.name, content=types.Content(parts=[types.Part(text="ok")]))

async def measure(use_adk, n=30):
    times = []
    for _ in range(n):
        start = time.perf_counter()
        if use_adk:
            root = SequentialAgent(name="pipeline", sub_agents=[
                NoopAgent(name="invent"), NoopAgent(name="build"), NoopAgent(name="qa")
            ])
            runner = InMemoryRunner(agent=root, app_name="adk_benchmark")
            await runner.session_service.create_session(app_name="adk_benchmark", user_id="benchmark", session_id="test")
            async for _ in runner.run_async(user_id="benchmark", session_id="test",
                new_message=types.Content(role="user", parts=[types.Part(text="test")])):
                pass
        else:
            for _ in ("invent", "build", "qa"):
                await asyncio.sleep(0)
        times.append((time.perf_counter() - start) * 1000)
    return {"median_ms": round(statistics.median(times), 3), "p95_ms": round(sorted(times)[int(n*.95)-1], 3)}

async def main():
    baseline = await measure(False)
    adk = await measure(True)
    result = {"baseline": baseline, "adk": adk, "scope": "orchestration_only_no_llm_no_game",
              "game_feature_throughput": "NOT_MEASURED"}
    print(json.dumps(result, indent=2))
    assert baseline["median_ms"] >= 0 and adk["median_ms"] >= 0

if __name__ == "__main__":
    asyncio.run(main())
