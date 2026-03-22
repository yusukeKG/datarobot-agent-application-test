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
import os
from unittest.mock import ANY, MagicMock, Mock, patch

import pytest
from agent import MyAgent
from ragas import MultiTurnSample
from ragas.messages import AIMessage, HumanMessage, ToolCall, ToolMessage


class TestMyAgentCrewAI:
    @pytest.fixture
    def agent(self):
        return MyAgent(api_key="test_key", api_base="test_base", verbose=True)

    def test_init_with_explicit_parameters(self):
        """Test initialization with explicitly provided parameters."""
        # Setup
        api_key = "test-api-key"
        api_base = "https://test-api-base.com"
        model = "test-model"
        verbose = True

        # Execute
        agent = MyAgent(
            api_key=api_key, api_base=api_base, model=model, verbose=verbose
        )

        # Assert
        assert agent.api_key == api_key
        assert agent.api_base == api_base
        assert agent.model == model
        assert agent.verbose is True

    @patch.dict(
        os.environ,
        {
            "DATAROBOT_API_TOKEN": "env-api-key",
            "DATAROBOT_ENDPOINT": "https://env-api-base.com",
        },
    )
    def test_init_with_environment_variables(self):
        """Test initialization using environment variables when no explicit parameters."""
        # Execute
        agent = MyAgent()

        # Assert
        assert agent.api_key == "env-api-key"
        assert agent.api_base == "https://env-api-base.com"
        assert agent.model is None
        assert agent.verbose is True

    @patch.dict(
        os.environ,
        {
            "DATAROBOT_API_TOKEN": "env-api-key",
            "DATAROBOT_ENDPOINT": "https://env-api-base.com",
        },
    )
    def test_init_explicit_params_override_env_vars(self):
        """Test explicit parameters override environment variables."""
        # Setup
        api_key = "explicit-api-key"
        api_base = "https://explicit-api-base.com"

        # Execute
        agent = MyAgent(api_key=api_key, api_base=api_base)

        # Assert
        assert agent.api_key == "explicit-api-key"
        assert agent.api_base == "https://explicit-api-base.com"

    def test_init_with_string_verbose_true(self):
        """Test initialization with string 'true' for verbose parameter."""
        # Setup
        verbose_values = ["true", "TRUE", "True"]

        for verbose in verbose_values:
            # Execute
            agent = MyAgent(verbose=verbose)

            # Assert
            assert agent.verbose is True

    def test_init_with_string_verbose_false(self):
        """Test initialization with string 'false' for verbose parameter."""
        # Setup
        verbose_values = ["false", "FALSE", "False"]

        for verbose in verbose_values:
            # Execute
            agent = MyAgent(verbose=verbose)

            # Assert
            assert agent.verbose is False

    def test_init_with_boolean_verbose(self):
        """Test initialization with boolean values for verbose parameter."""
        # Test with True
        agent = MyAgent(verbose=True)
        assert agent.verbose is True

        # Test with False
        agent = MyAgent(verbose=False)
        assert agent.verbose is False

    @patch.dict(os.environ, {}, clear=True)
    def test_init_with_additional_kwargs(self):
        """Test initialization with additional keyword arguments."""
        # Setup
        additional_kwargs = {"extra_param1": "value1", "extra_param2": 42}

        # Execute
        agent = MyAgent(**additional_kwargs)

        # Assert - Additional kwargs should be accepted but not stored as attributes
        assert agent.api_key is None  # Should fallback to env var or None
        assert agent.api_base == "https://app.datarobot.com"  # Default value
        assert agent.model is None
        assert agent.verbose is True

        # Verify that the extra parameters don't create attributes
        with pytest.raises(AttributeError):
            _ = agent.extra_param1

    @pytest.mark.parametrize(
        "api_base,expected_result",
        [
            ("https://example.com", "https://example.com/"),
            ("https://example.com/", "https://example.com/"),
            ("https://example.com/api/v2", "https://example.com/"),
            ("https://example.com/api/v2/", "https://example.com/"),
            ("https://example.com/other-path", "https://example.com/other-path/"),
            (
                "https://custom.example.com:8080/path/to/api/v2/",
                "https://custom.example.com:8080/path/to/",
            ),
            (
                "https://example.com/api/v2/deployment/",
                "https://example.com/api/v2/deployment/",
            ),
            (
                "https://example.com/api/v2/deployment",
                "https://example.com/api/v2/deployment/",
            ),
            (
                "https://example.com/api/v2/genai/llmgw/chat/completions",
                "https://example.com/api/v2/genai/llmgw/chat/completions",
            ),
            (
                "https://example.com/api/v2/genai/llmgw/chat/completions/",
                "https://example.com/api/v2/genai/llmgw/chat/completions",
            ),
            (None, "https://app.datarobot.com/"),
        ],
    )
    @patch("datarobot_genai.crewai.agent.LLM")
    def test_llm_gateway_with_api_base(self, mock_llm, api_base, expected_result):
        """Test api_base_litellm property with various URL formats."""
        with patch.dict(os.environ, {}, clear=True):
            agent = MyAgent(api_base=api_base)
            _ = agent.llm(preferred_model="datarobot/azure/gpt-5-mini-2025-08-07")
            mock_llm.assert_called_once_with(
                model="datarobot/azure/gpt-5-mini-2025-08-07",
                api_base=expected_result,
                api_key=None,
                timeout=90,
            )

    @pytest.mark.parametrize(
        "api_base,expected_result",
        [
            (
                "https://example.com",
                "https://example.com/api/v2/deployments/test-id/chat/completions",
            ),
            (
                "https://example.com/",
                "https://example.com/api/v2/deployments/test-id/chat/completions",
            ),
            (
                "https://example.com/api/v2/",
                "https://example.com/api/v2/deployments/test-id/chat/completions",
            ),
            (
                "https://example.com/api/v2",
                "https://example.com/api/v2/deployments/test-id/chat/completions",
            ),
            (
                "https://example.com/other-path",
                "https://example.com/other-path/api/v2/deployments/test-id/chat/completions",
            ),
            (
                "https://custom.example.com:8080/path/to",
                "https://custom.example.com:8080/path/to/api/v2/deployments/test-id/chat/completions",
            ),
            (
                "https://custom.example.com:8080/path/to/api/v2/",
                "https://custom.example.com:8080/path/to/api/v2/deployments/test-id/chat/completions",
            ),
            (
                "https://example.com/api/v2/deployments/",
                "https://example.com/api/v2/deployments/",
            ),
            (
                "https://example.com/api/v2/deployments",
                "https://example.com/api/v2/deployments/",
            ),
            (
                "https://example.com/api/v2/genai/llmgw/chat/completions",
                "https://example.com/api/v2/genai/llmgw/chat/completions",
            ),
            (
                "https://example.com/api/v2/genai/llmgw/chat/completions/",
                "https://example.com/api/v2/genai/llmgw/chat/completions",
            ),
            (
                None,
                "https://app.datarobot.com/api/v2/deployments/test-id/chat/completions",
            ),
        ],
    )
    @patch("datarobot_genai.crewai.agent.LLM")
    def test_llm_deployment_with_api_base(self, mock_llm, api_base, expected_result):
        """Test api_base_litellm property with various URL formats."""
        with patch.dict(os.environ, {"LLM_DEPLOYMENT_ID": "test-id"}, clear=True):
            agent = MyAgent(api_base=api_base)
            agent.config.llm_default_model = "datarobot/azure/gpt-5-mini-2025-08-07"
            _ = agent.llm(preferred_model="datarobot/azure/gpt-5-mini-2025-08-07")
            mock_llm.assert_called_once_with(
                model="datarobot/azure/gpt-5-mini-2025-08-07",
                api_base=expected_result,
                api_key=None,
                timeout=90,
            )

    @patch("datarobot_genai.crewai.agent.LLM")
    def test_llm(self, mock_llm, agent):
        # Test that LLM is created with correct parameters
        agent.llm()
        mock_llm.assert_called_once_with(
            model="datarobot/azure/gpt-5-mini-2025-08-07",
            api_base="test_base/",
            api_key="test_key",
            timeout=90,
        )

    @patch("datarobot_genai.crewai.agent.LLM")
    def test_llm_property_with_no_api_base(self, mock_llm, agent):
        # Test that LLM is created with correct parameters
        with patch.dict(os.environ, {}, clear=True):
            agent = MyAgent(api_key="test_key", verbose=True)
            agent.llm()
            mock_llm.assert_called_once_with(
                model="datarobot/azure/gpt-5-mini-2025-08-07",
                api_base="https://app.datarobot.com/",
                api_key="test_key",
                timeout=90,
            )

    @patch("agent.Agent")
    def test_agent_divergence_analyst_property(self, mock_agent, agent):
        # Mock the llm property
        mock_llm = Mock()
        with patch.object(MyAgent, "llm", return_value=mock_llm):
            agent.agent_divergence_analyst
            mock_agent.assert_called_once_with(
                role="ポンプシステム予実乖離アナリスト",
                goal=ANY,
                backstory=ANY,
                allow_delegation=False,
                verbose=True,
                llm=ANY,
                tools=ANY,
            )

    @patch("agent.Task")
    def test_task_analyze_divergence_property(self, mock_task, agent):
        mock_analyst = Mock()
        with patch.object(
            MyAgent, "agent_divergence_analyst", return_value=mock_analyst
        ):
            agent.task_analyze_divergence
            mock_task.assert_called_once_with(
                description=ANY,
                expected_output=ANY,
                agent=ANY,
            )

    def test_make_kickoff_inputs_json(self, agent):
        """Test that JSON user prompt is parsed into kickoff inputs."""
        payload = json.dumps({
            "start_date": "2026-03-01",
            "end_date": "2026-03-07",
            "total_data_points": 168,
            "anomaly_points": [
                {
                    "timestamp": "03/05 14:00",
                    "power": 550.0,
                    "power_prediction": 400.0,
                    "diff": 150.0,
                    "diff_pct": 37.5,
                },
            ],
        })
        result = agent.make_kickoff_inputs(payload)
        assert "analysis_data" in result
        assert "2026-03-01" in result["analysis_data"]
        assert "2026-03-07" in result["analysis_data"]
        assert "550.0" in result["analysis_data"]
        assert "400.0" in result["analysis_data"]

    def test_make_kickoff_inputs_dict(self, agent):
        """Test that a dict (pre-parsed by DRUM) is handled correctly."""
        payload = {
            "start_date": "2026-03-01",
            "end_date": "2026-03-07",
            "total_data_points": 168,
            "anomaly_points": [
                {
                    "timestamp": "03/05 14:00",
                    "power": 550.0,
                    "power_prediction": 400.0,
                    "diff": 150.0,
                    "diff_pct": 37.5,
                },
            ],
        }
        result = agent.make_kickoff_inputs(payload)
        assert "analysis_data" in result
        assert "2026-03-01" in result["analysis_data"]
        assert "550.0" in result["analysis_data"]

    def test_make_kickoff_inputs_plain_text(self, agent):
        """Test fallback when user prompt is not JSON."""
        result = agent.make_kickoff_inputs("hello world")
        assert result == {"analysis_data": "hello world"}

    @patch("datarobot_genai.crewai.base.Crew")
    @patch("agent.CrewAIEventListener")
    @patch("agent.Agent")
    def test_chat(
        self, mock_agent, mock_event_listener, mock_crew, agent, load_model_result
    ):
        # This test case covers testing that the agent invoke runs with the llm interactions mocked
        from custom import chat

        _ = mock_agent, agent  # Uncalled but left for global test setup

        crew_output = Mock(
            raw="agent result",
            token_usage=Mock(
                completion_tokens=1,
                prompt_tokens=2,
                total_tokens=3,
            ),
        )
        mock_crew.return_value = Mock(kickoff=MagicMock(return_value=crew_output))

        events = [
            HumanMessage(content="Hi"),
            AIMessage(
                content="Which language should I use?",
                tool_calls=[
                    ToolCall(name="find_language", args={"input_language": "en"})
                ],
            ),
            ToolMessage(content="Use en"),
            AIMessage(content="How are you today?"),
        ]
        mock_event_listener.return_value = Mock(messages=events)
        # Ensure the actual agent instance uses our mocked event listener
        agent.event_listener = mock_event_listener.return_value

        # Setup mocks
        completion_create_params = {
            "model": "test-model",
            "messages": [{"role": "user", "content": '{"topic": "test"}'}],
            "environment_var": True,
        }

        with (
            patch.object(MyAgent, "task_analyze_divergence"),
            patch(
                "datarobot_genai.crewai.agent.create_pipeline_interactions_from_messages",
                return_value=MultiTurnSample(user_input=events),
            ),
        ):
            response = chat(
                completion_create_params, load_model_result=load_model_result
            )

        # Assert results - check the pipeline_interactions - other sections of the
        # results are already being checked in test_custom_model.py::test_chat
        completion = json.loads(response.model_dump_json())
        actual_events = json.loads(completion["pipeline_interactions"])["user_input"]
        for expected_message, actual_message in zip(events, actual_events):
            assert expected_message.content == actual_message["content"]
            assert expected_message.type == actual_message["type"]


class TestMyAgentMCPIntegration:
    """Test MCP tool integration for CrewAI agents."""

    @pytest.fixture
    def agent(self):
        return MyAgent(api_key="test_key", api_base="test_base", verbose=True)

    def test_agent_divergence_analyst_with_mcp_tools(self, agent):
        """Test that divergence analyst agent uses MCP tools when configured."""
        from crewai.tools import BaseTool

        class MockTool(BaseTool):
            name: str = "test_mcp_tool"
            description: str = "Test MCP tool"

            def _run(self, **kwargs):
                return "mcp_result"

        mock_tools = [MockTool()]
        agent.set_mcp_tools(mock_tools)

        analyst = agent.agent_divergence_analyst
        assert analyst.tools == mock_tools

    def test_agent_with_no_mcp_tools(self, agent):
        """Test that agents work when no MCP tools are available."""
        analyst = agent.agent_divergence_analyst
        assert analyst.tools == []

    def test_agent_with_specific_mcp_tools(self, agent):
        """Test that agents can use specific MCP tools."""
        from crewai.tools import BaseTool

        class Tool1(BaseTool):
            name: str = "tool1"
            description: str = "Tool 1"

            def _run(self, **kwargs):
                return "result1"

        class Tool2(BaseTool):
            name: str = "tool2"
            description: str = "Tool 2"

            def _run(self, **kwargs):
                return "result2"

        mock_tools = [Tool1(), Tool2()]
        agent.set_mcp_tools(mock_tools)

        analyst = agent.agent_divergence_analyst
        assert len(analyst.tools) == 2
        assert analyst.tools == mock_tools
