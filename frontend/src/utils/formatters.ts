export function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

export function formatPrice(value: number): string {
  return value.toFixed(2);
}

export function formatQuantity(value: number): string {
  return value.toLocaleString();
}
