import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { AppError } from '../errors';

const uuidSchema = z.string().uuid();

function userId(req: Request, res: Response, next: NextFunction): void {
  const header = req.get('X-User-Id');
  if (header === undefined || header === '') {
    next(new AppError(400, 'missing_user_header', 'X-User-Id header is required'));
    return;
  }

  const parsed = uuidSchema.safeParse(header);
  if (!parsed.success) {
    next(new AppError(400, 'invalid_user_id', 'X-User-Id must be a UUID'));
    return;
  }

  req.userId = parsed.data;
  next();
}

export { userId };
