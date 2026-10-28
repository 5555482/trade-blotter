import { useQuery } from '@tanstack/react-query';
import { tradesApi } from '../api/trades';

export function useAuditHistory(tradeId: string | null) {
  return useQuery({
    queryKey: ['audit', tradeId],
    queryFn: () => tradesApi.getAudit(tradeId!),
    enabled: !!tradeId,
  });
}
