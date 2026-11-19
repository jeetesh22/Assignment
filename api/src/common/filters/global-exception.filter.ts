import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        exception instanceof Error ? exception.message : 'Unhandled exception',
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.path,
      message:
        status >= HttpStatus.INTERNAL_SERVER_ERROR &&
        status !== HttpStatus.SERVICE_UNAVAILABLE
          ? 'Internal server error'
          : this.getClientMessage(exception),
    });
  }

  private getClientMessage(exception: unknown): string | string[] {
    if (!(exception instanceof HttpException)) {
      return 'Request failed';
    }

    const body = exception.getResponse();
    if (typeof body === 'string') {
      return body;
    }

    if (isRecord(body)) {
      const message = body.message;
      if (typeof message === 'string') {
        return message;
      }
      if (
        Array.isArray(message) &&
        message.every((item): item is string => typeof item === 'string')
      ) {
        return message;
      }
    }

    return exception.message;
  }
}
