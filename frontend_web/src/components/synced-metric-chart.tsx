import { useEffect, useRef, useState } from 'react';
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

interface SyncedMetricChartProps {
  data: Array<Record<string, any>>;
  dataKey: string;
  name: string;
  stroke: string;
  pinnedTimestamp: string | null;
}

export function SyncedMetricChart({
  data,
  dataKey,
  name,
  stroke,
  pinnedTimestamp,
}: SyncedMetricChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [pinnedCoord, setPinnedCoord] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const pinnedItem = pinnedTimestamp
    ? data.find((d) => d.timestamp === pinnedTimestamp)
    : null;
  const pinnedValue = pinnedItem?.[dataKey] as number | null | undefined;

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
