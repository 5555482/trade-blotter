import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { tradesApi } from '../api/trades';
import { Trade, CreateTradeInput, AmendTradeInput, WsEvent } from '../types/trade';

const TRADES_KEY = ['trades'] as const;

export function useTrades() {
  const queryClient = useQueryClient();

  const { data: trades = [], isLoading, error, refetch } = useQuery({
    queryKey: TRADES_KEY,
    queryFn: tradesApi.getAll,
  });

  const applyWsEvent = useCallback((event: WsEvent) => {
    queryClient.setQueryData<Trade[]>(TRADES_KEY, (prev = []) => {
      switch (event.type) {
        case 'TRADE_CREATED':
          return [event.payload, ...prev];
        case 'TRADE_AMENDED':
        case 'TRADE_CANCELLED':
          return prev.map((t) => (t.id === event.payload.id ? event.payload : t));
        default:
          return prev;
      }
    });
  }, [queryClient]);

  const createMutation = useMutation({
    mutationFn: (input: CreateTradeInput) => tradesApi.create(input),
  });

  const amendMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: AmendTradeInput }) =>
      tradesApi.amend(id, input),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => tradesApi.cancel(id),
  });

  return {
    trades,
    isLoading,
    error,
    refetch,
    applyWsEvent,
    createTrade: createMutation.mutateAsync,
    amendTrade: amendMutation.mutateAsync,
    cancelTrade: cancelMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isAmending: amendMutation.isPending,
    isCancelling: cancelMutation.isPending,
  };
}
