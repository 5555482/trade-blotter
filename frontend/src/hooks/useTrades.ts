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

  // Optimistic amend: apply field changes immediately, rollback on error
  const amendMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: AmendTradeInput }) =>
      tradesApi.amend(id, input),

    onMutate: async ({ id, input }) => {
      await queryClient.cancelQueries({ queryKey: TRADES_KEY });
      const snapshot = queryClient.getQueryData<Trade[]>(TRADES_KEY);
      queryClient.setQueryData<Trade[]>(TRADES_KEY, (prev = []) =>
        prev.map(t => t.id === id ? { ...t, ...input } : t),
      );
      return { snapshot };
    },
    onError: (_err, _vars, ctx) => {
      queryClient.setQueryData(TRADES_KEY, ctx?.snapshot);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: TRADES_KEY }),
  });

  // Optimistic cancel: mark as CANCELLED immediately, rollback on error
  const cancelMutation = useMutation({
    mutationFn: (id: string) => tradesApi.cancel(id),

    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: TRADES_KEY });
      const snapshot = queryClient.getQueryData<Trade[]>(TRADES_KEY);
      queryClient.setQueryData<Trade[]>(TRADES_KEY, (prev = []) =>
        prev.map(t => t.id === id ? { ...t, status: 'CANCELLED' as Trade['status'] } : t),
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
