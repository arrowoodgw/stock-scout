export const numberFormatter = new Intl.NumberFormat('en-US');

export const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2
});

export function formatLargeCurrency(value: number) {
  if (value >= 1_000_000_000_000) {
    return `${currencyFormatter.format(value / 1_000_000_000_000)}T`;
  }

  if (value >= 1_000_000_000) {
    return `${currencyFormatter.format(value / 1_000_000_000)}B`;
  }

  return currencyFormatter.format(value);
}
