import { describe, it, expect } from 'vitest';
import { formatPrice, formatQuantity } from './formatters';

describe('formatters', () => {
  it('formatPrice formats to 2 decimal places', () => {
    expect(formatPrice(227.4)).toBe('227.40');
    expect(formatPrice(1000)).toBe('1000.00');
    expect(formatPrice(0.5)).toBe('0.50');
  });

  it('formatQuantity adds thousand separators', () => {
    expect(formatQuantity(5000)).toBe('5,000');
    expect(formatQuantity(100)).toBe('100');
    expect(formatQuantity(1000000)).toBe('1,000,000');
  });
});
