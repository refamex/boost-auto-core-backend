export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly httpStatus: number;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class NotFoundDomainError extends DomainError {
  readonly code = 'NOT_FOUND';
  readonly httpStatus = 404;
}

export class ConflictDomainError extends DomainError {
  readonly code = 'CONFLICT';
  readonly httpStatus = 409;
}

export class ValidationDomainError extends DomainError {
  readonly code = 'VALIDATION';
  readonly httpStatus = 422;
}
