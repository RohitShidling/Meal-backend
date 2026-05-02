const AppError = require('../../common/utils/AppError');

const validateCreateState = (req, res, next) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return next(new AppError('Validation failed.', 400, ['name is required.']));
  }
  next();
};

const validateCreateCity = (req, res, next) => {
  const { name, stateId } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return next(new AppError('Validation failed.', 400, ['name is required.']));
  }
  if (!stateId || Number.isNaN(Number(stateId))) {
    return next(new AppError('Validation failed.', 400, ['stateId is required and must be a number.']));
  }
  next();
};

const validateCreateCompany = (req, res, next) => {
  const { name, cityId } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return next(new AppError('Validation failed.', 400, ['name is required.']));
  }
  if (cityId !== undefined && cityId !== null && Number.isNaN(Number(cityId))) {
    return next(new AppError('Validation failed.', 400, ['cityId must be a number when provided.']));
  }
  next();
};

const validateCreateMealSize = (req, res, next) => {
  const { name, displayName, sortOrder } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return next(new AppError('Validation failed.', 400, ['name is required.']));
  }
  if (!displayName || typeof displayName !== 'string' || !displayName.trim()) {
    return next(new AppError('Validation failed.', 400, ['displayName is required.']));
  }
  if (sortOrder !== undefined && Number.isNaN(Number(sortOrder))) {
    return next(new AppError('Validation failed.', 400, ['sortOrder must be a number when provided.']));
  }
  next();
};

const validateIdParam = (paramName) => (req, res, next) => {
  const value = req.params[paramName];
  if (!value || Number.isNaN(Number(value))) {
    return next(new AppError('Validation failed.', 400, [`${paramName} must be a valid number.`]));
  }
  next();
};

const validateUpdateState = (req, res, next) => {
  const { name, isActive } = req.body;
  if (name === undefined && isActive === undefined) {
    return next(new AppError('Validation failed.', 400, ['At least one field (name or isActive) is required.']));
  }
  if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
    return next(new AppError('Validation failed.', 400, ['name must be a non-empty string.']));
  }
  if (isActive !== undefined && typeof isActive !== 'boolean') {
    return next(new AppError('Validation failed.', 400, ['isActive must be boolean.']));
  }
  next();
};

const validateUpdateCity = (req, res, next) => {
  const { name, stateId, isActive } = req.body;
  if (name === undefined && stateId === undefined && isActive === undefined) {
    return next(new AppError('Validation failed.', 400, ['At least one field (name, stateId, isActive) is required.']));
  }
  if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
    return next(new AppError('Validation failed.', 400, ['name must be a non-empty string.']));
  }
  if (stateId !== undefined && Number.isNaN(Number(stateId))) {
    return next(new AppError('Validation failed.', 400, ['stateId must be a number.']));
  }
  if (isActive !== undefined && typeof isActive !== 'boolean') {
    return next(new AppError('Validation failed.', 400, ['isActive must be boolean.']));
  }
  next();
};

const validateUpdateCompany = (req, res, next) => {
  const { name, cityId, isActive } = req.body;
  if (name === undefined && cityId === undefined && isActive === undefined) {
    return next(new AppError('Validation failed.', 400, ['At least one field (name, cityId, isActive) is required.']));
  }
  if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
    return next(new AppError('Validation failed.', 400, ['name must be a non-empty string.']));
  }
  if (cityId !== undefined && cityId !== null && Number.isNaN(Number(cityId))) {
    return next(new AppError('Validation failed.', 400, ['cityId must be a number when provided.']));
  }
  if (isActive !== undefined && typeof isActive !== 'boolean') {
    return next(new AppError('Validation failed.', 400, ['isActive must be boolean.']));
  }
  next();
};

const validateUpdateMealSize = (req, res, next) => {
  const { name, displayName, sortOrder, isActive } = req.body;
  if (name === undefined && displayName === undefined && sortOrder === undefined && isActive === undefined) {
    return next(new AppError('Validation failed.', 400, ['At least one field (name, displayName, sortOrder, isActive) is required.']));
  }
  if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
    return next(new AppError('Validation failed.', 400, ['name must be a non-empty string.']));
  }
  if (displayName !== undefined && (typeof displayName !== 'string' || !displayName.trim())) {
    return next(new AppError('Validation failed.', 400, ['displayName must be a non-empty string.']));
  }
  if (sortOrder !== undefined && Number.isNaN(Number(sortOrder))) {
    return next(new AppError('Validation failed.', 400, ['sortOrder must be a number.']));
  }
  if (isActive !== undefined && typeof isActive !== 'boolean') {
    return next(new AppError('Validation failed.', 400, ['isActive must be boolean.']));
  }
  next();
};

const validateCreateStandard = (req, res, next) => {
  const { name, displayName, numericValue } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return next(new AppError('Validation failed.', 400, ['name is required.']));
  }
  if (!displayName || typeof displayName !== 'string' || !displayName.trim()) {
    return next(new AppError('Validation failed.', 400, ['displayName is required.']));
  }
  if (numericValue !== undefined && Number.isNaN(Number(numericValue))) {
    return next(new AppError('Validation failed.', 400, ['numericValue must be a number when provided.']));
  }
  next();
};

const validateUpdateStandard = (req, res, next) => {
  const { name, displayName, numericValue, isActive } = req.body;
  if (name === undefined && displayName === undefined && numericValue === undefined && isActive === undefined) {
    return next(new AppError('Validation failed.', 400, ['At least one field (name, displayName, numericValue, isActive) is required.']));
  }
  if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
    return next(new AppError('Validation failed.', 400, ['name must be a non-empty string.']));
  }
  if (displayName !== undefined && (typeof displayName !== 'string' || !displayName.trim())) {
    return next(new AppError('Validation failed.', 400, ['displayName must be a non-empty string.']));
  }
  if (numericValue !== undefined && Number.isNaN(Number(numericValue))) {
    return next(new AppError('Validation failed.', 400, ['numericValue must be a number.']));
  }
  if (isActive !== undefined && typeof isActive !== 'boolean') {
    return next(new AppError('Validation failed.', 400, ['isActive must be boolean.']));
  }
  next();
};

module.exports = {
  validateCreateState,
  validateCreateCity,
  validateCreateCompany,
  validateCreateMealSize,
  validateCreateStandard,
  validateIdParam,
  validateUpdateState,
  validateUpdateCity,
  validateUpdateCompany,
  validateUpdateMealSize,
  validateUpdateStandard
};
