/**
 * Rupee amounts for API JSON — no trailing ".00" when the value is a whole number.
 */
const formatMoney = (value) => {
  if (value === null || value === undefined || value === '') return '0';
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  if (Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n));
  const fixed = n.toFixed(2);
  return fixed.replace(/\.?0+$/, '');
};

const formatSubscriptionRow = (row) => ({
  ...row,
  price: formatMoney(row.price),
  price_with_saturday: formatMoney(row.price_with_saturday),
  price_without_saturday: formatMoney(row.price_without_saturday),
});

const formatCartPayload = (cart, items) => ({
  cart: cart
    ? {
        ...cart,
        total_amount: formatMoney(cart.total_amount),
      }
    : null,
  items: (items || []).map((item) => ({
    ...item,
    unit_price: formatMoney(item.unit_price),
  })),
});

module.exports = {
  formatMoney,
  formatSubscriptionRow,
  formatCartPayload,
};
