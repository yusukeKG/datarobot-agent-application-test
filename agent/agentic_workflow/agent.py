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

from crewai import LLM, Agent, Task
from datarobot_genai.crewai.agent import (
    build_llm,
)
from datarobot_genai.crewai.base import CrewAIAgent
from datarobot_genai.crewai.events import CrewAIEventListener

from config import Config


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


# ---------------------------------------------------------------------------
# Dummy maintenance reports for Agent 2 (past case search)
# ---------------------------------------------------------------------------

# TODO: 実際の保守報告書データベースから検索する。
# 現在はダミーデータを使用しています。将来的には報告書 DB への検索ツールを
# PastCaseSearchAgent の mcp_tools に追加して、動的に取得する想定です。
_DUMMY_MAINTENANCE_REPORTS: list[dict[str, Any]] = [
    {
        "report_id": "MR-2024-0847",
        "date": "2024-08-15",
        "equipment": "第2系統ポンプ P-201",
        "symptoms": "電力消費が予測値を上回る傾向が2週間かけて徐々に拡大。最終的に予測比+15%に到達。振動値にも微増傾向あり。",
        "root_cause": "ポンプ主軸の軸受（ベアリング）が摩耗し、回転抵抗が増大。",
        "resolution": "軸受交換を実施。交換後、乖離は即座に解消。",
        "downtime_hours": 4,
        "keywords": ["軸受摩耗", "電力増加", "漸増パターン", "振動増加"],
    },
    {
        "report_id": "MR-2024-0312",
        "date": "2024-03-20",
        "equipment": "第1系統ポンプ P-102",
        "symptoms": "電力消費の乖離が断続的に発生。特に高負荷運転時に顕著。低負荷時は正常範囲内。",
        "root_cause": "インペラ表面にスケール（水垢）が堆積し、流体抵抗が増大。",
        "resolution": "分解清掃を実施。清掃後、性能は完全に回復。",
        "downtime_hours": 6,
        "keywords": ["スケール付着", "断続的乖離", "高負荷時異常", "インペラ"],
    },
    {
        "report_id": "MR-2023-1105",
        "date": "2023-11-08",
        "equipment": "冷却系統ポンプ P-301",
        "symptoms": "電力消費の乖離が急激に発生し、一定値で継続。流体温度の上昇も同時に観測。",
        "root_cause": "冷却配管の一部にデブリが詰まり、流路が狭窄。",
        "resolution": "配管フラッシングと部分交換を実施。処置後は正常化。",
        "downtime_hours": 8,
        "keywords": ["配管閉塞", "急激な乖離", "温度上昇", "冷却系統"],
    },
    {
        "report_id": "MR-2024-0623",
        "date": "2024-06-23",
        "equipment": "第2系統ポンプ P-202",
        "symptoms": "電力消費が予測値を下回る傾向が1週間継続。流量低下も同時に確認。",
        "root_cause": "メカニカルシールの劣化により内部リークが発生し、ポンプ効率が低下。",
        "resolution": "メカニカルシール交換。交換後、流量・電力ともに正常値に回復。",
        "downtime_hours": 5,
        "keywords": ["シール劣化", "電力低下", "流量低下", "内部リーク"],
    },
    {
        "report_id": "MR-2025-0210",
        "date": "2025-02-10",
        "equipment": "第1系統ポンプ P-101",
        "symptoms": "電力消費の乖離がランダムに発生。再現性が低く、特定の運転条件との相関なし。",
        "root_cause": "電力計測センサーのドリフト。校正ズレにより実際の消費電力と計測値に誤差。",
        "resolution": "電力センサーの再校正を実施。校正後、乖離は解消。",
        "downtime_hours": 1,
        "keywords": ["センサードリフト", "ランダム乖離", "計測誤差", "校正"],
    },
]


class PastCaseSearchAgent(CrewAIAgent):
    """過去事例検索エージェント。

    Agent 1（予実乖離分析）の結果と保守報告書データベースを照合し、
    類似した過去事例を特定して類似度・根拠とともに報告する。
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
        """Returns the LLM to use for a given model."""
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
        """Map the user prompt into Crew kickoff inputs.

        Expects a JSON payload with keys: agent_type, analysis_summary,
        anomaly_points. Formats dummy maintenance reports and the
        analysis summary into template variables for the task.
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

        analysis_summary = ""
        if data is not None:
            analysis_summary = data.get("analysis_summary", "")

        if not analysis_summary:
            analysis_summary = str(user_prompt_content)

        # TODO: 実際の報告書 DB を検索して関連報告書を取得する。
        # 現在はダミーデータを全件使用。
        reports_text_parts: list[str] = []
        for i, report in enumerate(_DUMMY_MAINTENANCE_REPORTS, 1):
            reports_text_parts.append(
                f"### 報告書 {i}: {report['report_id']}（{report['date']}）\n"
                f"- **設備**: {report['equipment']}\n"
                f"- **症状**: {report['symptoms']}\n"
                f"- **原因**: {report['root_cause']}\n"
                f"- **対応**: {report['resolution']}\n"
                f"- **停止時間**: {report['downtime_hours']} 時間\n"
                f"- **キーワード**: {', '.join(report['keywords'])}"
            )

        return {
            "analysis_summary": analysis_summary,
            "past_reports": "\n\n".join(reports_text_parts),
        }

    @property
    def agents(self) -> List[Agent]:
        return [self.agent_past_case_analyst]

    @property
    def tasks(self) -> List[Task]:
        return [self.task_search_past_cases]

    @property
    def agent_past_case_analyst(self) -> Agent:
        """保守報告書検索アナリスト。"""
        return Agent(
            role="保守報告書検索アナリスト",
            goal=(
                "現在発生している予実乖離パターンと類似した過去の保守事例を"
                "報告書データベースから特定し、類似度とその根拠を明確に報告する。"
            ),
            backstory=(
                "あなたはポンプ・回転機器の保守履歴に精通した過去事例分析の専門家です。"
                "様々な故障モード・劣化パターン・環境要因による異常を経験しており、"
                "現在の症状と過去事例の類似性を多角的に評価できます。"
                "症状のパターン（漸増・急変・断続的など）、影響を受ける計測値、"
                "設備カテゴリの関連性を総合的に判断し、保全担当者が優先的に"
                "確認すべき過去事例を根拠とともに提示します。"
            ),
            allow_delegation=False,
            verbose=self.verbose,
            llm=self.llm(preferred_model="datarobot/azure/gpt-5-mini-2025-08-07"),
            tools=self.mcp_tools,
        )

    @property
    def task_search_past_cases(self) -> Task:
        """過去の類似事例検索タスク。"""
        return Task(
            description=(
                "以下の予実乖離分析結果に基づいて、過去の保守報告書から"
                "類似した事例を検索・評価してください。\n\n"
                "## 現在の異常分析結果（Agent 1 出力）\n\n"
                "{analysis_summary}\n\n"
                "## 検索対象の保守報告書データベース\n\n"
                "{past_reports}\n\n"
                "## 分析の観点\n"
                "以下の観点で各報告書との類似度を評価してください:\n\n"
                "1. **症状パターンの類似性**: 乖離の発生パターン"
                "（漸増・急変・断続的・ランダム）が一致するか\n"
                "2. **乖離の規模・方向**: 乖離の大きさや方向"
                "（予測超過 vs 予測未達）が類似しているか\n"
                "3. **時間的特徴**: 乖離の持続時間や発生タイミングの"
                "パターンが類似しているか\n"
                "4. **設備カテゴリの関連性**: 対象設備の種類や"
                "運転条件の共通点があるか\n\n"
                "## 重要な注意事項\n"
                "- 各報告書について類似度（%）を算出し、その根拠を具体的に説明してください\n"
                "- 類似度の高い順にソートして報告してください\n"
                "- 提供された報告書データのみに基づいて評価してください。"
                "データにない事実を推測で補わないでください\n"
                "- 類似度が低い（30%未満）事例も省略せず、"
                "なぜ類似度が低いかを簡潔に説明してください\n"
            ),
            expected_output=(
                "Markdown形式の過去事例検索レポート。以下の構成を含むこと:\n"
                "- `## 過去事例検索結果` の見出し\n"
                "- 検索条件の概要（現在の異常パターンの要約）\n"
                "- 各事例について:\n"
                "  - 報告書番号、日付、設備名\n"
                "  - `**類似度**: XX%` と根拠の説明\n"
                "  - 症状・原因・対応の概要\n"
                "  - 現在の状況との共通点と相違点\n"
                "- `### まとめ` に最も参照すべき事例の推奨\n"
            ),
            agent=self.agent_past_case_analyst,
        )


class MaintenanceActionAgent(CrewAIAgent):
    """保守アクション提案エージェント。

    Agent 1（予実乖離分析）の結果と Agent 2（過去事例検索）の結果を
    総合的に評価し、優先度付きの保守アクションを提案する。
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
        """Returns the LLM to use for a given model."""
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
        """Map the user prompt into Crew kickoff inputs.

        Expects a JSON payload with keys: agent_type, analysis_summary,
        past_cases. Passes both to the task template variables.
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

        analysis_summary = ""
        past_cases = ""
        if data is not None:
            analysis_summary = data.get("analysis_summary", "")
            past_cases = data.get("past_cases", "")

        if not analysis_summary:
            analysis_summary = str(user_prompt_content)

        if not past_cases:
            # TODO: 過去の対策事例データベースが整備された後は、
            # Agent 2 の出力が常に渡される想定のためこのフォールバックは不要になる。
            past_cases = (
                "過去事例データは現在利用できません。"
                "分析結果のみに基づいてアクションを提案してください。"
            )

        return {
            "analysis_summary": analysis_summary,
            "past_cases": past_cases,
        }

    @property
    def agents(self) -> List[Agent]:
        return [self.agent_maintenance_advisor]

    @property
    def tasks(self) -> List[Task]:
        return [self.task_propose_maintenance_actions]

    @property
    def agent_maintenance_advisor(self) -> Agent:
        """保守アクション提案アドバイザー。"""
        return Agent(
            role="保守アクション提案アドバイザー",
            goal=(
                "予実乖離分析の結果と過去の類似保守事例を総合的に評価し、"
                "保全担当者が即座に行動に移せる具体的かつ優先度付きの"
                "保守アクションを提案する。"
            ),
            backstory=(
                "あなたはポンプ・回転機器の保全計画に精通した保守アドバイザーです。"
                "予知保全・状態基準保全（CBM）の専門知識を持ち、分析データと"
                "過去の保守履歴を組み合わせて最適なアクションプランを策定できます。"
                "各アクションの優先度、必要なリソース、想定される停止時間、"
                "対応が遅れた場合のリスクを定量的に評価し、"
                "保全担当者が意思決定しやすい形式で報告します。"
            ),
            allow_delegation=False,
            verbose=self.verbose,
            llm=self.llm(preferred_model="datarobot/azure/gpt-5-mini-2025-08-07"),
            tools=self.mcp_tools,
        )

    @property
    def task_propose_maintenance_actions(self) -> Task:
        """保守アクション提案タスク。"""
        return Task(
            description=(
                "以下の予実乖離分析結果と過去事例検索結果に基づいて、"
                "具体的な保守アクションを優先度付きで提案してください。\n\n"
                "## 予実乖離分析結果（Agent 1 出力）\n\n"
                "{analysis_summary}\n\n"
                "## 過去事例検索結果（Agent 2 出力）\n\n"
                "{past_cases}\n\n"
                "## 提案の観点\n"
                "以下の観点でアクションを提案してください:\n\n"
                "1. **緊急度の判定**: 分析結果の深刻度と過去事例の結末から、"
                "対応の緊急度を判定\n"
                "2. **具体的アクション**: 各アクションについて、何を・いつまでに・"
                "どのように実施すべきかを具体的に記述\n"
                "3. **根拠の明示**: なぜそのアクションが必要かを、"
                "分析結果や過去事例の番号を引用して説明\n"
                "4. **リソース見積もり**: 各アクションの想定所要時間・"
                "必要人員・概算費用を可能な範囲で提示\n"
                "5. **リスク評価**: 対応が遅れた場合に想定されるリスク"
                "（設備停止、生産影響等）を評価\n\n"
                "## 重要な注意事項\n"
                "- 提供されたデータのみに基づいて提案してください。"
                "データにない事実を推測で補わないでください\n"
                "- アクションは優先度（高・中・低）に分類してください\n"
                "- 過去事例との関連がある場合は報告書番号を明記してください\n"
                "- 物理的な点検と AI モデルの再学習の両面から検討してください\n"
            ),
            expected_output=(
                "Markdown形式の推奨保守アクションレポート。以下の構成を含むこと:\n"
                "- `## 推奨保守アクション` の見出し\n"
                "- 提案の前提条件の概要（分析結果と過去事例の要約）\n"
                "- `### 🔴 優先度: 高（48時間以内に実施推奨）` に緊急アクション\n"
                "- `### 🟡 優先度: 中（1週間以内に実施推奨）` に中期アクション\n"
                "- `### 🟢 優先度: 低（次回定期点検時に実施）` に長期アクション\n"
                "- 各アクションに番号付きリストで: アクション内容、根拠、"
                "所要時間の見積もり\n"
                "- 最後に **見積もり停止時間**、**見積もり費用**、**リスク** の"
                "サマリーを記載\n"
            ),
            agent=self.agent_maintenance_advisor,
        )
