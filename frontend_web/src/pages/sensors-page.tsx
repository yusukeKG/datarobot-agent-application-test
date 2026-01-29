import { useQuery } from '@tanstack/react-query';
import { format, subDays } from 'date-fns';
import { Calendar } from 'lucide-react';
import { useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { snowflakeApi } from '@/api/snowflake';

export function SensorsPage() {
  const [startDate, setStartDate] = useState<string>(
    format(subDays(new Date(), 7), 'yyyy-MM-dd')
  );
  const [endDate, setEndDate] = useState<string>(
    format(new Date(), 'yyyy-MM-dd')
  );

  const { data: pumpData, isLoading, error } = useQuery({
    queryKey: ['pumpData', startDate, endDate],
    queryFn: () => snowflakeApi.getPumpData(startDate, endDate),
    enabled: !!startDate && !!endDate,
  });

  const chartData = pumpData?.map((item) => ({
    timestamp: format(new Date(item.TIMESTAMP), 'MM/dd HH:mm'),
    temperature: item.TEMPERATURE_C,
    fluidTemperature: item.FLUID_TEMPERATURE_C,
    pressure: item.PUMP_OUTLET_PRESSURE_MPA,
    power: item.POWER_CONSUMPTION_KWH,
    flow: item.PUMP_FLOW_L_PER_H,
  }));

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
      {isLoading && (
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
                  dataKey="power"
                  stroke="#ef4444"
                  name="電力消費量"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
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

