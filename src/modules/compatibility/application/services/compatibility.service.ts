import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { CompatibilityEntity } from '../../domain/entities/compatibility.entity';
import {
  CompatibilityQueryDto,
  CreateCompatibilityDto,
} from '../../infrastructure/http/dto/compatibility.dto';

@Injectable()
export class CompatibilityService {
  constructor(
    @InjectRepository(CompatibilityEntity)
    private readonly repo: Repository<CompatibilityEntity>,
    private readonly ds: DataSource,
  ) {}
  list(query: CompatibilityQueryDto) {
    const qb = this.repo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.product', 'product')
      .leftJoinAndSelect('c.assemblyPlant', 'plant')
      .leftJoinAndSelect('c.model', 'model')
      .leftJoinAndSelect('c.year', 'year')
      .leftJoinAndSelect('c.motorization', 'motor')
      .orderBy('product.sku', 'ASC')
      .addOrderBy('c.created_at', 'DESC');
    if (query.sku) qb.andWhere('product.sku=:sku', { sku: query.sku });
    if (query.modelCode)
      qb.andWhere('model.code_model=:modelCode', {
        modelCode: query.modelCode,
      });
    if (query.yearCode)
      qb.andWhere('year.code=:yearCode', { yearCode: query.yearCode });
    if (query.assemblyPlantCode)
      qb.andWhere('plant.code=:assemblyPlantCode', {
        assemblyPlantCode: query.assemblyPlantCode,
      });
    if (query.motorizationCode)
      qb.andWhere('motor.code=:motorizationCode', {
        motorizationCode: query.motorizationCode,
      });
    return qb.getMany();
  }
  async findById(id: string) {
    const found = await this.repo.findOne({
      where: { id },
      relations: {
        product: true,
        assemblyPlant: true,
        model: true,
        year: true,
        motorization: true,
      },
    });
    if (!found) throw new NotFoundException(`Compatibility ${id} not found`);
    return found;
  }
  async create(dto: CreateCompatibilityDto) {
    const values = await Promise.all([
      this.id('pim.product', 'sku', dto.sku),
      this.id('vehicles.assembly_plant', 'code', dto.assemblyPlantCode),
      this.id('vehicles.model_car', 'code_model', dto.modelCode),
      this.id('vehicles.year_car', 'code', dto.yearCode),
      this.id('vehicles.motorization_car', 'code', dto.motorizationCode),
    ]);
    try {
      return await this.repo.save(
        this.repo.create({
          productId: Number(values[0]),
          assemblyPlantId: values[1],
          modelId: values[2],
          yearId: Number(values[3]),
          motorizationId: values[4],
        }),
      );
    } catch (e) {
      if (
        e instanceof QueryFailedError &&
        (e as { code?: string }).code === '23505'
      )
        throw new ConflictException(
          'compatibility tuple already exists for this SKU',
        );
      throw e;
    }
  }
  private async id(table: string, column: string, value: string) {
    const rows = await this.ds.query<{ id: string }[]>(
      `SELECT id FROM ${table} WHERE ${column}=$1`,
      [value],
    );
    if (!rows[0])
      throw new NotFoundException(`${table} ${column}=${value} not found`);
    return String(rows[0].id);
  }
  async remove(id: string) {
    await this.repo.remove(await this.findById(id));
  }
}
