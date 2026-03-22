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

"""DuckDB helper for persisting per-report timeseries chart data.

Each analysis report stores its raw timeseries rows in a dedicated DuckDB
table named ``ts_<uuid_hex>``.  The DuckDB file is automatically synced to
DataRobot persistent storage via ``DRFileSystem`` when running inside a
Custom Application container.
"""

from __future__ import annotations

import logging
import re
import uuid as uuidpkg
from pathlib import Path
from typing import Any

from core.persistent_fs.duckdb_extension import connect_dr_fs

logger = logging.getLogger(__name__)

DUCKDB_PATH = ".data/analysis_timeseries.duckdb"


def _table_name(report_uuid: uuidpkg.UUID) -> str:
    return f"ts_{report_uuid.hex}"


def _ensure_dir() -> None:
    Path(DUCKDB_PATH).parent.mkdir(parents=True, exist_ok=True)


def _validate_table_name(name: str) -> str:
    """Validate that a table name matches the expected pattern."""
    if not re.match(r"^ts_[0-9a-f]{32}$", name):
        raise ValueError(f"Invalid table name: {name}")
    return name


def save_timeseries(
    report_uuid: uuidpkg.UUID,
    rows: list[dict[str, Any]],
) -> str:
    """Persist timeseries rows to a DuckDB table.

    Args:
        report_uuid: The UUID of the analysis report.
        rows: List of dicts with keys: timestamp, temperature,
              fluid_temperature, pressure, power, power_prediction,
              flow, is_anomaly.

    Returns:
        The DuckDB table name (``ts_<hex>``).
    """
    _ensure_dir()
    table = _validate_table_name(_table_name(report_uuid))
    con = connect_dr_fs(DUCKDB_PATH)
    try:
        con.execute(
            f"""
            CREATE TABLE IF NOT EXISTS "{table}" (
                "timestamp"          VARCHAR,
                temperature          DOUBLE,
                fluid_temperature    DOUBLE,
                pressure             DOUBLE,
                power                DOUBLE,
                power_prediction     DOUBLE,
                flow                 DOUBLE,
                is_anomaly           BOOLEAN
            )
            """
        )
        if rows:
            con.executemany(
                f"""
                INSERT INTO "{table}"
                    ("timestamp", temperature, fluid_temperature, pressure,
                     power, power_prediction, flow, is_anomaly)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        r.get("timestamp", ""),
                        r.get("temperature"),
                        r.get("fluid_temperature"),
                        r.get("pressure"),
                        r.get("power"),
                        r.get("power_prediction"),
                        r.get("flow"),
                        r.get("is_anomaly", False),
                    )
                    for r in rows
                ],
            )
    finally:
        con.close()
    logger.info("Saved %d timeseries rows to %s", len(rows), table)
    return table


def load_timeseries(report_uuid: uuidpkg.UUID) -> list[dict[str, Any]]:
    """Load all timeseries rows for a report from DuckDB.

    Returns:
        A list of dicts matching the DuckDB column names.
    """
    _ensure_dir()
    table = _validate_table_name(_table_name(report_uuid))
    con = connect_dr_fs(DUCKDB_PATH, read_only=True)
    try:
        result = con.execute(
            f'SELECT * FROM "{table}" ORDER BY "timestamp"'
        ).fetchall()
        columns = [
            "timestamp",
            "temperature",
            "fluid_temperature",
            "pressure",
            "power",
            "power_prediction",
            "flow",
            "is_anomaly",
        ]
        return [dict(zip(columns, row)) for row in result]
    except Exception:
        logger.exception("Failed to load timeseries for %s", report_uuid)
        return []
    finally:
        con.close()


def delete_timeseries(report_uuid: uuidpkg.UUID) -> None:
    """Drop the DuckDB table for a given report."""
    _ensure_dir()
    table = _validate_table_name(_table_name(report_uuid))
    con = connect_dr_fs(DUCKDB_PATH)
    try:
        con.execute(f'DROP TABLE IF EXISTS "{table}"')
    finally:
        con.close()
    logger.info("Deleted timeseries table %s", table)
