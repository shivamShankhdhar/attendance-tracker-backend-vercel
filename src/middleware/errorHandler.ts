import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export class AppError extends Error {
  public statusCode: number;
  public errorCode: string;
  public details?: any;

  constructor(message: string, statusCode: number = 400, errorCode: string = 'BAD_REQUEST', details?: any) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void {
  // Handle Zod validation errors
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request payload or parameters',
        details: err.flatten().fieldErrors,
      },
    });
    return;
  }

  // Handle custom AppError
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.errorCode,
        message: err.message,
        details: err.details,
      },
    });
    return;
  }

  // Handle Mongoose duplicate key error (E11000)
  if (err.code === 11000) {
    const keys = Object.keys(err.keyValue || {});
    res.status(409).json({
      success: false,
      error: {
        code: 'DUPLICATE_ENTRY',
        message: `An entry with this ${keys.join(', ')} already exists.`,
        details: err.keyValue,
      },
    });
    return;
  }

  // Handle Mongoose / BSON CastError (invalid ObjectId format)
  if (err.name === 'CastError' || err.name === 'BSONError' || err.name === 'BSONTypeError') {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_ID_FORMAT',
        message: 'Invalid resource ID format in request parameters or body.',
      },
    });
    return;
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    res.status(401).json({
      success: false,
      error: {
        code: err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN',
        message: err.message || 'Authentication token is invalid or expired.',
      },
    });
    return;
  }

  // Fallback internal server error
  console.error('[Unhandled Error]:', err);
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: process.env.NODE_ENV === 'production' ? 'An unexpected error occurred.' : err.message,
    },
  });
}
