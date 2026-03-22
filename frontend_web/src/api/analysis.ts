/**
 * SSE client for the power-consumption analysis endpoint.
 *
 * Streams events from the 3-agent analysis pipeline and invokes
 * a caller-supplied callback for every SSE frame received.
 */

import axios from 'axios';

const API_BASE_URL = '/api/v1/analysis';

export interface AnomalyItem {
  timestamp: string;
  power: number;
  power_prediction: number;
  diff: number;
  diff_pct: number;
}

export interface ChartDataRow {
  timestamp: string;
  temperature?: number | null;
  fluidTemperature?: number | null;
  pressure?: number | null;
  power?: number | null;
  powerPrediction?: number | null;
  flow?: number | null;
}

export interface AnalysisRequest {
  start_date: string;
  end_date: string;
  anomaly_points: AnomalyItem[];
  total_data_points: number;
  chart_data: ChartDataRow[];
}

export type AgentStepStatus = 'pending' | 'running' | 'completed';

export interface AgentStepEvent {
  agent_id: number;
  title: string;
  description?: string;
  status: AgentStepStatus;
  content: string;
}

export interface AnalysisCompleteEvent {
  status: 'done';
  report_uuid?: string | null;
}

export type AnalysisSSEEvent =
  | { event: 'agent_step'; data: AgentStepEvent }
  | { event: 'analysis_complete'; data: AnalysisCompleteEvent };

/**
 * Start the power-consumption analysis and consume the SSE stream.
 *
 * @returns An `AbortController` that can be used to cancel the request.
 */
export function startPowerAnalysis(
  request: AnalysisRequest,
  onEvent: (event: AnalysisSSEEvent) => void,
  onError?: (error: Error) => void,
): AbortController {
  const controller = new AbortController();

  (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/power-consumption`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: controller.signal,
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`Analysis request failed: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No readable stream');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE frames from buffer
        const frames = buffer.split('\n\n');
        // Last element is either empty or an incomplete frame
        buffer = frames.pop() ?? '';

        for (const frame of frames) {
          if (!frame.trim()) continue;

          let eventType = '';
          let dataStr = '';

          for (const line of frame.split('\n')) {
            if (line.startsWith('event: ')) {
              eventType = line.slice(7);
            } else if (line.startsWith('data: ')) {
              dataStr = line.slice(6);
            }
          }

          if (eventType && dataStr) {
            try {
              const data = JSON.parse(dataStr);
              onEvent({ event: eventType, data } as AnalysisSSEEvent);
            } catch {
              // skip malformed frames
            }
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  })();

  return controller;
}

// ---------------------------------------------------------------------------
// Analysis report CRUD types & functions
// ---------------------------------------------------------------------------

export interface AnalysisReportSummary {
  uuid: string;
  created_at: string;
  start_date: string;
  end_date: string;
  total_data_points: number;
  anomaly_count: number;
}

export interface AnalysisReportDetail extends AnalysisReportSummary {
  divergence_report: string;
  past_cases_report: string;
  maintenance_actions_report: string;
  duckdb_table_name: string;
  user_uuid: string | null;
}

export interface TimeseriesRow {
  timestamp: string;
  temperature: number | null;
  fluid_temperature: number | null;
  pressure: number | null;
  power: number | null;
  power_prediction: number | null;
  flow: number | null;
  is_anomaly: boolean;
}

export async function fetchAnalysisReports(): Promise<AnalysisReportSummary[]> {
  const res = await axios.get(`${API_BASE_URL}/reports`);
  return res.data;
}

export async function fetchAnalysisReport(
  uuid: string,
): Promise<AnalysisReportDetail> {
  const res = await axios.get(`${API_BASE_URL}/reports/${uuid}`);
  return res.data;
}

export async function fetchAnalysisTimeseries(
  uuid: string,
): Promise<TimeseriesRow[]> {
  const res = await axios.get(`${API_BASE_URL}/reports/${uuid}/timeseries`);
  return res.data;
}

export async function deleteAnalysisReport(uuid: string): Promise<void> {
  await axios.delete(`${API_BASE_URL}/reports/${uuid}`);
}

export async function downloadAnalysisReport(uuid: string): Promise<void> {
  const res = await axios.get(`${API_BASE_URL}/reports/${uuid}/download`, {
    responseType: 'blob',
  });
  const blob = new Blob([res.data], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const disposition = res.headers['content-disposition'] as string | undefined;
  const match = disposition?.match(/filename="?(.+?)"?$/);
  a.download = match?.[1] ?? `analysis_report_${uuid}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
