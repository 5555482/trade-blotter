import { useCallback, useState } from 'react';
import { Trade } from '../types/trade';
import { useToast } from '../context/ToastContext';

export function useCancelFlow(cancelTrade: (id: string) => Promise<Trade>) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const toast = useToast();

  const request = useCallback((id: string) => setPendingId(id), []);

  const confirm = useCallback(async () => {
    if (!pendingId) return;
    const id = pendingId;
    setPendingId(null);
    try {
      await cancelTrade(id);
      toast('success', 'Trade cancelled', id);
    } catch (err) {
      toast('error', 'Cancel failed', err instanceof Error ? err.message : 'Unknown error');
    }
  }, [pendingId, cancelTrade, toast]);

  const abort = useCallback(() => setPendingId(null), []);

  return { pendingId, request, confirm, abort };
}
