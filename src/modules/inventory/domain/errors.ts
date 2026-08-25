import {
  ConflictDomainError,
  NotFoundDomainError,
  ValidationDomainError,
} from '../../../shared/common/errors/domain.error';

export class InventoryNotFoundError extends NotFoundDomainError {
  constructor(id: number) {
    super(`Inventory record ${id} not found`);
  }
}

export class InsufficientStockError extends ConflictDomainError {
  constructor(available: number, requested: number) {
    super(`Insufficient stock: requested ${requested}, available ${available}`);
  }
}

export class InvalidReleaseError extends ConflictDomainError {
  constructor(reserved: number, requested: number) {
    super(`Cannot release ${requested}; only ${reserved} reserved`);
  }
}

export class InvalidStockOperationError extends ValidationDomainError {}
