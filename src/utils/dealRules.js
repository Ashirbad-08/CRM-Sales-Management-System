const AppError = require('./AppError');

function assertClosingDate(date) {
  const min = new Date();
  min.setUTCHours(0, 0, 0, 0);
  const max = new Date();
  max.setUTCFullYear(max.getUTCFullYear() + 5);
  if (date < min) throw new AppError('Expected closing date cannot be in the past', 400);
  if (date > max) throw new AppError('Expected closing date cannot be more than 5 years in the future', 400);
}

module.exports = { assertClosingDate };
