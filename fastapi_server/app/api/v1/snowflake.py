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

from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.snowflake import SnowflakeClient, get_snowflake_client

router = APIRouter(prefix="/snowflake", tags=["snowflake"])


class QueryRequest(BaseModel):
    """Request model for SQL query execution."""

    query: str = Field(..., description="SQL query to execute")
    params: dict[str, Any] | None = Field(
        None, description="Optional query parameters"
    )


class QueryResponse(BaseModel):
    """Response model for SQL query results."""

    data: list[dict[str, Any]] = Field(..., description="Query result rows")
    row_count: int = Field(..., description="Number of rows returned")


class SnowflakeStatusResponse(BaseModel):
    """Response model for Snowflake connection status."""

    configured: bool = Field(
        ..., description="Whether Snowflake is configured"
    )
    database: str | None = Field(None, description="Connected database")
    snowflake_schema: str | None = Field(None, description="Connected schema", alias="schema")
    warehouse: str | None = Field(None, description="Connected warehouse")

    class Config:
        populate_by_name = True


@router.get("/status", response_model=SnowflakeStatusResponse)
async def get_snowflake_status(request: Request) -> SnowflakeStatusResponse:
    """Check Snowflake connection status and configuration.

    Returns:
        SnowflakeStatusResponse: Connection status and configuration details
    """
    config = request.app.state.deps.config
    configured = all(
        [
            config.snowflake_account,
            config.snowflake_user,
            config.snowflake_password,
        ]
    )

    return SnowflakeStatusResponse(
        configured=configured,
        database=config.snowflake_database,
        snowflake_schema=config.snowflake_schema,
        warehouse=config.snowflake_warehouse,
    )


@router.post("/query", response_model=QueryResponse)
async def execute_query(
    request: Request, query_request: QueryRequest
) -> QueryResponse:
    """Execute a SQL query on Snowflake.

    Args:
        request: FastAPI request object
        query_request: Query request containing SQL and optional parameters

    Returns:
        QueryResponse: Query results and row count

    Raises:
        HTTPException: If Snowflake is not configured or query fails
    """
    try:
        snowflake_client = get_snowflake_client(request.app.state.deps.config)
        results = snowflake_client.execute_query(
            query_request.query, query_request.params
        )

        return QueryResponse(data=results, row_count=len(results))

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Query execution failed: {str(e)}"
        )


@router.get("/tables", response_model=list[dict[str, Any]])
async def list_tables(request: Request) -> list[dict[str, Any]]:
    """List all tables in the configured Snowflake database/schema.

    Args:
        request: FastAPI request object

    Returns:
        List of table information dictionaries

    Raises:
        HTTPException: If Snowflake is not configured or query fails
    """
    try:
        snowflake_client = get_snowflake_client(request.app.state.deps.config)

        query = "SHOW TABLES"
        results = snowflake_client.execute_query(query)

        return results

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to list tables: {str(e)}"
        )


@router.get("/pump-data", response_model=list[dict[str, Any]])
async def get_pump_data(
    request: Request,
    start_date: str | None = None,
    end_date: str | None = None,
) -> list[dict[str, Any]]:
    """Get PUMP_SYSTEM_DATA with optional date filtering.

    Args:
        request: FastAPI request object
        start_date: Start date in ISO format (YYYY-MM-DD)
        end_date: End date in ISO format (YYYY-MM-DD)

    Returns:
        List of pump system data records

    Raises:
        HTTPException: If Snowflake is not configured or query fails
    """
    try:
        snowflake_client = get_snowflake_client(request.app.state.deps.config)

        # Build query with optional date filtering
        query = "SELECT * FROM PUMP_SYSTEM_DATA"
        conditions = []

        if start_date:
            conditions.append(f"TIMESTAMP >= '{start_date}'")
        if end_date:
            conditions.append(f"TIMESTAMP <= '{end_date} 23:59:59'")

        if conditions:
            query += " WHERE " + " AND ".join(conditions)

        query += " ORDER BY TIMESTAMP ASC"

        results = snowflake_client.execute_query(query)

        return results

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to fetch pump data: {str(e)}"
        )
