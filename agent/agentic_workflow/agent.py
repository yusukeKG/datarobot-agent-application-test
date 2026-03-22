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
import json
from typing import Any, List, Optional, Union

from config import Config
from crewai import LLM, Agent, Task
from datarobot_genai.crewai.agent import (
    build_llm,
)
from datarobot_genai.crewai.base import CrewAIAgent
from datarobot_genai.crewai.events import CrewAIEventListener


class MyAgent(CrewAIAgent):
    """予実乖離分析エージェント。

    ポンプシステムの電力消費量について、DataRobot による予測値と実績値の
    乖離パターンを時系列で分析し、Markdown 形式のレポートを生成する。
    DataRobot LLM Gateway を通じて LLM を呼び出す。
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        api_base: Optional[str] = None,
        model: Optional[str] = None,
        verbose: Optional[Union[bool, str]] = True,
        timeout: Optional[int] = 90,
        **kwargs: Any,
    ):
        """Initializes the MyAgent class with API key, base URL, model, and verbosity settings.

        Args:
            api_key: API key for authentication with DataRobot services.
            api_base: Base URL for the DataRobot API.
            model: The LLM model to use.
            verbose: Whether to enable verbose logging.
            timeout: How long to wait for the agent to respond (seconds).
            **kwargs: Additional keyword arguments (CompletionCreateParams).
        """
        super().__init__(
            api_key=api_key,
            api_base=api_base,
            model=model,
            verbose=verbose,
            timeout=timeout,
            **kwargs,
        )
        self.config = Config()
        self.default_model = self.config.llm_default_model
        self.event_listener = CrewAIEventListener()

    def llm(
        self,
        preferred_model: str | None = None,
        auto_model_override: bool = True,
    ) -> LLM:
        """Returns the LLM to use for a given model.

        Args:
            preferred_model: The model to use. If none, defaults to config.llm_default_model.
            auto_model_override: If True, falls back to default model when LLM Gateway
                is not configured.

        Returns:
            LLM: The model to use.
        """
        model = preferred_model or self.default_model
        if auto_model_override and not self.config.use_datarobot_llm_gateway:
            model = self.default_model
        if self.verbose:
            print(f"Using model: {model}")
        return build_llm(
            api_base=self.api_base,
            api_key=self.api_key,
            model=model,
            deployment_id=self.config.llm_deployment_id,
            timeout=self.timeout,
        )

    def make_kickoff_inputs(self, user_prompt_content: str) -> dict[str, Any]:
        """Map the user prompt into Crew kickoff inputs expected by tasks/agents.

        The user message may be a JSON string or an already-parsed dict
        (DRUM framework may pre-parse it). Contains keys:
        start_date, end_date, anomaly_points, total_data_points.
        """
        data: dict[str, Any] | None = None

        if isinstance(user_prompt_content, dict):
            data = user_prompt_content
        elif isinstance(user_prompt_content, str):
            try:
                parsed = json.loads(user_prompt_content)
                if isinstance(parsed, dict):
                    data = parsed
            except (json.JSONDecodeError, TypeError, ValueError):
                pass

        if data is None:
            return {"analysis_data": str(user_prompt_content)}

        start_date = data.get("start_date", "不明")
        end_date = data.get("end_date", "不明")
        total_data_points = data.get("total_data_points", 0)
        anomaly_points = data.get("anomaly_points", [])
        n_anomalies = len(anomaly_points)

        lines: list[str] = [
            f"対象期間: {start_date} ～ {end_date}",
            f"全データポイント数: {total_data_points} 件",
            f"閾値超過の異常ポイント数: {n_anomalies} 件",
            "",
            "異常データポイント一覧:",
        ]
        if anomaly_points:
            for pt in anomaly_points:
                lines.append(
                    f"- {pt['timestamp']}: "
                    f"実績={pt['power']:.1f} kWh, "
                    f"予測={pt['power_prediction']:.1f} kWh, "
                    f"差分={pt['diff']:+.1f} kWh ({pt['diff_pct']:+.1f}%)"
                )
        else:
            lines.append("なし")

        return {"analysis_data": "\n".join(lines)}

    @property
    def agents(self) -> List[Agent]:
        return [self.agent_divergence_analyst]

    @property
    def tasks(self) -> List[Task]:
        return [self.task_analyze_divergence]

    @property
    def agent_divergence_analyst(self) -> Agent:
        """ポンプシステム予実乖離アナリスト。"""
        return Agent(
            role="ポンプシステム予実乖離アナリスト",
            goal=(
                "ポンプシステムの電力消費量について、DataRoB予測値と実績値の"
                "乖離パターンを分析し、設備状態を評価するレポートを作成する。"
            ),
            backstory=(
                "あなたはポンプ・回転機器の保全に精通した予実乖離分析の専門家です。"
                "電力消費量のトレンド分析、異常検知パターンの解釈、設備劣化の"
                "早期発見に長けています。DataRobot の機械学習モデルが生成した"
                "予測値と実測値を比較し、乖離の原因・深刻度・傾向を客観的に"
                "評価できます。分析結果は保全担当者が行動に移せるよう、"
                "具体的かつ簡潔に報告します。"
            ),
            allow_delegation=False,
            verbose=self.verbose,
            llm=self.llm(preferred_model="datarobot/azure/gpt-5-mini-2025-08-07"),
            tools=self.mcp_tools,
        )

    @property
    def task_analyze_divergence(self) -> Task:
        """予実乖離の時系列分析タスク。"""
        return Task(
            description=(
                "以下のポンプシステム電力消費データについて、予測値と実績値の乖離を分析してください。\n\n"
                "{analysis_data}\n\n"
                "## 分析の観点\n"
                "以下の観点で分析を行い、レポートを作成してください:\n\n"
                "1. **最大乖離の特定**: 最も大きな乖離が発生した時刻と、その乖離幅（kWh および %）を特定\n"
                "2. **時間軸トレンド**: 乖離が拡大傾向・縮小傾向・横ばいのいずれかを判断。"
                "期間の前半と後半での変化に注目\n"
                "3. **連続性の評価**: 異常ポイントが散発的か、連続して発生しているかを評価。"
                "連続している場合はその区間を特定\n"
                "4. **異常発生率**: 全データポイントに対する異常ポイントの割合を算出\n"
                "5. **総合評価**: 上記の分析結果を総合し、設備の状態（正常/注意/警告/危険）を判定\n\n"
                "## 重要な注意事項\n"
                "- 提供されたデータのみに基づいて分析してください。データにない事実を推測で補わないでください\n"
                "- 異常ポイントが 0 件の場合は「有意な乖離は検出されなかった」と報告してください\n"
                "- 数値は提供されたデータから正確に引用してください\n"
            ),
            expected_output=(
                "Markdown形式の予実乖離分析レポート。以下の構成を含むこと:\n"
                "- `## 予実乖離分析レポート` の見出し\n"
                "- 対象期間・データ件数・異常検知数などの基本情報\n"
                "- `### 主要な発見事項` に番号付きリストで分析結果\n"
                "- `### 総合評価` に設備状態の判定と推奨アクションの概要\n"
            ),
            agent=self.agent_divergence_analyst,
        )
