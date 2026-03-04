/**
 * src/utils/formatters.ts
 *
 * Shared number and currency formatting utilities used across components.
 *
 * All formatters use the en-US locale for consistent comma separators and
 * dollar signs regardless of the user's browser locale.
 *
 * Usage:
 *   numberFormatter.format(12345)          → "12,345"
 *   currencyFormatter.format(1234.5)       → "$1,234.50"
 *   formatLargeCurrency(1_500_000_000_000) → "$1.50T"
 *   formatLargeCurrency(2_300_000_000)     → "$2.30B"
 */

export const numberFormatter = new Intl.NumberFormat('en-US');

export const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2
});

/**
 * Format a large dollar value with a T (trillion) or B (billion) suffix.
 * Falls back to standard currency formatting for values below $1 billion.
 */
export function formatLargeCurrency(value: number) {
  if (value >= 1_000_000_000_000) {
    return `${currencyFormatter.format(value / 1_000_000_000_000)}T`;
  }

  if (value >= 1_000_000_000) {
    return `${currencyFormatter.format(value / 1_000_000_000)}B`;
  }

  return currencyFormatter.format(value);
}
