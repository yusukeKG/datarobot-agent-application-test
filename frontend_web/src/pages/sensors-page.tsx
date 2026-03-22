import { useQuery } from '@tanstack/react-query';
import { format, subDays } from 'date-fns';
import { Calendar, CheckCircle2, CircleDot, Clock, Loader2, XCircle } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Link } from 'react-router-dom';
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
import {
  type AgentStepEvent,
  type AnalysisSSEEvent,
  startPowerAnalysis,
} from '@/api/analysis';
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

// 同期サブチャート: 電力消費量チャートの固定ポイントに連動して吹き出しを表示
function SyncedMetricChart({
  data,
  dataKey,
  name,
  stroke,
  pinnedTimestamp,
}: {
  data: Array<Record<string, any>>;
  dataKey: string;
  name: string;
  stroke: string;
  pinnedTimestamp: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [pinnedCoord, setPinnedCoord] = useState<{ x: number; y: number } | null>(null);

  const pinnedItem = pinnedTimestamp
    ? data.find((d) => d.timestamp === pinnedTimestamp)
    : null;
  const pinnedValue = pinnedItem?.[dataKey] as number | null | undefined;

  // ReferenceDot レンダリング後に SVG 座標を取得
  useEffect(() => {
    if (!pinnedTimestamp || pinnedValue == null || !containerRef.current) {
      setPinnedCoord(null);
      return;
    }
    const timer = setTimeout(() => {
      const container = containerRef.current;
      if (!container) return;
      const dot = container.querySelector('.recharts-reference-dot circle');
      if (dot) {
        const cx = parseFloat(dot.getAttribute('cx') || '0');
        const cy = parseFloat(dot.getAttribute('cy') || '0');
        setPinnedCoord({ x: cx, y: cy });
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [pinnedTimestamp, pinnedValue, data]);

  return (
    <div className="relative" ref={containerRef}>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
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
            dataKey={dataKey}
            stroke={stroke}
            name={name}
            dot={false}
          />
          {pinnedTimestamp && pinnedItem && pinnedValue != null && (
            <ReferenceDot
              x={pinnedItem.timestamp}
              y={pinnedValue}
              r={6}
              fill={stroke}
              stroke="#fff"
              strokeWidth={2}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
      {pinnedTimestamp && pinnedItem && pinnedValue != null && pinnedCoord && (
        <PinnedTooltipOverlay
          pinnedPoint={{
            label: pinnedTimestamp,
            payload: [{ name, value: pinnedValue, color: stroke, dataKey }],
            coordinate: pinnedCoord,
          }}
          containerRef={containerRef}
          pinnedTooltipRef={tooltipRef}
        >
          <div className="mb-2 border-b border-gray-100 pb-1 font-semibold text-gray-900">
            {pinnedTimestamp}
          </div>
          <div className="flex items-center justify-between gap-3 py-0.5">
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ backgroundColor: stroke }}
              />
              <span className="text-xs text-gray-600">{name}</span>
            </div>
            <span className="font-mono font-medium text-gray-900">
              {pinnedValue.toFixed(2)}
            </span>
          </div>
        </PinnedTooltipOverlay>
      )}
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

  // --- AI 分析ステート ---
  const [analysisSteps, setAnalysisSteps] = useState<AgentStepEvent[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [savedReportUuid, setSavedReportUuid] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const analysisPanelRef = useRef<HTMLDivElement>(null);

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

  // クリーンアップ: コンポーネントアンマウント時にSSE接続を切断
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
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

  // 予測値に対する実績の絶対誤差が閾値を超えるデータポイント
  const anomalyPoints = chartData?.filter(
    (d) =>
      d.power != null &&
      d.powerPrediction != null &&
      Math.abs(d.power - d.powerPrediction) > 100
  );

  // --- AI 分析ハンドラ ---
  const handleStartAnalysis = useCallback(() => {
    if (isAnalyzing) return;

    // anomaly summary を構築
    const anomalySummary = (anomalyPoints ?? []).map((d) => ({
      timestamp: d.timestamp,
      power: d.power!,
      power_prediction: d.powerPrediction!,
      diff: d.power! - d.powerPrediction!,
      diff_pct:
        d.powerPrediction !== 0
          ? ((d.power! - d.powerPrediction!) / Math.abs(d.powerPrediction!)) * 100
          : 0,
    }));

    setIsAnalyzing(true);
    setAnalysisError(null);
    setAnalysisSteps([]);
    setSavedReportUuid(null);

    const controller = startPowerAnalysis(
      {
        start_date: startDate,
        end_date: endDate,
        anomaly_points: anomalySummary,
        total_data_points: chartData?.length ?? 0,
        chart_data: (chartData ?? []).map((d) => ({
          timestamp: d.timestamp,
          temperature: d.temperature ?? null,
          fluidTemperature: d.fluidTemperature ?? null,
          pressure: d.pressure ?? null,
          power: d.power ?? null,
          powerPrediction: d.powerPrediction ?? null,
          flow: d.flow ?? null,
        })),
      },
      (event: AnalysisSSEEvent) => {
        if (event.event === 'agent_step') {
          const step = event.data as AgentStepEvent;
          setAnalysisSteps((prev) => {
            const idx = prev.findIndex((s) => s.agent_id === step.agent_id);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = step;
              return next;
            }
            return [...prev, step];
          });
        } else if (event.event === 'analysis_complete') {
          setIsAnalyzing(false);
          const completeData = event.data as { status: string; report_uuid?: string | null };
          if (completeData.report_uuid) {
            setSavedReportUuid(completeData.report_uuid);
          }
        }
      },
      (err) => {
        setAnalysisError(err.message);
        setIsAnalyzing(false);
      },
    );
    abortRef.current = controller;

    // 分析パネルへスクロール
    setTimeout(() => {
      analysisPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }, [isAnalyzing, startDate, endDate, chartData, anomalyPoints]);

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
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                電力消費量 (kWh)
              </h3>
              <button
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                disabled={isAnalyzing}
                onClick={handleStartAnalysis}
              >
                {isAnalyzing && <Loader2 className="h-4 w-4 animate-spin" />}
                {isAnalyzing ? '分析中…' : 'この期間をAIで分析'}
              </button>
            </div>
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
                </PinnedTooltipOverlay>
              )}
              {/* 固定した◯を描画（チャートのactiveDotとは独立） */}
            </div>
          </div>

          {/* AI 分析結果パネル */}
          {(analysisSteps.length > 0 || isAnalyzing || analysisError) && (
            <div
              ref={analysisPanelRef}
              className="rounded-lg border border-blue-200 bg-gradient-to-br from-blue-50 to-white p-6 shadow-sm"
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <CircleDot className="h-5 w-5 text-blue-600" />
                  AI 分析レポート
                </h3>
                {!isAnalyzing && analysisSteps.length > 0 && (
                  <button
                    className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                    onClick={() => {
                      setAnalysisSteps([]);
                      setAnalysisError(null);
                      setSavedReportUuid(null);
                    }}
                  >
                    <XCircle className="h-4 w-4" />
                  </button>
                )}
              </div>

              {analysisError && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 mb-4">
                  エラー: {analysisError}
                </div>
              )}

              {savedReportUuid && !isAnalyzing && (
                <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800 mb-4 flex items-center justify-between">
                  <span>分析結果を保存しました</span>
                  <Link
                    to={`/analysis-history/${savedReportUuid}`}
                    className="font-medium text-green-700 underline hover:text-green-900"
                  >
                    詳細を見る →
                  </Link>
                </div>
              )}

              <div className="space-y-4">
                {analysisSteps.map((step) => (
                  <div
                    key={step.agent_id}
                    className={`rounded-lg border p-4 transition-all duration-300 ${
                      step.status === 'completed'
                        ? 'border-green-200 bg-white'
                        : step.status === 'running'
                          ? 'border-blue-300 bg-blue-50/50'
                          : 'border-gray-200 bg-gray-50/50'
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      {step.status === 'completed' && (
                        <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />
                      )}
                      {step.status === 'running' && (
                        <Loader2 className="h-5 w-5 text-blue-500 animate-spin flex-shrink-0" />
                      )}
                      {step.status === 'pending' && (
                        <Clock className="h-5 w-5 text-gray-400 flex-shrink-0" />
                      )}
                      <div>
                        <span className="text-sm font-semibold text-gray-900">
                          エージェント {step.agent_id}: {step.title}
                        </span>
                        {step.status === 'running' && step.description && (
                          <p className="text-xs text-blue-600 mt-0.5">{step.description}</p>
                        )}
                        {step.status === 'pending' && (
                          <p className="text-xs text-gray-400 mt-0.5">待機中</p>
                        )}
                      </div>
                    </div>
                    {step.status === 'completed' && step.content && (
                      <div className="mt-3 border-t border-gray-100 pt-3 prose prose-sm max-w-none text-gray-700">
                        <ReactMarkdown>{step.content}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ポンプ流量 */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">
              ポンプ流量 (L/h)
            </h3>
            <SyncedMetricChart
              data={chartData}
              dataKey="flow"
              name="ポンプ流量"
              stroke="#8b5cf6"
              pinnedTimestamp={pinnedPoint?.label ?? null}
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
              pinnedTimestamp={pinnedPoint?.label ?? null}
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
              pinnedTimestamp={pinnedPoint?.label ?? null}
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
              name="出口圧力"
              stroke="#f59e0b"
              pinnedTimestamp={pinnedPoint?.label ?? null}
            />
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

