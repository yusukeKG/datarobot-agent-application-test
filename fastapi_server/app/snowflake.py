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

import logging
from typing import Any

import snowflake.connector
from snowflake.connector import DictCursor, SnowflakeConnection

from app.config import Config

logger = logging.getLogger(__name__)


class SnowflakeClient:
    """Snowflake connection manager."""

    def __init__(self, config: Config) -> None:
        """Initialize Snowflake client with configuration.

        Args:
            config: Application configuration containing Snowflake credentials
        """
        self.config = config
        self._connection: SnowflakeConnection | None = None

    def _get_connection(self) -> SnowflakeConnection:
        """Get or create a Snowflake connection.

        Returns:
            Active Snowflake connection

        Raises:
            ValueError: If Snowflake credentials are not configured
        """
        if not all(
            [
                self.config.snowflake_account,
                self.config.snowflake_user,
                self.config.snowflake_password,
            ]
        ):
            raise ValueError(
                "Snowflake credentials not configured. "
                "Please set SNOWFLAKE_ACCOUNT, SNOWFLAKE_USER, and SNOWFLAKE_PASSWORD in .env"
            )

        if self._connection is None or self._connection.is_closed():
            logger.info("Establishing Snowflake connection")
            self._connection = snowflake.connector.connect(
                account=self.config.snowflake_account,
                user=self.config.snowflake_user,
                password=self.config.snowflake_password,
                warehouse=self.config.snowflake_warehouse,
                database=self.config.snowflake_database,
                schema=self.config.snowflake_schema,
            )
            logger.info("Snowflake connection established successfully")

        return self._connection

    def execute_query(
        self, query: str, params: dict[str, Any] | None = None
    ) -> list[dict[str, Any]]:
        """Execute a SQL query and return results as a list of dictionaries.

        Args:
            query: SQL query to execute
            params: Optional query parameters for parameterized queries

        Returns:
            List of dictionaries representing query results

        Raises:
            ValueError: If Snowflake is not configured
            Exception: If query execution fails
        """
        conn = self._get_connection()
        cursor = conn.cursor(DictCursor)

        try:
            logger.info(f"Executing query: {query[:100]}...")
            if params:
                cursor.execute(query, params)
            else:
                cursor.execute(query)

            results = cursor.fetchall()
            logger.info(f"Query returned {len(results)} rows")
            return results  # type: ignore[return-value]

        except Exception as e:
            logger.error(f"Query execution failed: {e}")
            raise
        finally:
            cursor.close()

    def close(self) -> None:
        """Close the Snowflake connection."""
        if self._connection and not self._connection.is_closed():
            logger.info("Closing Snowflake connection")
            self._connection.close()
            self._connection = None


def get_snowflake_client(config: Config) -> SnowflakeClient:
    """Factory function to create a Snowflake client.

    Args:
        config: Application configuration

    Returns:
        Configured SnowflakeClient instance
    """
    return SnowflakeClient(config)
