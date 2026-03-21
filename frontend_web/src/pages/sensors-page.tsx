import { useQuery } from '@tanstack/react-query';
import { format, subDays } from 'date-fns';
import { Calendar } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { snowflakeApi } from '@/api/snowflake';

type PinnedPoint = {
  label: string;
  payload: Array<{ name: string; value: number | null | undefined; color: string; dataKey: string }>;
  coordinate: { x: number; y: number };
};

// 固定吹き出しコンポーネント（はみ出し補正付き）
function PinnedTooltipOverlay({
  pinnedPoint,
  containerRef,
  pinnedTooltipRef,
  children,
}: {
  pinnedPoint: PinnedPoint;
  containerRef: React.RefObject<HTMLDivElement | null>;
  pinnedTooltipRef: React.RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
}) {
  const [adjustedLeft, setAdjustedLeft] = useState<number | null>(null);

  useEffect(() => {
    const tooltip = pinnedTooltipRef.current;
    const container = containerRef.current;
    if (!tooltip || !container) return;

    const containerWidth = container.offsetWidth;
    const tooltipWidth = tooltip.offsetWidth;
    const centerX = pinnedPoint.coordinate.x;

    let left = centerX - tooltipWidth / 2;
    // 左端クランプ
    if (left < 4) left = 4;
    // 右端クランプ
    if (left + tooltipWidth > containerWidth - 4) {
      left = containerWidth - tooltipWidth - 4;
    }
    setAdjustedLeft(left);
  }, [pinnedPoint, containerRef, pinnedTooltipRef]);

  return (
    <div
      ref={pinnedTooltipRef}
      className="absolute z-10 rounded-lg border border-gray-300 bg-white p-3 shadow-xl text-sm pointer-events-auto"
      style={{
        left: adjustedLeft ?? pinnedPoint.coordinate.x,
        top: pinnedPoint.coordinate.y - 15,
        transform: adjustedLeft != null ? 'translateY(-100%)' : 'translate(-50%, -100%)',
        minWidth: '220px',
        maxWidth: '320px',
      }}
    >
      {children}
    </div>
  );
}

export function SensorsPage() {
  const [startDate, setStartDate] = useState<string>(
    format(subDays(new Date(), 7), 'yyyy-MM-dd')
  );
  const [endDate, setEndDate] = useState<string>(
    format(new Date(), 'yyyy-MM-dd')
  );
  const [pinnedPoint, setPinnedPoint] = useState<PinnedPoint | null>(null);
  // Tooltip content 内でホバー中のデータを保存する ref
  const hoveredRef = useRef<PinnedPoint | null>(null);
  // pinnedPoint の最新値を useCallback 内から参照するための ref
  const pinnedPointRef = useRef<PinnedPoint | null>(null);
  pinnedPointRef.current = pinnedPoint;
  // チャートコンテナ DOM ref
  const chartContainerRef = useRef<HTMLDivElement>(null);
  // 固定吹き出しの DOM ref（はみ出し補正用）
  const pinnedTooltipRef = useRef<HTMLDivElement>(null);

  // Tooltip のカスタムコンポーネント
  // recharts がマウス移動毎にこの関数を呼び出すので、そこでホバー中のデータを ref に保存する
  const PowerTooltipContent = useCallback(
    (props: { active?: boolean; payload?: readonly any[]; label?: string | number; coordinate?: { x: number; y: number } }) => {
      const { active, payload, label, coordinate } = props;
      // ホバー中のデータを常に ref に保存（クリック時に読み取るため）
      if (active && payload?.length && coordinate) {
        hoveredRef.current = {
          label: String(label ?? ''),
          payload: payload as PinnedPoint['payload'],
          coordinate: { x: coordinate.x, y: coordinate.y },
        };
      } else {
        hoveredRef.current = null;
      }
      if (!active || !payload?.length) return null;
      return (
        <div
          className="rounded-lg border border-gray-200 bg-white p-3 text-sm shadow-md"
          style={{ color: '#1f2937' }}
        >
          <div className="mb-1 border-b border-gray-100 pb-1 font-semibold">{label}</div>
          {payload.map(
            (item, i) =>
              item.value != null && (
                <div key={i} className="flex items-center gap-2 py-0.5">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-xs text-gray-600">{item.name}:</span>
                  <span className="font-mono font-medium">
                    {typeof item.value === 'number' ? item.value.toFixed(2) : item.value}
                  </span>
                </div>
              )
          )}
        </div>
      );
    },
    [] // ref 経由で参照するため deps 不要
  );

  // ネイティブ DOM click: ホバー中の点を固定（同じ点なら解除）
  const handleChartContainerClick = useCallback(() => {
    const active = hoveredRef.current;
    if (!active) {
      // データのない空白エリアをクリック → 固定解除
      setPinnedPoint(null);
      return;
    }
    setPinnedPoint((prev) =>
      prev?.label === active.label
        ? null // 同じ点を再クリック → 解除
        : { ...active } // 新しい点を固定
    );
  }, []);

  const { data: pumpData, isLoading, error } = useQuery({
    queryKey: ['pumpData', startDate, endDate],
    queryFn: () => snowflakeApi.getPumpData(startDate, endDate),
    enabled: !!startDate && !!endDate,
  });

  const { data: pumpDataPrediction, isLoading: isPredictionLoading } = useQuery({
    queryKey: ['pumpDataPrediction', startDate, endDate],
    queryFn: () => snowflakeApi.getPumpDataPrediction(startDate, endDate),
    enabled: !!startDate && !!endDate,
  });

  const chartData = pumpData?.map((item) => {
    // Find matching prediction data by timestamp
    const predictionItem = pumpDataPrediction?.find(
      (pred) => pred.TIMESTAMP === item.TIMESTAMP
    );

    return {
      timestamp: format(new Date(item.TIMESTAMP), 'MM/dd HH:mm'),
      temperature: item.TEMPERATURE_C,
      fluidTemperature: item.FLUID_TEMPERATURE_C,
      pressure: item.PUMP_OUTLET_PRESSURE_MPA,
      power: item.POWER_CONSUMPTION_KWH,
      powerPrediction: predictionItem?.POWER_CONSUMPTION_KWH_PREDICTION,
      flow: item.PUMP_FLOW_L_PER_H,
    };
  });

  // 予測値に対する実績の絶対誤差が±10%を超えるデータポイント
  const anomalyPoints = chartData?.filter(
    (d) =>
      d.power != null &&
      d.powerPrediction != null &&
      Math.abs(d.power - d.powerPrediction) > 100
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">センサー監視</h2>
        <p className="mt-1 text-sm text-gray-600">
          ポンプシステムの時系列データ
        </p>
      </div>

      {/* 期間選択 */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-4">
          <Calendar className="h-5 w-5 text-gray-500" />
          <div className="flex items-center gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                開始日
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                style={{ colorScheme: 'light' }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                終了日
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                style={{ colorScheme: 'light' }}
              />
            </div>
            <div className="text-sm text-gray-600">
              {pumpData && `${pumpData.length} 件のデータ`}
            </div>
          </div>
        </div>
      </div>

      {/* ローディング・エラー */}
      {(isLoading || isPredictionLoading) && (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <div className="text-gray-600">データを読み込んでいます...</div>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="text-sm text-red-800">
            エラー: データの取得に失敗しました
          </div>
        </div>
      )}

      {/* グラフ表示 */}
      {chartData && chartData.length > 0 && (
        <div className="space-y-6">
          {/* 電力消費量 */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">
              電力消費量 (kWh)
            </h3>
            <div
              className="relative"
              ref={chartContainerRef}
              onClick={handleChartContainerClick}
            >
              <ResponsiveContainer width="100%" height={300}>
                <LineChart
                  data={chartData}
                  style={{ cursor: 'pointer' }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="timestamp"
                    tick={{ fontSize: 12 }}
                    angle={-45}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '1px solid #e5e7eb',
                      borderRadius: '0.375rem',
                      color: '#1f2937',
                    }}
                    labelStyle={{ color: '#1f2937' }}
                    content={PowerTooltipContent}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="power"
                    stroke="#f97316"
                    name="電力消費量（実績）"
                    dot={false}
                    activeDot={{ r: 6, cursor: 'pointer' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="powerPrediction"
                    stroke="#3b82f6"
                    name="電力消費量（DataRobotによる性能予測）"
                    dot={false}
                    activeDot={{ r: 6, cursor: 'pointer' }}
                  />
                  {/* 絶対誤差±10%超の実績値に赤い○を常時表示 */}
                  {anomalyPoints?.map((d) => (
                    <ReferenceDot
                      key={`anomaly-${d.timestamp}`}
                      x={d.timestamp}
                      y={d.power!}
                      r={5}
                      fill="red"
                      stroke="#fff"
                      strokeWidth={1.5}
                    />
                  ))}
                  {/* 固定した○をReferenceDotで描画 */}
                  {pinnedPoint && chartData && (() => {
                    const item = chartData.find((d) => d.timestamp === pinnedPoint.label);
                    if (!item) return null;
                    return (
                      <>
                        {item.power != null && (
                          <ReferenceDot
                            x={item.timestamp}
                            y={item.power}
                            r={6}
                            fill="#f97316"
                            stroke="#fff"
                            strokeWidth={2}
                          />
                        )}
                        {item.powerPrediction != null && (
                          <ReferenceDot
                            x={item.timestamp}
                            y={item.powerPrediction}
                            r={6}
                            fill="#3b82f6"
                            stroke="#fff"
                            strokeWidth={2}
                          />
                        )}
                      </>
                    );
                  })()}
                </LineChart>
              </ResponsiveContainer>
              {pinnedPoint && (
                <PinnedTooltipOverlay
                  pinnedPoint={pinnedPoint}
                  containerRef={chartContainerRef}
                  pinnedTooltipRef={pinnedTooltipRef}
                >
                  <div className="mb-2 border-b border-gray-100 pb-1 font-semibold text-gray-900">
                    {pinnedPoint.label}
                  </div>
                  {pinnedPoint.payload.map(
                    (item, i) =>
                      item.value != null && (
                        <div
                          key={i}
                          className="flex items-center justify-between gap-3 py-0.5"
                        >
                          <div className="flex items-center gap-1.5">
                            <span
                              className="inline-block h-3 w-3 rounded-full"
                              style={{ backgroundColor: item.color }}
                            />
                            <span className="text-xs text-gray-600">{item.name}</span>
                          </div>
                          <span className="font-mono font-medium text-gray-900">
                            {typeof item.value === 'number'
                              ? item.value.toFixed(2)
                              : item.value}
                          </span>
                        </div>
                      )
                  )}
                  {(() => {
                    const actual = pinnedPoint.payload.find((p) => p.dataKey === 'power');
                    const predicted = pinnedPoint.payload.find((p) => p.dataKey === 'powerPrediction');
                    if (
                      actual?.value != null &&
                      predicted?.value != null &&
                      predicted.value !== 0
                    ) {
                      const diff = actual.value - predicted.value;
                      const pct = (diff / Math.abs(predicted.value)) * 100;
                      const isAnomaly = Math.abs(diff) > 100;
                      return (
                        <div
                          className={`mt-1.5 flex items-center justify-between border-t border-gray-100 pt-1.5 ${isAnomaly ? 'text-red-600' : 'text-gray-700'}`}
                        >
                          <span className="text-xs font-medium">予実の乖離</span>
                          <span className="font-mono text-sm font-semibold">
                            {diff >= 0 ? '+' : ''}{diff.toFixed(2)} ({pct >= 0 ? '+' : ''}{pct.toFixed(1)}%)
                          </span>
                        </div>
                      );
                    }
                    return null;
                  })()}
                  <button
                    className="mt-3 w-full rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700"
                    onClick={(e) => {
                      e.stopPropagation();
                      // TODO: バックエンドのAIエンドポイントを呼び出す
                    }}
                  >
                    この予測誤差について分析
                  </button>
                </PinnedTooltipOverlay>
              )}
              {/* 固定した◯を描画（チャートのactiveDotとは独立） */}
            </div>
          </div>

          {/* ポンプ流量 */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">
              ポンプ流量 (L/h)
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="timestamp"
                  tick={{ fontSize: 12 }}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '0.375rem',
                    color: '#1f2937',
                  }}
                  labelStyle={{ color: '#1f2937' }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="flow"
                  stroke="#8b5cf6"
                  name="ポンプ流量"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* 外気温度 */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">
              外気温度 (°C)
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="timestamp"
                  tick={{ fontSize: 12 }}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '0.375rem',
                    color: '#1f2937',
                  }}
                  labelStyle={{ color: '#1f2937' }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="temperature"
                  stroke="#3b82f6"
                  name="外気温度"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* 流体温度 */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">
              流体温度 (°C)
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="timestamp"
                  tick={{ fontSize: 12 }}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '0.375rem',
                    color: '#1f2937',
                  }}
                  labelStyle={{ color: '#1f2937' }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="fluidTemperature"
                  stroke="#10b981"
                  name="流体温度"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* ポンプ出口圧力 */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">
              ポンプ出口圧力 (MPa)
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="timestamp"
                  tick={{ fontSize: 12 }}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '0.375rem',
                    color: '#1f2937',
                  }}
                  labelStyle={{ color: '#1f2937' }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="pressure"
                  stroke="#f59e0b"
                  name="出口圧力"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {chartData && chartData.length === 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <div className="text-gray-600">
            選択された期間にデータがありません
          </div>
        </div>
      )}
    </div>
  );
}

