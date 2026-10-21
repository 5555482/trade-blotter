import { describe, it, expect } from 'vitest';
import { formatPrice, formatQuantity, formatNotional, formatLargeNotional } from './formatters';

describe('formatPrice', () => {
  it('includes dollar sign and 2 decimal places', () => {
    expect(formatPrice(145.5)).toBe('$145.50');
    expect(formatPrice(0.5)).toBe('$0.50');
  });

  it('adds thousand separators for large prices', () => {
    expect(formatPrice(12345.67)).toBe('$12,345.67');
  });

  it('formats zero', () => {
    expect(formatPrice(0)).toBe('$0.00');
  });
});

describe('formatQuantity', () => {
  it('adds thousand separators', () => {
    expect(formatQuantity(5000)).toBe('5,000');
    expect(formatQuantity(1_000_000)).toBe('1,000,000');
  });

  it('leaves small numbers unformatted', () => {
    expect(formatQuantity(100)).toBe('100');
  });
});

describe('formatNotional', () => {
  it('rounds to zero decimal places and includes dollar sign', () => {
    expect(formatNotional(72750)).toBe('$72,750');
  });

  it('rounds up fractions', () => {
    expect(formatNotional(72750.9)).toBe('$72,751');
  });
});

describe('formatLargeNotional', () => {
  it('abbreviates billions', () => {
    expect(formatLargeNotional(2_500_000_000)).toBe('$2.50B');
  });

  it('abbreviates millions to 1 decimal', () => {
    expect(formatLargeNotional(12_400_000)).toBe('$12.4M');
  });

  it('abbreviates thousands', () => {
    expect(formatLargeNotional(85_000)).toBe('$85K');
  });

  it('falls back to full format below 1 000', () => {
    expect(formatLargeNotional(500)).toBe('$500');
  });
});
