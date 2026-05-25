import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AutoPartCatalogEntity } from './domain/entities/auto-part-catalog.entity';
import { BrandCategoryEntity } from './domain/entities/brand-category.entity';
import { BrandEntity } from './domain/entities/brand.entity';
import { CategoryComplementEntity } from './domain/entities/category-complement.entity';
import { CategoryDepartmentEntity } from './domain/entities/category-department.entity';
import { CategoryEntity } from './domain/entities/category.entity';
import { ProductColorEntity } from './domain/entities/product-color.entity';
import { ProductCrossReferenceEntity } from './domain/entities/product-cross-reference.entity';
import { ProductDimensionEntity } from './domain/entities/product-dimension.entity';
import { ProductImageEntity } from './domain/entities/product-image.entity';
import { ProductEntity } from './domain/entities/product.entity';
import { VolumeCategoryEntity } from './domain/entities/volume-category.entity';
import { AutoPartService } from './application/services/auto-part.service';
import { BrandCategoryService } from './application/services/brand-category.service';
import { BrandService } from './application/services/brand.service';
import { CategoryComplementService } from './application/services/category-complement.service';
import { CategoryDepartmentService } from './application/services/category-department.service';
import { CategoryService } from './application/services/category.service';
import {
  ProductColorService,
  ProductCrossReferenceService,
  ProductDimensionService,
  ProductImageService,
} from './application/services/product-children.service';
import { ProductService } from './application/services/product.service';
import { AutoPartController } from './infrastructure/http/auto-part.controller';
import { BrandCategoryController } from './infrastructure/http/brand-category.controller';
import { BrandController } from './infrastructure/http/brand.controller';
import { CategoryComplementController } from './infrastructure/http/category-complement.controller';
import { CategoryDepartmentController } from './infrastructure/http/category-department.controller';
import { CategoryController } from './infrastructure/http/category.controller';
import { ProductController } from './infrastructure/http/product.controller';
import { VolumeCategoryController } from './infrastructure/http/volume-category.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CategoryDepartmentEntity,
      CategoryEntity,
      BrandEntity,
      BrandCategoryEntity,
      CategoryComplementEntity,
      VolumeCategoryEntity,
      AutoPartCatalogEntity,
      ProductEntity,
      ProductColorEntity,
      ProductDimensionEntity,
      ProductImageEntity,
      ProductCrossReferenceEntity,
    ]),
  ],
  providers: [
    CategoryDepartmentService,
    CategoryService,
    BrandService,
    BrandCategoryService,
    CategoryComplementService,
    VolumeCategoryService,
    AutoPartService,
    ProductService,
    ProductColorService,
    ProductImageService,
    ProductDimensionService,
    ProductCrossReferenceService,
  ],
  controllers: [
    CategoryDepartmentController,
    CategoryController,
    BrandController,
    BrandCategoryController,
    CategoryComplementController,
    VolumeCategoryController,
    AutoPartController,
    ProductController,
  ],
  exports: [ProductService, BrandService],
})
export class PimModule {}
