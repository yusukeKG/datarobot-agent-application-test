import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type AnalysisReportDetail,
  type AnalysisReportSummary,
  type TimeseriesRow,
  deleteAnalysisReport,
  fetchAnalysisReport,
  fetchAnalysisReports,
  fetchAnalysisTimeseries,
} from '@/api/analysis';

export function useAnalysisReports() {
  return useQuery<AnalysisReportSummary[]>({
    queryKey: ['analysisReports'],
    queryFn: fetchAnalysisReports,
  });
}

export function useAnalysisReport(uuid: string | undefined) {
  return useQuery<AnalysisReportDetail>({
    queryKey: ['analysisReport', uuid],
    queryFn: () => fetchAnalysisReport(uuid!),
    enabled: !!uuid,
  });
}

export function useAnalysisTimeseries(uuid: string | undefined) {
  return useQuery<TimeseriesRow[]>({
    queryKey: ['analysisTimeseries', uuid],
    queryFn: () => fetchAnalysisTimeseries(uuid!),
    enabled: !!uuid,
  });
}

export function useDeleteAnalysisReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (uuid: string) => deleteAnalysisReport(uuid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['analysisReports'] });
    },
  });
}
