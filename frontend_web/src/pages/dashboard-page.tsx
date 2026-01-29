import { AlertTriangle } from 'lucide-react';

export function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">システム概要</h2>
        <p className="mt-1 text-sm text-gray-600">
          全センサーのリアルタイム監視状況
        </p>
      </div>

      {/* センサーカードグリッドエリア */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 10 }, (_, i) => (
          <div
            key={i}
            className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">
                センサー {i + 1}
              </h3>
              <div
                className={`h-3 w-3 rounded-full ${
                  i === 0 ? 'bg-red-500' : 'bg-green-500'
                }`}
              />
            </div>
            <div className="mt-4 flex h-48 items-center justify-center rounded-lg bg-gray-100">
              <span className="text-sm text-gray-500">グラフエリア</span>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <span className="text-sm text-gray-600">差分</span>
              <span
                className={`font-semibold ${
                  i === 0 ? 'text-red-600' : 'text-gray-900'
                }`}
              >
                {i === 0 ? '+7.2%' : '+0.5%'}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* アラート・推奨アクションエリア */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-6">
        <div className="flex items-start gap-4">
          <div className="rounded-full bg-amber-500 p-2">
            <AlertTriangle className="h-6 w-6 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-amber-900">性能逸脱検出</h3>
            <p className="mt-1 text-sm text-amber-700">
              センサー1: 閾値5%超過（現在+7.2%）
            </p>
            <div className="mt-4 space-y-2">
              <div className="rounded-lg bg-white p-4">
                <h4 className="text-sm font-semibold text-gray-900">
                  📋 関連保全記録（直近30日）
                </h4>
                <ul className="mt-2 space-y-1 text-sm text-gray-700">
                  <li>• 2025-01-20: フィルター清掃実施（定期保全）</li>
                  <li>• 2025-01-15: 温度センサー校正</li>
                </ul>
              </div>
              <div className="rounded-lg bg-white p-4">
                <h4 className="text-sm font-semibold text-gray-900">
                  💡 AI推奨対策
                </h4>
                <div className="mt-2 space-y-2">
                  <div className="rounded border border-red-200 bg-red-50 p-3">
                    <p className="text-sm font-semibold text-red-900">
                      1. 緊急フィルター交換
                    </p>
                    <p className="mt-1 text-xs text-red-700">
                      前回清掃から8日経過。差圧上昇パターンからフィルター目詰まりの可能性が高い。
                    </p>
                  </div>
                  <div className="rounded border border-amber-200 bg-amber-50 p-3">
                    <p className="text-sm font-semibold text-amber-900">
                      2. ベアリング振動測定
                    </p>
                    <p className="mt-1 text-xs text-amber-700">
                      振動センサー値が微増傾向。念のため点検推奨。
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
