import { Test, TestingModule } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CategoryDepartmentService } from './category-department.service';
import { CategoryDepartmentEntity } from '../../domain/entities/category-department.entity';
import { NotFoundException } from '@nestjs/common';

describe('CategoryDepartmentService — Phase 6: Soft Delete', () => {
  let service: CategoryDepartmentService;
  let repository: jest.Mocked<Repository<CategoryDepartmentEntity>>;

  const mockDepartment: CategoryDepartmentEntity = {
    id: 1,
    code: 'DEPT-001',
    departmentName: 'Test Department',
    categories: [],
    isActive: true,
    createdAt: new Date(),
  } as CategoryDepartmentEntity;

  beforeEach(async () => {
    const mockRepository = {
      findOne: jest.fn(),
      findAndCount: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
      create: jest.fn(),
      merge: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoryDepartmentService,
        {
          provide: getRepositoryToken(CategoryDepartmentEntity),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<CategoryDepartmentService>(CategoryDepartmentService);
    repository = module.get(getRepositoryToken(CategoryDepartmentEntity));
  });

  describe('remove', () => {
    it('should perform soft delete by setting isActive to false', async () => {
      // Arrange
      repository.findOne.mockResolvedValue(mockDepartment);
      repository.save.mockImplementation((entity) =>
        Promise.resolve(entity as CategoryDepartmentEntity),
      );

      // Act
      await service.remove(1);

      // Assert
      expect(repository.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 1,
          isActive: false,
        }),
      );
      expect(repository.remove).not.toHaveBeenCalled();
    });

    it('should preserve all other department properties during soft delete', async () => {
      // Arrange
      repository.findOne.mockResolvedValue(mockDepartment);
      let savedEntity: CategoryDepartmentEntity | null = null;
      repository.save.mockImplementation((entity) => {
        savedEntity = entity as CategoryDepartmentEntity;
        return Promise.resolve(entity as CategoryDepartmentEntity);
      });

      // Act
      await service.remove(1);

      // Assert
      expect(savedEntity).toMatchObject({
        id: 1,
        code: 'DEPT-001',
        departmentName: 'Test Department',
        isActive: false, // Only this should change
      });
    });

    it('should throw NotFoundException when department does not exist', async () => {
      // Arrange
      repository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
      await expect(service.remove(999)).rejects.toThrow(
        'CategoryDepartment 999 not found',
      );
      expect(repository.save).not.toHaveBeenCalled();
      expect(repository.remove).not.toHaveBeenCalled();
    });

    it('should handle soft delete of already inactive department', async () => {
      // Arrange
      const inactiveDepartment = { ...mockDepartment, isActive: false };
      repository.findOne.mockResolvedValue(inactiveDepartment);
      repository.save.mockImplementation((entity) =>
        Promise.resolve(entity as CategoryDepartmentEntity),
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
  });
});
