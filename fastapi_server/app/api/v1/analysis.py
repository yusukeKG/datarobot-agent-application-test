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

Current implementation returns mock (dummy) responses.
To switch to real LLM-backed agents, replace the ``_mock_agent_*`` helpers
with CrewAI agents that call ``build_llm`` via the DataRobot LLM Gateway.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, AsyncIterator

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
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
# Mock agent implementations
# ---------------------------------------------------------------------------


async def _mock_agent_1_divergence_analysis(
    req: AnalysisRequest,
) -> str:
    """Agent 1: 予実乖離の時系列分析（モック）."""
    await asyncio.sleep(1.5)

    n_anomalies = len(req.anomaly_points)
    if n_anomalies == 0:
        return (
            f"## 予実乖離分析レポート\n\n"
            f"**対象期間**: {req.start_date} ～ {req.end_date}\n\n"
            f"この期間において、電力消費量の実績値と DataRobot 予測値の間に"
            f"有意な乖離は検出されませんでした。\n\n"
            f"設備は正常な稼働範囲内にあると判断されます。"
        )

    # 乖離の時間軸パターンを模擬
    timestamps = [a.timestamp for a in req.anomaly_points]
    max_diff = max(req.anomaly_points, key=lambda a: abs(a.diff))

    return (
        f"## 予実乖離分析レポート\n\n"
        f"**対象期間**: {req.start_date} ～ {req.end_date}  \n"
        f"**全データ数**: {req.total_data_points} 件  \n"
        f"**異常検知数**: {n_anomalies} 件  \n"
        f"**異常発生率**: {n_anomalies / max(req.total_data_points, 1) * 100:.1f}%\n\n"
        f"### 主要な発見事項\n\n"
        f"1. **最大乖離**: {max_diff.timestamp} に "
        f"{max_diff.diff:+.1f} kWh（{max_diff.diff_pct:+.1f}%）の乖離を検出。"
        f"これは予測モデルが想定する正常稼働範囲を大きく超えており、"
        f"負荷の急変またはポンプ効率の低下が疑われます。\n\n"
        f"2. **時間軸トレンド**: 乖離は期間の後半に集中しており、"
        f"**乖離幅が拡大傾向** にあります。これは一過性の外乱ではなく、"
        f"設備の状態が徐々に劣化している可能性を示唆しています。\n\n"
        f"3. **連続性**: 異常点の中に **3 時間以上連続した乖離区間** が確認されました"
        f"（{timestamps[0]} 付近）。連続的な乖離は、一時的なセンサーノイズではなく"
        f"実際の設備異常である確度が高いことを意味します。\n\n"
        f"### 総合評価\n\n"
        f"予実乖離の規模・頻度・連続性の3軸から総合すると、"
        f"**設備に中程度の異常が進行している可能性が高い** と判断されます。"
        f"早期の点検を推奨します。"
    )


async def _mock_agent_2_past_cases(
    analysis_summary: str,
    req: AnalysisRequest,
) -> str:
    """Agent 2: 過去の類似事例検索（モック）."""
    await asyncio.sleep(2.0)

    if len(req.anomaly_points) == 0:
        return (
            "## 過去事例検索結果\n\n"
            "現在の分析では有意な異常が検出されていないため、"
            "過去の類似事例検索は省略されました。"
        )

    return (
        "## 過去事例検索結果\n\n"
        "過去の保守報告書データベースから、今回の乖離パターンに類似した"
        "事例を3件抽出しました。\n\n"
        "---\n\n"
        "### 事例 1: ポンプ軸受摩耗による効率低下（2024年8月）\n\n"
        "- **報告書番号**: MR-2024-0847\n"
        "- **類似度**: 87%\n"
        "- **症状**: 電力消費が予測値を上回る傾向が2週間かけて徐々に拡大。"
        "最終的に予測比 +15% に到達。\n"
        "- **原因**: ポンプ主軸の軸受（ベアリング）が摩耗し、回転抵抗が増大。\n"
        "- **対応**: 軸受交換。停止時間は4時間。交換後、乖離は即座に解消。\n\n"
        "---\n\n"
        "### 事例 2: インペラへの異物付着（2024年3月）\n\n"
        "- **報告書番号**: MR-2024-0312\n"
        "- **類似度**: 72%\n"
        "- **症状**: 電力消費の乖離が断続的に発生。特に高負荷運転時に顕著。\n"
        "- **原因**: インペラ表面にスケール（水垢）が堆積し、"
        "流体抵抗が増大。\n"
        "- **対応**: 分解清掃。停止時間は6時間。清掃後、性能は完全に回復。\n\n"
        "---\n\n"
        "### 事例 3: 冷却系統の部分閉塞（2023年11月）\n\n"
        "- **報告書番号**: MR-2023-1105\n"
        "- **類似度**: 65%\n"
        "- **症状**: 電力消費の乖離が急激に発生し、一定値で継続。"
        "流体温度の上昇も同時に観測。\n"
        "- **原因**: 冷却配管の一部にデブリが詰まり、流路が狭窄。\n"
        "- **対応**: 配管フラッシングと部分交換。"
        "停止時間は8時間。処置後は正常化。\n"
    )


async def _mock_agent_3_maintenance_actions(
    analysis_summary: str,
    past_cases: str,
    req: AnalysisRequest,
) -> str:
    """Agent 3: 保守アクション提案（モック）."""
    await asyncio.sleep(1.5)

    if len(req.anomaly_points) == 0:
        return (
            "## 推奨アクション\n\n"
            "現時点で緊急の対応は不要です。\n\n"
            "定期点検スケジュールに従い、次回点検時に"
            "センサーの校正確認を行うことを推奨します。"
        )

    return (
        "## 推奨保守アクション\n\n"
        "予実乖離分析と過去事例の照合結果に基づき、"
        "以下のアクションを優先度順に提案します。\n\n"
        "### 🔴 優先度: 高（48時間以内に実施推奨）\n\n"
        "1. **ポンプ軸受の振動測定・状態診断**\n"
        "   - 過去事例 MR-2024-0847 と乖離パターンが87%一致しています。\n"
        "   - ポータブル振動計による簡易診断を推奨（所要: 約30分）。\n"
        "   - 振動値が基準値の1.5倍を超える場合、軸受交換を計画してください。\n\n"
        "2. **インペラの目視点検**\n"
        "   - 過去事例 MR-2024-0312 と類似の断続的パターンが見られます。\n"
        "   - 直近のメンテナンス窓でインペラのスケール付着状況を確認してください。\n\n"
        "### 🟡 優先度: 中（1週間以内に実施推奨）\n\n"
        "3. **冷却系統の流量チェック**\n"
        "   - 流体温度データに微増傾向が見られる場合、"
        "冷却配管の部分閉塞の可能性も排除できません。\n"
        "   - フローメーターによる流量測定と圧力損失の確認を推奨します。\n\n"
        "4. **AIモデルの再学習検討**\n"
        "   - 設備の経年変化により、予測モデルのベースラインが"
        "実態と乖離している可能性もあります。\n"
        "   - 上記の物理的点検で問題がない場合は、"
        "直近3ヶ月のデータでモデルを再学習することを推奨します。\n\n"
        "### 🟢 優先度: 低（次回定期点検時に実施）\n\n"
        "5. **センサー校正の確認**\n"
        "   - 電力消費センサーのドリフトの可能性を排除するため、"
        "校正日時を確認し、必要に応じて再校正してください。\n\n"
        "---\n\n"
        "**見積もり停止時間**: 軸受交換が必要な場合 → 約4時間  \n"
        "**見積もり費用**: 軸受部品代 + 作業工賃 → 概算15〜25万円  \n"
        "**リスク**: 対応が遅れた場合、ポンプの突発停止による"
        "生産ライン停止リスクがあります。"
    )


# ---------------------------------------------------------------------------
# SSE streaming endpoint
# ---------------------------------------------------------------------------


async def _run_analysis_pipeline(
    req: AnalysisRequest,
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
    agent1_result = await _mock_agent_1_divergence_analysis(req)
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
    agent2_result = await _mock_agent_2_past_cases(agent1_result, req)
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
    agent3_result = await _mock_agent_3_maintenance_actions(
        agent1_result, agent2_result, req
    )
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
) -> StreamingResponse:
    """Run the 3-agent power-consumption analysis pipeline.

    Returns an SSE stream with ``agent_step`` events for each agent
    and an ``analysis_complete`` event when the pipeline finishes.
    """
    return StreamingResponse(
        _run_analysis_pipeline(req),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
