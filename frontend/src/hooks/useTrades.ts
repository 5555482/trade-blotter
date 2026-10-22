import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { tradesApi } from '../api/trades';
import { Trade, CreateTradeInput, AmendTradeInput, WsEvent, PagedTrades } from '../types/trade';

const TRADES_KEY = ['trades'] as const;

export function useTrades() {
  const queryClient = useQueryClient();

  const { data: result, isLoading, error, refetch } = useQuery({
    queryKey: TRADES_KEY,
    queryFn: () => tradesApi.getAll(1, 5000),
  });

  const trades      = result?.data      ?? [];
  const totalTrades = result?.total     ?? 0;

  const applyWsEvent = useCallback((event: WsEvent) => {
    queryClient.setQueryData<PagedTrades>(TRADES_KEY, (prev) => {
      if (!prev) return prev;
      switch (event.type) {
        case 'TRADE_CREATED':
          return { ...prev, data: [event.payload, ...prev.data], total: prev.total + 1 };
        case 'TRADE_AMENDED':
        case 'TRADE_CANCELLED':
          return { ...prev, data: prev.data.map(t => t.id === event.payload.id ? event.payload : t) };
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
    onMutate: async ({ id, input }) => {
      await queryClient.cancelQueries({ queryKey: TRADES_KEY });
      const snapshot = queryClient.getQueryData<PagedTrades>(TRADES_KEY);
      queryClient.setQueryData<PagedTrades>(TRADES_KEY, (prev) =>
        prev ? { ...prev, data: prev.data.map(t => t.id === id ? { ...t, ...input } : t) } : prev,
      );
      return { snapshot };
    },
    onError: (_err, _vars, ctx) => {
      queryClient.setQueryData(TRADES_KEY, ctx?.snapshot);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: TRADES_KEY }),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => tradesApi.cancel(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: TRADES_KEY });
      const snapshot = queryClient.getQueryData<PagedTrades>(TRADES_KEY);
      queryClient.setQueryData<PagedTrades>(TRADES_KEY, (prev) =>
        prev
          ? { ...prev, data: prev.data.map(t => t.id === id ? { ...t, status: 'CANCELLED' as Trade['status'] } : t) }
          : prev,
      );
      return { snapshot };
    },
    onError: (_err, _id, ctx) => {
      queryClient.setQueryData(TRADES_KEY, ctx?.snapshot);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: TRADES_KEY }),
  });

  return {
    trades,
    totalTrades,
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
