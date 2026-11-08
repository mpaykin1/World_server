"""Read-only real-repository task executed directly and through Google ADK.

This verifies integration, not a claim of improved game-development throughput.
"""
import asyncio
import hashlib
import json
import os
from pathlib import Path
import time

from google.adk.agents import BaseAgent, SequentialAgent
from google.adk.events import Event
from google.adk.runners import InMemoryRunner
from google.genai import types

ROOT = Path(__file__).resolve().parents[2]
TARGETS = (
    "experiments/adk-evolution/benchmark.py",
    "docs/OSTROV_SUMEREK_BASELINES_AND_ADK.md",
    ".github/workflows/adk-install-probe.yml",
)

def audit():
    """Real deterministic task: verify files and their SHA-256 on checkout."""
    result = {}
    for relative in TARGETS:
        path = ROOT / relative
        if not path.is_file():
            raise FileNotFoundError(relative)
        raw = path.read_bytes()
        result[relative] = {"bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()}
    return result

class AuditAgent(BaseAgent):
    async def _run_async_impl(self, ctx):
        report = json.dumps(audit(), sort_keys=True)
        yield Event(author=self.name, content=types.Content(
            role="model", parts=[types.Part(text=report)]
        ))

async def adk_audit():
    root = SequentialAgent(name="audit_pipeline", sub_agents=[AuditAgent(name="repository_auditor")])
    runner = InMemoryRunner(agent=root, app_name="repository_audit")
    await runner.session_service.create_session(
        app_name="repository_audit", user_id="ci", session_id="audit"
    )
    payloads = []
    async for event in runner.run_async(
        user_id="ci", session_id="audit",
        new_message=types.Content(role="user", parts=[types.Part(text="audit checkout")])
    ):
        if event.author == "repository_auditor" and event.content:
            for part in event.content.parts or []:
                if part.text:
                    payloads.append(json.loads(part.text))
    if len(payloads) != 1:
        raise AssertionError(f"Expected exactly one ADK audit result, got {len(payloads)}")
    return payloads[0]

async def main():
    t0 = time.perf_counter()
    direct = audit()
    direct_ms = (time.perf_counter() - t0) * 1000
    t1 = time.perf_counter()
    via_adk = await adk_audit()
    adk_ms = (time.perf_counter() - t1) * 1000
    assert direct == via_adk, "ADK result differs from direct audit"
    print(json.dumps({
        "scope": "real_repository_read_only_audit_no_llm_no_game_mutation",
        "direct_ms": round(direct_ms, 3),
        "adk_ms": round(adk_ms, 3),
        "same_verified_result": True,
        "audited_files": direct,
        "game_development_productivity": "NOT_MEASURED",
        "five_hourly_roles_integrated": False,
    }, indent=2, sort_keys=True))

if __name__ == "__main__":
    asyncio.run(main())
