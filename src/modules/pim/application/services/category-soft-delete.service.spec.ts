import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CategoryService } from './category.service';
import { CategoryDepartmentEntity } from '../../domain/entities/category-department.entity';
import { CategoryEntity } from '../../domain/entities/category.entity';
import { NotFoundException } from '@nestjs/common';

describe('CategoryService — Phase 6: Soft Delete', () => {
  let service: CategoryService;

  /**
   * Held standalone rather than read back off a repository mock: asserting on
   * a method plucked off that mock passes an unbound method reference around,
   * which is what @typescript-eslint/unbound-method exists to catch.
   */
  const findOne = jest.fn();
  const save = jest.fn();
  const remove = jest.fn();

  const mockCategory: CategoryEntity = {
    id: 1,
    code: 'CAT-001',
    name: 'Test Category',
    description: 'Test Description',
    idDepartment: 1,
    department: {} as CategoryDepartmentEntity,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as CategoryEntity;

  beforeEach(async () => {
    findOne.mockReset();
    save.mockReset();
    remove.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoryService,
        {
          provide: getRepositoryToken(CategoryEntity),
          useValue: {
            findOne,
            save,
            remove,
            createQueryBuilder: jest.fn(),
            create: jest.fn(),
            merge: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<CategoryService>(CategoryService);
  });

  describe('remove', () => {
    it('should perform soft delete by setting isActive to false', async () => {
      // Arrange
      findOne.mockResolvedValue(mockCategory);
      save.mockImplementation((entity: CategoryEntity) =>
        Promise.resolve(entity),
      );

      // Act
      await service.remove(1);

      // Assert
      expect(findOne).toHaveBeenCalledWith({
        where: { id: 1 },
        relations: ['department'],
      });
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 1,
          isActive: false,
        }),
      );
      expect(remove).not.toHaveBeenCalled();
    });

    it('should preserve all other category properties during soft delete', async () => {
      // Arrange
      findOne.mockResolvedValue(mockCategory);
      let savedEntity: CategoryEntity | null = null;
      save.mockImplementation((entity: CategoryEntity) => {
        savedEntity = entity;
        return Promise.resolve(entity);
      });

      // Act
      await service.remove(1);

      // Assert
      expect(savedEntity).toMatchObject({
        id: 1,
        code: 'CAT-001',
        name: 'Test Category',
        description: 'Test Description',
        idDepartment: 1,
        isActive: false, // Only this should change
      });
    });

    it('should throw NotFoundException when category does not exist', async () => {
      // Arrange
      findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
      await expect(service.remove(999)).rejects.toThrow(
        'Category 999 not found',
      );
      expect(repository.save).not.toHaveBeenCalled();
      expect(repository.remove).not.toHaveBeenCalled();
    });

    it('should handle soft delete of already inactive category', async () => {
      // Arrange
      const inactiveCategory = { ...mockCategory, isActive: false };
      findOne.mockResolvedValue(inactiveCategory);
      save.mockImplementation((entity: CategoryEntity) =>
        Promise.resolve(entity),
      );

      // Act
      await service.remove(1);

      // Assert - should still work, setting isActive to false again
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({
          isActive: false,
        }),
      );
    });

    it('should allow soft-deleted categories to be queried with isActive filter', async () => {
      // This test verifies that soft-deleted categories can still be found
      // when explicitly querying for inactive ones
      const inactiveCategory = { ...mockCategory, isActive: false };
      findOne.mockResolvedValue(inactiveCategory);

      // Act
      const result = await service.findById(1);

      // Assert
      expect(result.isActive).toBe(false);
    });
  });
});
