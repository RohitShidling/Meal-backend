/**
 * SQL expression for a client's display name: app registration username, else phone.
 * Does not use child / teacher / professional profile names.
 */
const clientDisplayNameSql = (clientAlias = 'c') =>
  `COALESCE(NULLIF(TRIM(${clientAlias}.username), ''), NULLIF(TRIM(${clientAlias}.phone_number), ''))`;

module.exports = { clientDisplayNameSql };
