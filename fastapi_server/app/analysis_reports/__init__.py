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
import uuid as uuidpkg
from datetime import datetime, timezone
from typing import Sequence

from sqlalchemy import Column, DateTime, ForeignKey
from sqlmodel import Field, SQLModel, select

from app.db import DBCtx

logger = logging.getLogger(__name__)


class AnalysisReportBase(SQLModel):
    """Base fields shared by the table and API schemas."""

    start_date: str = Field(default="")
    end_date: str = Field(default="")
    total_data_points: int = Field(default=0)
    anomaly_count: int = Field(default=0)
    divergence_report: str = Field(default="")
    past_cases_report: str = Field(default="")
    maintenance_actions_report: str = Field(default="")
    duckdb_table_name: str = Field(default="")


class AnalysisReport(AnalysisReportBase, table=True):
    __tablename__ = "analysis_report"

    uuid: uuidpkg.UUID = Field(
        default_factory=uuidpkg.uuid4, primary_key=True, unique=True
    )
    user_uuid: uuidpkg.UUID | None = Field(
        default=None,
        sa_column=Column(
            "user_uuid", ForeignKey("user.uuid", ondelete="CASCADE"), index=True
        ),
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(DateTime(timezone=True), nullable=False, index=True),
    )


class AnalysisReportCreate(AnalysisReportBase):
    """Schema for creating a new analysis report."""

    uuid: uuidpkg.UUID | None = None
    user_uuid: uuidpkg.UUID | None = None


class AnalysisReportPublic(AnalysisReportBase):
    """Schema returned to the client."""

    uuid: uuidpkg.UUID
    user_uuid: uuidpkg.UUID | None = None
    created_at: datetime


class AnalysisReportSummary(SQLModel):
    """Lightweight schema for the history list."""

    uuid: uuidpkg.UUID
    created_at: datetime
    start_date: str
    end_date: str
    total_data_points: int
    anomaly_count: int


class AnalysisReportRepository:
    """CRUD operations for analysis reports."""

    def __init__(self, db: DBCtx):
        self._db = db

    async def create(self, data: AnalysisReportCreate) -> AnalysisReport:
        dump = data.model_dump(exclude_none=True)
        report = AnalysisReport(**dump)
        async with self._db.session(writable=True) as session:
            session.add(report)
            await session.commit()
            await session.refresh(report)
            return report

    async def get_by_uuid(self, uuid: uuidpkg.UUID) -> AnalysisReport | None:
        async with self._db.session() as session:
            result = await session.exec(
                select(AnalysisReport)
                .where(AnalysisReport.uuid == uuid)
                .limit(1)
            )
            return result.one_or_none()

    async def list_by_user(
        self, user_uuid: uuidpkg.UUID
    ) -> Sequence[AnalysisReport]:
        async with self._db.session() as session:
            result = await session.exec(
                select(AnalysisReport)
                .where(AnalysisReport.user_uuid == user_uuid)
                .order_by(AnalysisReport.created_at.desc())  # type: ignore[union-attr]
            )
            return result.all()

    async def delete(self, uuid: uuidpkg.UUID) -> AnalysisReport | None:
        async with self._db.session(writable=True) as session:
            result = await session.exec(
                select(AnalysisReport)
                .where(AnalysisReport.uuid == uuid)
                .limit(1)
            )
            report = result.one_or_none()
            if not report:
                return None
            await session.delete(report)
            await session.commit()
            return report
