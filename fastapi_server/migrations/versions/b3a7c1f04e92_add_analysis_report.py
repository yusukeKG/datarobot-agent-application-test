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

"""add_analysis_report

Revision ID: b3a7c1f04e92
Revises: 4d5262be920d
Create Date: 2026-03-22 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
import sqlmodel
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b3a7c1f04e92"
down_revision: Union[str, Sequence[str], None] = "4d5262be920d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create analysis_report table."""
    op.create_table(
        "analysis_report",
        sa.Column("uuid", sa.Uuid(), nullable=False),
        sa.Column("user_uuid", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("start_date", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("end_date", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("total_data_points", sa.Integer(), nullable=False),
        sa.Column("anomaly_count", sa.Integer(), nullable=False),
        sa.Column(
            "divergence_report",
            sqlmodel.sql.sqltypes.AutoString(),
            nullable=False,
        ),
        sa.Column(
            "past_cases_report",
            sqlmodel.sql.sqltypes.AutoString(),
            nullable=False,
        ),
        sa.Column(
            "maintenance_actions_report",
            sqlmodel.sql.sqltypes.AutoString(),
            nullable=False,
        ),
        sa.Column(
            "duckdb_table_name",
            sqlmodel.sql.sqltypes.AutoString(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_uuid"], ["user.uuid"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("uuid"),
        sa.UniqueConstraint("uuid"),
    )
    op.create_index(
        op.f("ix_analysis_report_user_uuid"),
        "analysis_report",
        ["user_uuid"],
        unique=False,
    )
    op.create_index(
        op.f("ix_analysis_report_created_at"),
        "analysis_report",
        ["created_at"],
        unique=False,
    )


def downgrade() -> None:
    """Drop analysis_report table."""
    op.drop_index(
        op.f("ix_analysis_report_created_at"), table_name="analysis_report"
    )
    op.drop_index(
        op.f("ix_analysis_report_user_uuid"), table_name="analysis_report"
    )
    op.drop_table("analysis_report")
