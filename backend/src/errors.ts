import { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodType, ZodTypeDef } from 'zod';

class AppError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
  }
}

type PgError = {
  code: string;
  constraint?: string;
};

function asPgError(err: unknown): PgError | null {
  if (!err || typeof err !== 'object' || !('code' in err)) {
    return null;
  }
  const code = (err as { code?: unknown }).code;
  if (typeof code !== 'string') {
    return null;
  }
  const constraint = (err as { constraint?: unknown }).constraint;
  return {
    code,
    constraint: typeof constraint === 'string' ? constraint : undefined,
  };
}

function mapPgError(err: unknown, operation?: string): AppError | null {
  const pgError = asPgError(err);
  if (!pgError) {
    return null;
  }

  if (pgError.code === '23505' && pgError.constraint === 'users_email_lower') {
    return new AppError(409, 'email_taken', 'An account with this email already exists');
  }

  if (pgError.code === '23505' && operation === 'purchase') {
    return new AppError(409, 'already_owned', 'You already own this item');
  }

  if (pgError.code === '23514') {
    return new AppError(402, 'insufficient_coins', 'Not enough coins');
  }

  if (pgError.code === '23503') {
    const constraint = pgError.constraint || '';
    if (constraint.includes('coin_pack')) {
      return new AppError(404, 'coin_pack_not_found', 'Coin pack not found');
    }
    if (constraint.includes('product')) {
      return new AppError(404, 'product_not_found', 'Product not found');
    }
    return new AppError(404, 'user_not_found', 'User not found');
  }

  return null;
}

function rethrow(err: unknown, operation?: string): never {
  if (err instanceof AppError) {
    throw err;
  }
  const mapped = mapPgError(err, operation);
  if (mapped) {
    throw mapped;
  }
  throw err;
}

function parse<Output>(schema: ZodType<Output, ZodTypeDef, any>, value: unknown): Output {
  const result = schema.safeParse(value);
  if (!result.success) {
    const message = result.error.issues.map((issue) => issue.message).join('; ');
    throw new AppError(400, 'validation_error', message);
  }
  return result.data;
}

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function isJsonParseError(err: unknown): err is SyntaxError & { status: number } {
  if (!(err instanceof SyntaxError) || !Object.prototype.hasOwnProperty.call(err, 'body')) {
    return false;
  }
  return (err as { status?: unknown }).status === 400;
}

function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (isJsonParseError(err)) {
    res.status(400).json({
      error: { code: 'validation_error', message: 'Invalid JSON body' },
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message },
    });
    return;
  }

  const mapped = mapPgError(err);
  if (mapped) {
    res.status(mapped.status).json({
      error: { code: mapped.code, message: mapped.message },
    });
    return;
  }

  console.error(err);
  res.status(500).json({
    error: { code: 'internal_error', message: 'Internal error' },
  });
}

export {
  AppError,
  mapPgError,
  rethrow,
  parse,
  asyncHandler,
  errorHandler,
};
