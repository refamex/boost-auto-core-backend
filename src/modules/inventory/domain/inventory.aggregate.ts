import {
  InsufficientStockError,
  InvalidReleaseError,
  InvalidStockOperationError,
} from './errors';

export interface InventorySnapshot {
  id: number;
  productSku: string;
  providerSku: string;
  providerBranchId: number;
  stock: number;
  reservedStock: number;
}

/**
 * Invariantes:
 *  - stock >= 0
 *  - reservedStock >= 0
 *  - reservedStock <= stock (no se puede reservar más de lo disponible físicamente)
 */
export class Inventory {
  private constructor(
    public readonly id: number,
    public readonly productSku: string,
    public readonly providerSku: string,
    public readonly providerBranchId: number,
    private _stock: number,
    private _reservedStock: number,
  ) {
    this.assertInvariants();
  }

  static fromSnapshot(s: InventorySnapshot): Inventory {
    return new Inventory(
      s.id,
      s.productSku,
      s.providerSku,
      s.providerBranchId,
      s.stock,
      s.reservedStock,
    );
  }

  get stock(): number {
    return this._stock;
  }

  get reservedStock(): number {
    return this._reservedStock;
  }

  get available(): number {
    return this._stock - this._reservedStock;
  }

  reserve(qty: number): void {
    this.assertPositive(qty, 'reserve');
    if (qty > this.available) {
      throw new InsufficientStockError(this.available, qty);
    }
    this._reservedStock += qty;
    this.assertInvariants();
  }

  release(qty: number): void {
    this.assertPositive(qty, 'release');
    if (qty > this._reservedStock) {
      throw new InvalidReleaseError(this._reservedStock, qty);
    }
    this._reservedStock -= qty;
    this.assertInvariants();
  }

  /** Consume stock previously reserved (a sale was completed). */
  consumeReserved(qty: number): void {
    this.assertPositive(qty, 'consumeReserved');
    if (qty > this._reservedStock) {
      throw new InvalidReleaseError(this._reservedStock, qty);
    }
    this._reservedStock -= qty;
    this._stock -= qty;
    this.assertInvariants();
  }

  adjust(delta: number): void {
    if (!Number.isInteger(delta)) {
      throw new InvalidStockOperationError('adjust delta must be an integer');
    }
    const next = this._stock + delta;
    if (next < 0) {
      throw new InsufficientStockError(this._stock, Math.abs(delta));
    }
    if (next < this._reservedStock) {
      throw new InsufficientStockError(next, this._reservedStock);
    }
    this._stock = next;
    this.assertInvariants();
  }

  restock(qty: number): void {
    this.assertPositive(qty, 'restock');
    this._stock += qty;
    this.assertInvariants();
  }

  toSnapshot(): InventorySnapshot {
    return {
      id: this.id,
      productSku: this.productSku,
      providerSku: this.providerSku,
      providerBranchId: this.providerBranchId,
      stock: this._stock,
      reservedStock: this._reservedStock,
    };
  }

  private assertPositive(qty: number, op: string): void {
    if (!Number.isInteger(qty) || qty <= 0) {
      throw new InvalidStockOperationError(
        `${op} qty must be a positive integer`,
      );
    }
  }

  private assertInvariants(): void {
    if (this._stock < 0)
      throw new InvalidStockOperationError('stock must be >= 0');
    if (this._reservedStock < 0)
      throw new InvalidStockOperationError('reservedStock must be >= 0');
    if (this._reservedStock > this._stock) {
      throw new InvalidStockOperationError('reservedStock cannot exceed stock');
    }
  }
}
