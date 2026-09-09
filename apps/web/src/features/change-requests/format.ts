/** Money impact of a change, with its currency; "—" when the provider has not priced it yet. */
export function formatCost(amount: string | null, currency: string): string {
  if (amount === null) {
    return '—';
  }
  const value = Number(amount);
  return Number.isFinite(value)
    ? `${currency} ${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
    : `${currency} ${amount}`;
}
