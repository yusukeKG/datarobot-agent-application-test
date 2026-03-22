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

export type ChartDataPoint = {
  timestamp: string;
  temperature?: number | null;
  fluidTemperature?: number | null;
  pressure?: number | null;
  power?: number | null;
  powerPrediction?: number | null;
  flow?: number | null;
};

type PinnedPoint = {
  label: string;
  payload: Array<{
    name: string;
    value: number | null | undefined;
    color: string;
    dataKey: string;
  }>;
  coordinate: { x: number; y: number };
};

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
    if (left < 4) left = 4;
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
        transform:
          adjustedLeft != null ? 'translateY(-100%)' : 'translate(-50%, -100%)',
        minWidth: '220px',
        maxWidth: '320px',
      }}
    >
      {children}
    </div>
  );
}

interface PowerChartProps {
  data: ChartDataPoint[];
  height?: number;
}

export function PowerChart({ data, height = 300 }: PowerChartProps) {
  const [pinnedPoint, setPinnedPoint] = useState<PinnedPoint | null>(null);
  const hoveredRef = useRef<PinnedPoint | null>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const pinnedTooltipRef = useRef<HTMLDivElement>(null);

  const anomalyPoints = data.filter(
    (d) =>
      d.power != null &&
      d.powerPrediction != null &&
      Math.abs(d.power! - d.powerPrediction!) > 100,
  );

  const PowerTooltipContent = useCallback(
    (props: {
      active?: boolean;
      payload?: readonly any[];
      label?: string | number;
      coordinate?: { x: number; y: number };
    }) => {
      const { active, payload, label, coordinate } = props;
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
          <div className="mb-1 border-b border-gray-100 pb-1 font-semibold">
            {label}
          </div>
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
                    {typeof item.value === 'number'
                      ? item.value.toFixed(2)
                      : item.value}
                  </span>
                </div>
              ),
          )}
        </div>
      );
    },
    [],
  );

  const handleChartContainerClick = useCallback(() => {
    const active = hoveredRef.current;
    if (!active) {
      setPinnedPoint(null);
      return;
    }
    setPinnedPoint((prev) =>
      prev?.label === active.label ? null : { ...active },
    );
  }, []);

  return (
    <div
      className="relative"
      ref={chartContainerRef}
      onClick={handleChartContainerClick}
    >
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} style={{ cursor: 'pointer' }}>
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
          {anomalyPoints.map((d) => (
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
          {pinnedPoint &&
            (() => {
              const item = data.find((d) => d.timestamp === pinnedPoint.label);
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
              ),
          )}
          {(() => {
            const actual = pinnedPoint.payload.find(
              (p) => p.dataKey === 'power',
            );
            const predicted = pinnedPoint.payload.find(
              (p) => p.dataKey === 'powerPrediction',
            );
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
                    {diff >= 0 ? '+' : ''}
                    {diff.toFixed(2)} ({pct >= 0 ? '+' : ''}
                    {pct.toFixed(1)}%)
                  </span>
                </div>
              );
            }
            return null;
          })()}
        </PinnedTooltipOverlay>
      )}
    </div>
  );
}
