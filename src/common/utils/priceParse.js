'use strict';

/**
 * Whole-rupee amounts (no paise). Empty / whitespace → NaN so callers never persist `Number('') === 0`.
 * @param {unknown} value
 * @returns {number}
 */
function parseRupeeInt(value) {
  if (value === null || value === undefined) return NaN;
  if (typeof value === 'string' && value.trim() === '') return NaN;
  const n = Number(String(value).trim());
  if (!Number.isFinite(n) || n < 0) return NaN;
  return Math.round(n);
}

/** JSON-friendly integers for subscription price fields (Postgres DECIMAL often serializes as "800.00"). */
function mapRowIntPrices(row) {
  if (!row || typeof row !== 'object') return row;
  const out = { ...row };
  for (const k of ['price', 'price_with_saturday', 'price_without_saturday', 'unit_price']) {
    if (Object.prototype.hasOwnProperty.call(out, k) && out[k] != null && out[k] !== '') {
      const n = Number(out[k]);
      if (Number.isFinite(n)) out[k] = Math.round(n);
    }
  }
  return out;
}

function mapRowsIntPrices(rows) {
  if (!Array.isArray(rows)) return rows;
  return rows.map(mapRowIntPrices);
}

module.exports = { parseRupeeInt, mapRowIntPrices, mapRowsIntPrices };
