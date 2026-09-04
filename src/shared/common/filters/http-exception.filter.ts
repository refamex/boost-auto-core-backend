import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { DomainError } from '../errors/domain.error';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      res
        .status(status)
        .json(
          typeof payload === 'string'
            ? { statusCode: status, message: payload }
            : payload,
        );
      return;
    }

    // A DomainError carries its own status and code. This filter is
    // registered alongside DomainExceptionFilter and `@Catch()` matches
    // everything, so without this branch the answer would depend on which
    // filter Nest happens to resolve first — and a deliberate 409 would
    // surface as a 500. Until now nothing threw one over HTTP, so the
    // disagreement never showed.
    if (exception instanceof DomainError) {
      this.logger.warn(`${exception.code}: ${exception.message}`);
      res.status(exception.httpStatus).json({
        statusCode: exception.httpStatus,
        code: exception.code,
        message: exception.message,
      });
      return;
    }

    const err = exception as Error;
    this.logger.error(
      `Unhandled error on ${req.method} ${req.url}: ${err?.message}`,
      err?.stack,
    );

    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
  }
}
