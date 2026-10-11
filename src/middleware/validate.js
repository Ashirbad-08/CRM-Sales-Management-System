/** validate({ params, query, body }) - parsed (coerced, stripped) values replace the originals. */
const validate = (schemas) => (req, res, next) => {
  try {
    for (const key of ['params', 'query', 'body']) {
      if (schemas[key]) req[key] = schemas[key].parse(req[key] === undefined ? {} : req[key]);
    }
    next();
  } catch (err) {
    next(err);
  }
};
module.exports = validate;
