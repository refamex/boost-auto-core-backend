import { Test, TestingModule } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CategoryService } from './category.service';
import { CategoryEntity } from '../../domain/entities/category.entity';
import { NotFoundException } from '@nestjs/common';

describe('CategoryService — Phase 6: Soft Delete', () => {
  let service: CategoryService;
  let repository: jest.Mocked<Repository<CategoryEntity>>;

  const mockCategory: CategoryEntity = {
    id: 1,
    code: 'CAT-001',
    name: 'Test Category',
    description: 'Test Description',
    idDepartment: 1,
    department: {} as any,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as CategoryEntity;

  beforeEach(async () => {
    const mockRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
      createQueryBuilder: jest.fn(),
      create: jest.fn(),
      merge: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoryService,
        {
          provide: getRepositoryToken(CategoryEntity),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<CategoryService>(CategoryService);
    repository = module.get(getRepositoryToken(CategoryEntity));
  });

  describe('remove', () => {
    it('should perform soft delete by setting isActive to false', async () => {
      // Arrange
      repository.findOne.mockResolvedValue(mockCategory);
      repository.save.mockImplementation((entity) =>
        Promise.resolve(entity as CategoryEntity),
      );

      // Act
      await service.remove(1);

      // Assert
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: 1 },
        relations: ['department'],
      });
      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 1,
          isActive: false,
        }),
      );
      expect(repository.remove).not.toHaveBeenCalled();
    });

    it('should preserve all other category properties during soft delete', async () => {
      // Arrange
      repository.findOne.mockResolvedValue(mockCategory);
      let savedEntity: CategoryEntity | null = null;
      repository.save.mockImplementation((entity) => {
        savedEntity = entity as CategoryEntity;
        return Promise.resolve(entity as CategoryEntity);
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
      repository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
      await expect(service.remove(999)).rejects.toThrow('Category 999 not found');
      expect(repository.save).not.toHaveBeenCalled();
      expect(repository.remove).not.toHaveBeenCalled();
    });

    it('should handle soft delete of already inactive category', async () => {
      // Arrange
      const inactiveCategory = { ...mockCategory, isActive: false };
      repository.findOne.mockResolvedValue(inactiveCategory);
      repository.save.mockImplementation((entity) =>
        Promise.resolve(entity as CategoryEntity),
      );

      // Act
      await service.remove(1);

      // Assert - should still work, setting isActive to false again
      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          isActive: false,
        }),
      );
    });

    it('should allow soft-deleted categories to be queried with isActive filter', async () => {
      // This test verifies that soft-deleted categories can still be found
      // when explicitly querying for inactive ones
      const inactiveCategory = { ...mockCategory, isActive: false };
      repository.findOne.mockResolvedValue(inactiveCategory);

      // Act
      const result = await service.findById(1);

      // Assert
      expect(result.isActive).toBe(false);
    });
  });
});
