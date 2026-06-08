const { z } = require('zod');

/**
 * Generic Zod schema validation middleware factory.
 * Usage: router.post('/', validate(MySchema), handler)
 *
 * @param {z.ZodSchema} schema - Zod schema to validate req.body against
 */
function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: result.error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      });
    }
    req.validatedBody = result.data;
    next();
  };
}

/**
 * Validate query params against a Zod schema.
 */
function validateQuery(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return res.status(400).json({
        error: 'Invalid query parameters',
        details: result.error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      });
    }
    req.validatedQuery = result.data;
    next();
  };
}

module.exports = { validate, validateQuery };
