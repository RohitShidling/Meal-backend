const AppError = require('../../common/utils/AppError');

const validateCreateState = (req, res, next) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return next(new AppError('name is required.', 400));
  }
  next();
};

const validateCreateCity = (req, res, next) => {
  const { name, stateId } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return next(new AppError('name is required.', 400));
  }
  if (!stateId || Number.isNaN(Number(stateId))) {
    return next(new AppError('stateId is required and must be a number.', 400));
  }
  next();
};

const validateCreateCompany = (req, res, next) => {
  const { name, cityId } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return next(new AppError('name is required.', 400));
  }
  if (cityId !== undefined && cityId !== null && Number.isNaN(Number(cityId))) {
    return next(new AppError('cityId must be a number when provided.', 400));
  }
  next();
};

const validateCreateMealSize = (req, res, next) => {
  const { name, displayName, sortOrder } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return next(new AppError('name is required.', 400));
  }
  if (!displayName || typeof displayName !== 'string' || !displayName.trim()) {
    return next(new AppError('displayName is required.', 400));
  }
  if (sortOrder !== undefined && Number.isNaN(Number(sortOrder))) {
    return next(new AppError('sortOrder must be a number when provided.', 400));
  }
  next();
};

const validateIdParam = (paramName) => (req, res, next) => {
  const value = req.params[paramName];
  if (!value || Number.isNaN(Number(value))) {
    return next(new AppError(`${paramName} must be a valid number.`, 400));
  }
  next();
};

const validateUpdateState = (req, res, next) => {
  const { name, isActive } = req.body;
  if (name === undefined && isActive === undefined) {
    return next(new AppError('At least one field (name or isActive) is required.', 400));
  }
  if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
    return next(new AppError('name must be a non-empty string.', 400));
  }
  if (isActive !== undefined && typeof isActive !== 'boolean') {
    return next(new AppError('isActive must be boolean.', 400));
  }
  next();
};

const validateUpdateCity = (req, res, next) => {
  const { name, stateId, isActive } = req.body;
  if (name === undefined && stateId === undefined && isActive === undefined) {
    return next(new AppError('At least one field (name, stateId, isActive) is required.', 400));
  }
  if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
    return next(new AppError('name must be a non-empty string.', 400));
  }
  if (stateId !== undefined && Number.isNaN(Number(stateId))) {
    return next(new AppError('stateId must be a number.', 400));
  }
  if (isActive !== undefined && typeof isActive !== 'boolean') {
    return next(new AppError('isActive must be boolean.', 400));
  }
  next();
};

const validateUpdateCompany = (req, res, next) => {
  const { name, cityId, isActive } = req.body;
  if (name === undefined && cityId === undefined && isActive === undefined) {
    return next(new AppError('At least one field (name, cityId, isActive) is required.', 400));
  }
  if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
    return next(new AppError('name must be a non-empty string.', 400));
  }
  if (cityId !== undefined && cityId !== null && Number.isNaN(Number(cityId))) {
    return next(new AppError('cityId must be a number when provided.', 400));
  }
  if (isActive !== undefined && typeof isActive !== 'boolean') {
    return next(new AppError('isActive must be boolean.', 400));
  }
  next();
};

const validateUpdateMealSize = (req, res, next) => {
  const { name, displayName, sortOrder, isActive } = req.body;
  if (name === undefined && displayName === undefined && sortOrder === undefined && isActive === undefined) {
    return next(new AppError('At least one field (name, displayName, sortOrder, isActive) is required.', 400));
  }
  if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
    return next(new AppError('name must be a non-empty string.', 400));
  }
  if (displayName !== undefined && (typeof displayName !== 'string' || !displayName.trim())) {
    return next(new AppError('displayName must be a non-empty string.', 400));
  }
  if (sortOrder !== undefined && Number.isNaN(Number(sortOrder))) {
    return next(new AppError('sortOrder must be a number.', 400));
  }
  if (isActive !== undefined && typeof isActive !== 'boolean') {
    return next(new AppError('isActive must be boolean.', 400));
  }
  next();
};

module.exports = {
  validateCreateState,
  validateCreateCity,
  validateCreateCompany,
  validateCreateMealSize,
  validateIdParam,
  validateUpdateState,
  validateUpdateCity,
  validateUpdateCompany,
  validateUpdateMealSize
};
