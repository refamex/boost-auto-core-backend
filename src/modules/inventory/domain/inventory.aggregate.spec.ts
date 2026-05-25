import { Inventory } from './inventory.aggregate';
import {
  InsufficientStockError,
  InvalidReleaseError,
  InvalidStockOperationError,
} from './errors';

const makeInv = (stock = 10, reserved = 0) =>
  Inventory.fromSnapshot({
    id: 1,
    productSku: 'SKU-1',
    providerSku: 'PRV-1',
    providerBranchId: 1,
    stock,
    reservedStock: reserved,
  });

describe('Inventory aggregate', () => {
  describe('invariants on construction', () => {
    it('rejects negative stock', () => {
      expect(() => makeInv(-1, 0)).toThrow(InvalidStockOperationError);
    });
    it('rejects negative reserved', () => {
      expect(() => makeInv(5, -1)).toThrow(InvalidStockOperationError);
    });
    it('rejects reserved > stock', () => {
      expect(() => makeInv(3, 5)).toThrow(InvalidStockOperationError);
    });
  });

  describe('reserve', () => {
    it('reserves available stock', () => {
      const inv = makeInv(10, 0);
      inv.reserve(3);
      expect(inv.reservedStock).toBe(3);
      expect(inv.stock).toBe(10);
      expect(inv.available).toBe(7);
    });

    it('throws InsufficientStockError when over available', () => {
      const inv = makeInv(10, 8);
      expect(() => inv.reserve(3)).toThrow(InsufficientStockError);
    });

    it('rejects non-positive qty', () => {
      const inv = makeInv(10, 0);
      expect(() => inv.reserve(0)).toThrow(InvalidStockOperationError);
      expect(() => inv.reserve(-1)).toThrow(InvalidStockOperationError);
      expect(() => inv.reserve(1.5)).toThrow(InvalidStockOperationError);
    });
  });

  describe('release', () => {
    it('releases reserved stock', () => {
      const inv = makeInv(10, 5);
      inv.release(3);
      expect(inv.reservedStock).toBe(2);
    });
    it('throws InvalidReleaseError when over reserved', () => {
      const inv = makeInv(10, 2);
      expect(() => inv.release(3)).toThrow(InvalidReleaseError);
    });
  });

  describe('consumeReserved', () => {
    it('drops both stock and reserved', () => {
      const inv = makeInv(10, 5);
      inv.consumeReserved(3);
      expect(inv.stock).toBe(7);
      expect(inv.reservedStock).toBe(2);
    });
    it('rejects qty over reserved', () => {
      const inv = makeInv(10, 2);
      expect(() => inv.consumeReserved(3)).toThrow(InvalidReleaseError);
    });
  });

  describe('adjust', () => {
    it('applies positive delta', () => {
      const inv = makeInv(10, 0);
      inv.adjust(5);
      expect(inv.stock).toBe(15);
    });
    it('applies negative delta when stock allows', () => {
      const inv = makeInv(10, 0);
      inv.adjust(-5);
      expect(inv.stock).toBe(5);
    });
    it('rejects negative delta below zero', () => {
      const inv = makeInv(3, 0);
      expect(() => inv.adjust(-5)).toThrow(InsufficientStockError);
    });
    it('rejects negative delta that would drop stock below reserved', () => {
      const inv = makeInv(10, 8);
      expect(() => inv.adjust(-5)).toThrow(InsufficientStockError);
    });
    it('rejects non-integer delta', () => {
      const inv = makeInv(10, 0);
      expect(() => inv.adjust(1.5)).toThrow(InvalidStockOperationError);
    });
  });

  describe('restock', () => {
    it('increases stock', () => {
      const inv = makeInv(10, 5);
      inv.restock(7);
      expect(inv.stock).toBe(17);
      expect(inv.reservedStock).toBe(5);
    });
  });

  describe('snapshot roundtrip', () => {
    it('produces the same state', () => {
      const original = makeInv(10, 3);
      original.reserve(2);
      original.consumeReserved(1);
      const snap = original.toSnapshot();
      const restored = Inventory.fromSnapshot(snap);
      expect(restored.toSnapshot()).toEqual(snap);
    });
  });
});
