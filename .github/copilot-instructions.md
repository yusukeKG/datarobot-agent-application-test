# GitHub Copilot Instructions for DataRobot Agent Application

## プロジェクト概要

このリポジトリは、DataRobotプラットフォーム上でエージェントワークフローを構築・デプロイするためのアプリケーションテンプレートです。マルチエージェントフレームワーク、FastAPIバックエンド、Reactフロントエンド、MCPサーバーで構成されています。

## リポジトリ構造

```
├── agent/              # エージェント実装（CrewAI/LangGraph等）
│   └── agentic_workflow/  # エージェントワークフロー定義
├── core/               # 共有コアライブラリ（テレメトリ、ロギング等）
├── fastapi_server/     # FastAPIバックエンドサーバー
│   └── app/            # アプリケーションコード
├── frontend_web/       # React/Viteフロントエンド
│   └── src/            # ソースコード
├── mcp_server/         # Model Context Protocol (MCP) サーバー
│   └── app/            # ツール、プロンプト、リソース定義
├── infra/              # Pulumiインフラストラクチャコード
└── docs/               # ドキュメント
```

## 技術スタック

### バックエンド（Python）
- **Python**: 3.10-3.12（推奨: 3.11）
- **FastAPI**: 非同期Webフレームワーク
- **SQLModel/SQLAlchemy 2.0+**: 非同期ORM（asyncpg/aiosqlite）
- **Alembic**: データベースマイグレーション
- **Pydantic 2.x**: データバリデーション・設定管理
- **uv**: パッケージマネージャー

### フロントエンド（TypeScript）
- **React 19**: UIフレームワーク
- **TypeScript 5.7**: 型安全なJavaScript
- **Vite 7**: ビルドツール
- **TailwindCSS 4**: ユーティリティファーストCSS
- **TanStack Query**: データフェッチング
- **Zustand**: 状態管理
- **Radix UI**: アクセシブルUIコンポーネント

### エージェント
- **CrewAI**: マルチエージェントフレームワーク（デフォルト）
- **LangGraph**: 代替フレームワーク
- **LiteLLM**: LLMプロバイダー抽象化
- **datarobot-genai**: DataRobot GenAI統合

### MCP Server
- **datarobot-genai[drmcp]**: DataRobot MCP統合
- **Streamable HTTP**: トランスポート

### インフラ・ツール
- **Pulumi**: Infrastructure as Code
- **Taskfile**: タスクランナー
- **DataRobot CLI (dr)**: デプロイ・管理ツール

## コーディング規約

### Python

#### ライセンスヘッダー（必須）
すべてのPythonファイルの先頭に以下を含めること：

```python
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
```

#### フォーマット・リンター
- **フォーマッター**: Ruff（Black互換）
- **リンター**: Ruff、mypy（strict mode）
- **行長**: 88文字
- **インデント**: スペース4つ
- **クォート**: ダブルクォート
- **ターゲットバージョン**: Python 3.11

#### Ruff設定
```toml
[tool.ruff.lint]
select = ["E4", "E7", "E9", "F", "I"]  # Pyflakes + pycodestyle + isort

[tool.ruff.format]
quote-style = "double"
indent-style = "space"
```

#### 型ヒント
- **必須**: すべての関数・メソッドに型ヒントを付ける
- **mypy strict mode**: 有効
- **プラグイン**: pydantic.mypy, sqlalchemy.ext.mypy.plugin

```python
from typing import Any, Optional, Sequence

async def my_function(
    param: str,
    optional: int | None = None,
) -> dict[str, Any]:
    """関数の説明。

    Args:
        param: パラメータの説明
        optional: オプションパラメータの説明

    Returns:
        戻り値の説明
    """
    pass
```

#### インポート順序
1. 標準ライブラリ
2. サードパーティ
3. ローカル（相対インポート）

```python
import logging
import os
from typing import Any

from fastapi import FastAPI
from pydantic import Field

from app.config import Config
```

### TypeScript/React

#### フォーマット・リンター
- **ESLint**: typescript-eslint recommended
- **Prettier**: コードフォーマット
- **設定ファイル**: `eslint.config.js`, `.prettierrc.json`

#### パスエイリアス
`@/` は `src/` ディレクトリを指す

```typescript
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
```

#### コンポーネント
- ファイル名: `kebab-case.tsx`（例: `chat-message.tsx`）
- コンポーネント名: PascalCase
- 関数コンポーネントを使用

```typescript
interface ComponentProps {
  title: string;
  onClick?: () => void;
}

export function MyComponent({ title, onClick }: ComponentProps) {
  return <button onClick={onClick}>{title}</button>;
}
```

### YAML
- **フォーマッター**: yamlfix
- **行長**: 120文字
- **重複キー**: 許可

## 設定パターン

### Pydantic Settings（Python）
環境変数とPulumi出力を自動的に読み込む

```python
from datarobot.core.config import DataRobotAppFrameworkBaseSettings
from pydantic import Field

class Config(DataRobotAppFrameworkBaseSettings):
    """設定クラス - 環境変数、.env、Pulumi出力から自動ロード"""
    
    my_setting: str = Field(
        default="default_value",
        validation_alias="MY_SETTING"
    )
    optional_setting: str | None = None
```

### MCPツール定義
```python
from datarobot_genai.drmcp import dr_mcp_tool

@dr_mcp_tool(tags={"custom", "example"})
async def my_tool(argument: str) -> str:
    """ツールの説明（LLMが使用するため詳細に記述）。

    Args:
        argument: 引数の説明

    Returns:
        戻り値の説明
    """
    return f"Result: {argument}"
```

### CrewAIエージェント
```python
from crewai import Agent, Task
from datarobot_genai.crewai.base import CrewAIAgent

class MyAgent(CrewAIAgent):
    """カスタムエージェント実装"""
    
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.config = Config()
```

## テスト

### Python
- **フレームワーク**: pytest + pytest-asyncio
- **カバレッジ**: pytest-cov
- **テストファイル**: `test_*.py`
- **非同期モード**: auto

```python
import pytest

@pytest.mark.asyncio
async def test_my_function():
    result = await my_function("test")
    assert result == expected
```

### フロントエンド
- **ユニットテスト**: Vitest
- **E2Eテスト**: Playwright

```bash
# ユニットテスト
npm run test

# E2Eテスト
npx playwright test
```

## 開発コマンド

```bash
# 環境セットアップ
task start

# 依存関係インストール
task install

# ローカル開発
dr task run dev

# リント
task lint

# デプロイ
dr task run deploy
```

## 重要な注意事項

1. **ライセンス**: すべてのソースファイルにApache 2.0ライセンスヘッダーを含める
2. **非同期**: FastAPIとMCPツールは`async/await`を使用
3. **型安全**: Python・TypeScript両方で厳格な型チェックを維持
4. **インポート**: ファイル先頭で行う（関数内インポート禁止）
5. **docstring**: Google styleで記述
6. **エラーハンドリング**: 明確なエラーメッセージを返す
7. **環境変数**: `.env`ファイルで管理、機密情報はコミットしない

## DataRobot固有のパターン

### SDK使用
```python
import datarobot as dr

# クライアント初期化
client = dr.Client()
```

### LLM Gateway
```python
from datarobot_genai.crewai.agent import build_llm

llm = build_llm(
    model="datarobot/azure/gpt-5-mini-2025-08-07",
    api_key=api_key,
    api_base=api_base,
)
```

### 設定の優先順位
1. 環境変数（Runtime Parameters含む）
2. `.env`ファイル
3. ファイルシークレット
4. Pulumi出力変数
5. デフォルト値
