const BULK_ENTITY_NAME = 'bulk';

const TIER_MODE = {
  UNDER_THRESHOLD: 'under_threshold',
  AT_OR_ABOVE_THRESHOLD: 'at_or_above_threshold',
};

const BULK_ORDER_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  CANCELLED: 'cancelled',
};

const MAX_TOTAL_QUANTITY = 5000;
const MAX_LINE_QUANTITY = 5000;

module.exports = {
  BULK_ENTITY_NAME,
  TIER_MODE,
  BULK_ORDER_STATUS,
  MAX_TOTAL_QUANTITY,
  MAX_LINE_QUANTITY,
};
