import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, QueryFailedError, Repository } from 'typeorm';
import { InvoiceDocumentEntity } from '../../domain/entities/invoice-document.entity';
import { InvoiceEntity } from '../../domain/entities/invoice.entity';
import {
  CreateInvoiceDocumentDto,
  CreateInvoiceDto,
  InvoiceQueryDto,
  UpdateInvoiceDto,
} from '../../infrastructure/http/dto/billing.dto';

@Injectable()
export class InvoiceService {
  constructor(
    @InjectRepository(InvoiceEntity)
    private readonly invoiceRepo: Repository<InvoiceEntity>,
    @InjectRepository(InvoiceDocumentEntity)
    private readonly documentRepo: Repository<InvoiceDocumentEntity>,
  ) {}

  list(query: InvoiceQueryDto): Promise<InvoiceEntity[]> {
    const where: FindOptionsWhere<InvoiceEntity> = {};
    if (query.customerId) where.customerId = query.customerId;
    if (query.orderId) where.orderId = query.orderId;
    return this.invoiceRepo.find({
      where,
      relations: ['documents', 'order', 'sale'],
      order: { issueDate: 'DESC' },
    });
  }

  async findById(id: string): Promise<InvoiceEntity> {
    const found = await this.invoiceRepo.findOne({
      where: { id },
      relations: ['documents', 'order', 'sale'],
    });
    if (!found) throw new NotFoundException(`Invoice ${id} not found`);
    return found;
  }

  async create(dto: CreateInvoiceDto): Promise<InvoiceEntity> {
    const subtotal = dto.subtotal ?? 0;
    const taxTotal = dto.taxTotal ?? 0;
    const grandTotal = dto.grandTotal ?? subtotal + taxTotal;

    try {
      return await this.invoiceRepo.save(
        this.invoiceRepo.create({
          ...dto,
          invoiceNumber: this.generateInvoiceNumber(),
          subtotal,
          taxTotal,
          grandTotal,
        }),
      );
    } catch (e) {
      if (
        e instanceof QueryFailedError &&
        (e as { code?: string }).code === '23505'
      ) {
        throw new ConflictException('invoice number conflict');
      }
      throw e;
    }
  }

  async update(id: string, dto: UpdateInvoiceDto): Promise<InvoiceEntity> {
    const existing = await this.findById(id);
    return this.invoiceRepo.save(this.invoiceRepo.merge(existing, dto));
  }

  async remove(id: string): Promise<void> {
    const existing = await this.findById(id);
    await this.invoiceRepo.remove(existing);
  }

  async addDocument(
    invoiceId: string,
    dto: CreateInvoiceDocumentDto,
  ): Promise<InvoiceDocumentEntity> {
    await this.findById(invoiceId);
    return this.documentRepo.save(
      this.documentRepo.create({ invoiceId, ...dto }),
    );
  }

  async listDocuments(invoiceId: string): Promise<InvoiceDocumentEntity[]> {
    await this.findById(invoiceId);
    return this.documentRepo.find({
      where: { invoiceId },
      order: { createdAt: 'DESC' },
    });
  }

  async removeDocument(documentId: string): Promise<void> {
    const doc = await this.documentRepo.findOne({ where: { id: documentId } });
    if (!doc)
      throw new NotFoundException(`InvoiceDocument ${documentId} not found`);
    await this.documentRepo.remove(doc);
  }

  private generateInvoiceNumber(): string {
    return `INV-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  }
}
