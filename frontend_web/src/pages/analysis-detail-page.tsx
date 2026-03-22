import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  Loader2,
  Trash2,
} from 'lucide-react';
import { useCallback, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { downloadAnalysisReport } from '@/api/analysis';
import {
  useAnalysisReport,
  useAnalysisTimeseries,
  useDeleteAnalysisReport,
} from '@/api/analysis-hooks';
import { PowerChart, type ChartDataPoint } from '@/components/power-chart';
import { SyncedMetricChart } from '@/components/synced-metric-chart';

export function AnalysisDetailPage() {
  const { uuid } = useParams<{ uuid: string }>();
  const navigate = useNavigate();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [pinnedTimestamp, setPinnedTimestamp] = useState<string | null>(null);
  const handlePinnedChange = useCallback((ts: string | null) => setPinnedTimestamp(ts), []);

  const { data: report, isLoading: reportLoading } = useAnalysisReport(uuid);
  const { data: timeseries, isLoading: tsLoading } =
    useAnalysisTimeseries(uuid);
  const deleteMutation = useDeleteAnalysisReport();

  const handleDelete = async () => {
    if (!uuid) return;
    await deleteMutation.mutateAsync(uuid);
    navigate('/analysis-history');
  };

  const handleDownload = async () => {
    if (!uuid) return;
    setIsDownloading(true);
    try {
      await downloadAnalysisReport(uuid);
    } finally {
      setIsDownloading(false);
    }
  };

  // Convert timeseries data for the chart
  const chartData: ChartDataPoint[] = (timeseries ?? []).map((r) => ({
    timestamp: r.timestamp,
    temperature: r.temperature,
    fluidTemperature: r.fluid_temperature,
    pressure: r.pressure,
    power: r.power,
    powerPrediction: r.power_prediction,
    flow: r.flow,
  }));

  if (reportLoading || tsLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
        <span className="ml-2 text-gray-600">読み込み中…</span>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="p-8 text-center text-gray-500">
        レポートが見つかりません
      </div>
    );
  }

  const rawCreatedAt = String(report.created_at);
  const createdAt = new Date(
    /[Z+\-]/.test(rawCreatedAt.slice(-6)) ? rawCreatedAt : rawCreatedAt + 'Z',
  );

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <button
          className="flex items-center gap-1.5 text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
          onClick={() => navigate('/analysis-history')}
        >
          <ArrowLeft className="h-4 w-4" />
          戻る
        </button>
        <div className="flex items-center gap-3">
          <button
            className="flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
            onClick={handleDownload}
            disabled={isDownloading}
          >
            {isDownloading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            報告書としてダウンロード
          </button>
          <button
            className="flex items-center gap-1.5 rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
            onClick={() => setShowDeleteConfirm(true)}
          >
            <Trash2 className="h-4 w-4" />
            削除
          </button>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">
              分析結果の削除
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              この分析結果を削除しますか？この操作は取り消せません。
            </p>
            <div className="mt-4 flex justify-end gap-3">
              <button
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                onClick={() => setShowDeleteConfirm(false)}
              >
                キャンセル
              </button>
              <button
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? '削除中…' : '削除する'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header info */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold text-gray-900">AI分析レポート</h2>
        <div className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-sm text-gray-600">
          <span>
            分析日時:{' '}
            <strong className="text-gray-900">
              {createdAt.toLocaleDateString('ja-JP', {
                timeZone: 'Asia/Tokyo',
              })}{' '}
              {createdAt.toLocaleTimeString('ja-JP', {
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'Asia/Tokyo',
              })}
            </strong>
          </span>
          <span>
            対象期間:{' '}
            <strong className="text-gray-900">
              {report.start_date} ～ {report.end_date}
            </strong>
          </span>
          <span>
            データ件数:{' '}
            <strong className="text-gray-900">
              {report.total_data_points} 件
            </strong>
          </span>
          <span>
            異常ポイント:{' '}
            <strong
              className={
                report.anomaly_count > 0 ? 'text-red-600' : 'text-green-600'
              }
            >
              {report.anomaly_count} 件
            </strong>
          </span>
        </div>
      </div>

      {/* Power chart */}
      {chartData.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold text-gray-900">
            電力消費量 (kWh)
          </h3>
          <PowerChart data={chartData} onPinnedChange={handlePinnedChange} />
        </div>
      )}

      {/* Additional charts */}
      {chartData.length > 0 && (
        <>
          {/* Pump flow */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">
              ポンプ流量 (L/h)
            </h3>
            <SyncedMetricChart
              data={chartData}
              dataKey="flow"
              name="ポンプ流量"
              stroke="#8b5cf6"
              pinnedTimestamp={pinnedTimestamp}
            />
          </div>

          {/* 外気温度 */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">
              外気温度 (°C)
            </h3>
            <SyncedMetricChart
              data={chartData}
              dataKey="temperature"
              name="外気温度"
              stroke="#3b82f6"
              pinnedTimestamp={pinnedTimestamp}
            />
          </div>

          {/* 流体温度 */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">
              流体温度 (°C)
            </h3>
            <SyncedMetricChart
              data={chartData}
              dataKey="fluidTemperature"
              name="流体温度"
              stroke="#10b981"
              pinnedTimestamp={pinnedTimestamp}
            />
          </div>

          {/* ポンプ出口圧力 */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">
              ポンプ出口圧力 (MPa)
            </h3>
            <SyncedMetricChart
              data={chartData}
              dataKey="pressure"
              name="ポンプ出口圧力"
              stroke="#f59e0b"
              pinnedTimestamp={pinnedTimestamp}
            />
          </div>
        </>
      )}

      {/* Agent reports */}
      <div className="space-y-4">
        {[
          {
            id: 1,
            title: '予実乖離の時系列分析',
            content: report.divergence_report,
          },
          {
            id: 2,
            title: '過去事例の検索',
            content: report.past_cases_report,
          },
          {
            id: 3,
            title: '保守アクションの提案',
            content: report.maintenance_actions_report,
          },
        ].map((agent) => (
          <div
            key={agent.id}
            className="rounded-lg border border-green-200 bg-white p-4"
          >
            <div className="mb-2 flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-green-500" />
              <span className="text-sm font-semibold text-gray-900">
                エージェント {agent.id}: {agent.title}
              </span>
            </div>
            {agent.content && (
              <div className="mt-3 border-t border-gray-100 pt-3 prose prose-sm max-w-none text-gray-700">
                <ReactMarkdown>{agent.content}</ReactMarkdown>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
