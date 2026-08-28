import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CategoryDepartmentService } from './category-department.service';
import { CategoryDepartmentEntity } from '../../domain/entities/category-department.entity';
import { NotFoundException } from '@nestjs/common';

describe('CategoryDepartmentService — Phase 6: Soft Delete', () => {
  let service: CategoryDepartmentService;

  /**
   * Held standalone rather than read back off a repository mock: asserting on
   * a method plucked off that mock passes an unbound method reference around,
   * which is what @typescript-eslint/unbound-method exists to catch.
   */
  const findOne = jest.fn();
  const save = jest.fn();
  const remove = jest.fn();

  const mockDepartment: CategoryDepartmentEntity = {
    id: 1,
    code: 'DEPT-001',
    departmentName: 'Test Department',
    categories: [],
    isActive: true,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    findOne.mockReset();
    save.mockReset();
    remove.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoryDepartmentService,
        {
          provide: getRepositoryToken(CategoryDepartmentEntity),
          useValue: {
            findOne,
            save,
            remove,
            findAndCount: jest.fn(),
            create: jest.fn(),
            merge: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<CategoryDepartmentService>(CategoryDepartmentService);
  });

  describe('remove', () => {
    it('should perform soft delete by setting isActive to false', async () => {
      // Arrange
      findOne.mockResolvedValue(mockDepartment);
      save.mockImplementation((entity: CategoryDepartmentEntity) =>
        Promise.resolve(entity),
      );

      // Act
      await service.remove(1);

      // Assert
      expect(findOne).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 1,
          isActive: false,
        }),
      );
      expect(remove).not.toHaveBeenCalled();
    });

    it('should preserve all other department properties during soft delete', async () => {
      // Arrange
      findOne.mockResolvedValue(mockDepartment);
      let savedEntity: CategoryDepartmentEntity | null = null;
      save.mockImplementation((entity: CategoryDepartmentEntity) => {
        savedEntity = entity;
        return Promise.resolve(entity);
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
      findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
      await expect(service.remove(999)).rejects.toThrow(
        'CategoryDepartment 999 not found',
      );
      expect(save).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
    });

    it('should handle soft delete of already inactive department', async () => {
      // Arrange
      const inactiveDepartment = { ...mockDepartment, isActive: false };
      findOne.mockResolvedValue(inactiveDepartment);
      save.mockImplementation((entity: CategoryDepartmentEntity) =>
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
  });
});
