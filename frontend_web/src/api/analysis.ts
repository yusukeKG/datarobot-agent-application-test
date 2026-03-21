/**
 * SSE client for the power-consumption analysis endpoint.
 *
 * Streams events from the 3-agent analysis pipeline and invokes
 * a caller-supplied callback for every SSE frame received.
 */

const API_BASE_URL = '/api/v1/analysis';

export interface AnomalyItem {
  timestamp: string;
  power: number;
  power_prediction: number;
  diff: number;
  diff_pct: number;
}

export interface AnalysisRequest {
  start_date: string;
  end_date: string;
  anomaly_points: AnomalyItem[];
  total_data_points: number;
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
