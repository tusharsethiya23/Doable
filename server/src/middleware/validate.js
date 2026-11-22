// Validates req.body with a Zod schema; on success req.body is replaced by the cleaned data.
import { ApiError } from '../utils/ApiError.js';

export const validate = (schema) => (req, _res, next) => {
  const result = schema.safeParse(req.body ?? {});
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    throw new ApiError(400, details[0]?.message || 'Validation failed', details);
  }
  req.body = result.data;
  next();
};
