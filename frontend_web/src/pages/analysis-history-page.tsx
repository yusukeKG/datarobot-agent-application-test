import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Download,
  FileBarChart,
  Loader2,
  AlertCircle,
  Trash2,
} from 'lucide-react';
import { downloadAnalysisReport } from '@/api/analysis';
import {
  useAnalysisReports,
  useDeleteAnalysisReport,
} from '@/api/analysis-hooks';

export function AnalysisHistoryPage() {
  const navigate = useNavigate();
  const { data: reports, isLoading, error } = useAnalysisReports();
  const deleteMutation = useDeleteAnalysisReport();
  const [confirmUuid, setConfirmUuid] = useState<string | null>(null);
  const [downloadingUuid, setDownloadingUuid] = useState<string | null>(null);

  const handleDownload = async (
    e: React.MouseEvent,
    uuid: string,
  ) => {
    e.stopPropagation();
    setDownloadingUuid(uuid);
    try {
      await downloadAnalysisReport(uuid);
    } finally {
      setDownloadingUuid(null);
    }
  };

  const handleDelete = async () => {
    if (!confirmUuid) return;
    await deleteMutation.mutateAsync(confirmUuid);
    setConfirmUuid(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">AI分析履歴</h2>
        <p className="mt-1 text-sm text-gray-600">
          過去のAI分析結果を一覧で確認できます
        </p>
      </div>

      {/* Delete confirmation dialog */}
      {confirmUuid && (
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
                onClick={() => setConfirmUuid(null)}
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

      {isLoading && (
        <div className="flex items-center justify-center rounded-lg border border-gray-200 bg-white p-12">
          <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
          <span className="ml-2 text-gray-600">読み込み中…</span>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="mr-1 inline h-4 w-4" />
          データの取得に失敗しました
        </div>
      )}

      {reports && reports.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-gray-200 bg-white p-12 text-center">
          <FileBarChart className="h-12 w-12 text-gray-300" />
          <p className="mt-4 text-gray-500">分析履歴がありません</p>
          <p className="mt-1 text-sm text-gray-400">
            「センサー監視」画面で「この期間をAIで分析」をクリックすると、結果がここに保存されます
          </p>
        </div>
      )}

      {reports && reports.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  分析日時
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  対象期間
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  データ件数
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  異常ポイント
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {reports.map((report) => {
                const raw = String(report.created_at);
                const createdAt = new Date(
                  /[Z+\-]/.test(raw.slice(-6)) ? raw : raw + 'Z',
                );
                return (
                  <tr
                    key={report.uuid}
                    className="cursor-pointer transition-colors hover:bg-blue-50"
                    onClick={() =>
                      navigate(`/analysis-history/${report.uuid}`)
                    }
                  >
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                      {createdAt.toLocaleDateString('ja-JP', {
                        timeZone: 'Asia/Tokyo',
                      })}{' '}
                      {createdAt.toLocaleTimeString('ja-JP', {
                        hour: '2-digit',
                        minute: '2-digit',
                        timeZone: 'Asia/Tokyo',
                      })}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">
                      {report.start_date} ～ {report.end_date}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">
                      {report.total_data_points} 件
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm">
                      {report.anomaly_count > 0 ? (
                        <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
                          {report.anomaly_count} 件
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                          なし
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right text-sm">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
                          onClick={(e) => handleDownload(e, report.uuid)}
                          disabled={downloadingUuid === report.uuid}
                          title="報告書をダウンロード"
                        >
                          {downloadingUuid === report.uuid ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Download className="h-3.5 w-3.5" />
                          )}
                          DL
                        </button>
                        <button
                          className="inline-flex items-center gap-1 rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmUuid(report.uuid);
                          }}
                          title="削除"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          削除
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
