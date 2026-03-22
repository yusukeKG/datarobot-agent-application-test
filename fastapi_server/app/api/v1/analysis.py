# Copyright 2025 DataRobot, Inc.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#   http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""Power-consumption analysis endpoint with 3-agent sequential workflow.

Agent 1 calls the CrewAI divergence-analysis agent via the DRUM endpoint.
Agents 2 and 3 still return mock responses (to be implemented later).
"""

from __future__ import annotations

import json
import logging
from typing import Any, AsyncIterator

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from openai import AsyncOpenAI
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

analysis_router = APIRouter(prefix="/analysis", tags=["analysis"])


# ---------------------------------------------------------------------------
# Request / helper models
# ---------------------------------------------------------------------------


class AnomalyItem(BaseModel):
    timestamp: str
    power: float
    power_prediction: float
    diff: float
    diff_pct: float


class AnalysisRequest(BaseModel):
    """Payload sent by the sensors page."""

    start_date: str = Field(..., description="分析期間の開始日 (yyyy-MM-dd)")
    end_date: str = Field(..., description="分析期間の終了日 (yyyy-MM-dd)")
    anomaly_points: list[AnomalyItem] = Field(
        default_factory=list,
        description="予実乖離が閾値を超えた異常データポイント",
    )
    total_data_points: int = Field(0, description="期間内の全データポイント数")


# ---------------------------------------------------------------------------
# SSE helper
# ---------------------------------------------------------------------------


def _sse_event(event: str, data: dict[str, Any]) -> str:
    """Format a single SSE frame."""
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


# ---------------------------------------------------------------------------
# Agent 1: Real LLM call via DRUM endpoint
# ---------------------------------------------------------------------------

_NO_ANOMALY_REPORT = (
    "## 予実乖離分析レポート\n\n"
    "**対象期間**: {start_date} ～ {end_date}\n\n"
    "この期間において、電力消費量の実績値と DataRobot 予測値の間に"
    "有意な乖離は検出されませんでした。\n\n"
    "設備は正常な稼働範囲内にあると判断されます。"
)


async def _agent_1_divergence_analysis(
    req: AnalysisRequest,
    agent_endpoint: str,
    api_token: str,
) -> str:
    """Agent 1: 予実乖離の時系列分析（LLM Gateway 経由）."""
    if not req.anomaly_points:
        return _NO_ANOMALY_REPORT.format(
            start_date=req.start_date, end_date=req.end_date
        )

    payload = {
        "start_date": req.start_date,
        "end_date": req.end_date,
        "total_data_points": req.total_data_points,
        "anomaly_points": [ap.model_dump() for ap in req.anomaly_points],
    }

    client = AsyncOpenAI(
        base_url=agent_endpoint,
        api_key=api_token,
        default_headers={"Authorization": f"Bearer {api_token}"},
    )
    try:
        response = await client.chat.completions.create(
            model="custom-model",
            messages=[
                {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
            ],
            stream=False,
        )
        return response.choices[0].message.content or ""
    except Exception:
        logger.exception("Agent 1 LLM call failed")
        raise


async def _agent_2_past_cases(
    analysis_summary: str,
    req: AnalysisRequest,
    agent_endpoint: str,
    api_token: str,
) -> str:
    """Agent 2: 過去の類似事例検索（LLM Gateway 経由）."""
    if not req.anomaly_points:
        return (
            "## 過去事例検索結果\n\n"
            "現在の分析では有意な異常が検出されていないため、"
            "過去の類似事例検索は省略されました。"
        )

    payload = {
        "agent_type": "past_case_search",
        "analysis_summary": analysis_summary,
        "anomaly_points": [ap.model_dump() for ap in req.anomaly_points],
    }

    client = AsyncOpenAI(
        base_url=agent_endpoint,
        api_key=api_token,
        default_headers={"Authorization": f"Bearer {api_token}"},
    )
    try:
        response = await client.chat.completions.create(
            model="custom-model",
            messages=[
                {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
            ],
            stream=False,
        )
        return response.choices[0].message.content or ""
    except Exception:
        logger.exception("Agent 2 LLM call failed")
        raise


async def _agent_3_maintenance_actions(
    analysis_summary: str,
    past_cases: str,
    req: AnalysisRequest,
    agent_endpoint: str,
    api_token: str,
) -> str:
    """Agent 3: 保守アクション提案（LLM Gateway 経由）."""
    if len(req.anomaly_points) == 0:
        return (
            "## 推奨アクション\n\n"
            "現時点で緊急の対応は不要です。\n\n"
            "定期点検スケジュールに従い、次回点検時に"
            "センサーの校正確認を行うことを推奨します。"
        )

    payload = {
        "agent_type": "maintenance_action",
        "analysis_summary": analysis_summary,
        "past_cases": past_cases,
    }

    client = AsyncOpenAI(
        base_url=agent_endpoint,
        api_key=api_token,
        default_headers={"Authorization": f"Bearer {api_token}"},
    )
    try:
        response = await client.chat.completions.create(
            model="custom-model",
            messages=[
                {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
            ],
            stream=False,
        )
        return response.choices[0].message.content or ""
    except Exception:
        logger.exception("Agent 3 LLM call failed")
        raise


# ---------------------------------------------------------------------------
# SSE streaming endpoint
# ---------------------------------------------------------------------------


async def _run_analysis_pipeline(
    req: AnalysisRequest,
    agent_endpoint: str,
    api_token: str,
) -> AsyncIterator[str]:
    """Run the 3-agent pipeline, yielding SSE events."""

    agents = [
        {
            "agent_id": 1,
            "title": "予実乖離の時系列分析",
            "description": "予測と実績の乖離パターンを時間軸方向に分析しています…",
        },
        {
            "agent_id": 2,
            "title": "過去事例の検索",
            "description": "過去の保守報告書から類似事例を検索しています…",
        },
        {
            "agent_id": 3,
            "title": "保守アクションの提案",
            "description": "分析結果と過去事例に基づき推奨アクションを生成しています…",
        },
    ]

    # Emit all agents as "pending" first
    for agent in agents:
        yield _sse_event(
            "agent_step",
            {
                "agent_id": agent["agent_id"],
                "title": agent["title"],
                "description": agent["description"],
                "status": "pending",
                "content": "",
            },
        )

    # --- Agent 1 ---
    yield _sse_event(
        "agent_step",
        {
            "agent_id": 1,
            "title": agents[0]["title"],
            "status": "running",
            "content": "",
        },
    )
    try:
        agent1_result = await _agent_1_divergence_analysis(
            req, agent_endpoint, api_token
        )
    except Exception as exc:
        agent1_result = f"## エラー\n\nAgent 1 の実行中にエラーが発生しました: {exc}"
    yield _sse_event(
        "agent_step",
        {
            "agent_id": 1,
            "title": agents[0]["title"],
            "status": "completed",
            "content": agent1_result,
        },
    )

    # --- Agent 2 ---
    yield _sse_event(
        "agent_step",
        {
            "agent_id": 2,
            "title": agents[1]["title"],
            "status": "running",
            "content": "",
        },
    )
    try:
        agent2_result = await _agent_2_past_cases(
            agent1_result, req, agent_endpoint, api_token
        )
    except Exception as exc:
        agent2_result = f"## エラー\n\nAgent 2 の実行中にエラーが発生しました: {exc}"
    yield _sse_event(
        "agent_step",
        {
            "agent_id": 2,
            "title": agents[1]["title"],
            "status": "completed",
            "content": agent2_result,
        },
    )

    # --- Agent 3 ---
    yield _sse_event(
        "agent_step",
        {
            "agent_id": 3,
            "title": agents[2]["title"],
            "status": "running",
            "content": "",
        },
    )
    try:
        agent3_result = await _agent_3_maintenance_actions(
            agent1_result, agent2_result, req, agent_endpoint, api_token
        )
    except Exception as exc:
        agent3_result = f"## エラー\n\nAgent 3 の実行中にエラーが発生しました: {exc}"
    yield _sse_event(
        "agent_step",
        {
            "agent_id": 3,
            "title": agents[2]["title"],
            "status": "completed",
            "content": agent3_result,
        },
    )

    # --- Done ---
    yield _sse_event("analysis_complete", {"status": "done"})


@analysis_router.post("/power-consumption")
async def analyze_power_consumption(
    req: AnalysisRequest,
    request: Request,
) -> StreamingResponse:
    """Run the 3-agent power-consumption analysis pipeline.

    Returns an SSE stream with ``agent_step`` events for each agent
    and an ``analysis_complete`` event when the pipeline finishes.
    """
    config = request.app.state.deps.config
    return StreamingResponse(
        _run_analysis_pipeline(
            req,
            agent_endpoint=config.agent_endpoint,
            api_token=config.datarobot_api_token,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
