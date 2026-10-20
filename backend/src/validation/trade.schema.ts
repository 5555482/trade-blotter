import { z } from 'zod';

export const createTradeSchema = z.object({
  symbol: z.string().min(1).max(10).toUpperCase(),
  quantity: z.number().int().positive(),
  price: z.number().positive(),
  side: z.enum(['BUY', 'SELL']),
  trader: z.string().min(1).max(20).toUpperCase(),
  book: z.string().min(1),
  counterparty: z.string().min(1),
});

export const amendTradeSchema = z.object({
  symbol: z.string().min(1).max(10).toUpperCase().optional(),
  quantity: z.number().int().positive().optional(),
  price: z.number().positive().optional(),
  side: z.enum(['BUY', 'SELL']).optional(),
  trader: z.string().min(1).max(20).toUpperCase().optional(),
  book: z.string().min(1).optional(),
  counterparty: z.string().min(1).optional(),
}).refine(obj => Object.keys(obj).length > 0, { message: 'At least one field must be provided' });
