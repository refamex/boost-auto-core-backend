import { getMetadataArgsStorage } from 'typeorm';
import { InventoryEntity } from '../../domain/entities/inventory.entity';
import { TypeOrmInventoryRepository } from './typeorm-inventory.repository';

describe('TypeOrmInventoryRepository', () => {
  it('does not map the removed inventory.provider_sku column', () => {
    const columnNames = getMetadataArgsStorage()
      .filterColumns(InventoryEntity)
      .map((column) => column.options.name ?? column.propertyName);

    expect(columnNames).not.toContain('provider_sku');
  });

  it('reads providerSku from the related product', async () => {
    const row = {
      id: 1,
      productId: 7,
      product: { id: 7, sku: 'SKU-7', providerSku: 'SUP-7' },
      providerBranchId: 3,
      stock: 8,
      reservedStock: 2,
      updatedAt: new Date('2026-08-25T12:00:00Z'),
    } as InventoryEntity;
    const qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([row]),
    };
    const dataSource = {
      getRepository: jest.fn().mockReturnValue({
        createQueryBuilder: jest.fn().mockReturnValue(qb),
      }),
    };
    const repository = new TypeOrmInventoryRepository(dataSource as never);

    await expect(repository.list({})).resolves.toEqual([
      expect.objectContaining({
        productSku: 'SKU-7',
        providerSku: 'SUP-7',
        available: 6,
      }),
    ]);
  });
});
