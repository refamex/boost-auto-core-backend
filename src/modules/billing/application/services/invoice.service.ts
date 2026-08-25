import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../shared/auth/jwt-payload.interface';
import { NotificationEmittedEvent } from '../../../notifications/domain/notification-emitted.event';
import { InvoiceDocumentEntity } from '../../domain/entities/invoice-document.entity';
import { InvoiceEntity } from '../../domain/entities/invoice.entity';
import { buildWhere } from '../../domain/invoice-visibility';
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
    private readonly events: EventEmitter2,
  ) {}

  async list(
    user: AuthenticatedUser,
    query: InvoiceQueryDto,
  ): Promise<InvoiceEntity[]> {
    const where = buildWhere(user, query);
    // `null` means the filter can never match anything this caller may see.
    // Empty page rather than 403: refusing would confirm the rows exist.
    if (!where) return [];

    return this.invoiceRepo.find({
      where,
      relations: ['documents', 'order', 'sale'],
      order: { issueDate: 'DESC' },
    });
  }

  findById(id: string, user: AuthenticatedUser): Promise<InvoiceEntity> {
    return this.loadVisible(id, user);
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
    const existing = await this.loadForWrite(id);
    return this.invoiceRepo.save(this.invoiceRepo.merge(existing, dto));
  }

  async remove(id: string): Promise<void> {
    const existing = await this.loadForWrite(id);
    await this.invoiceRepo.remove(existing);
  }

  async addDocument(
    invoiceId: string,
    dto: CreateInvoiceDocumentDto,
  ): Promise<InvoiceDocumentEntity> {
    const invoice = await this.loadForWrite(invoiceId);
    const document = await this.documentRepo.save(
      this.documentRepo.create({ invoiceId, ...dto }),
    );

    // Attaching the document, not creating the invoice, is the moment the
    // customer actually has something to download.
    const payload: NotificationEmittedEvent = {
      eventKey: 'invoice.available',
      recipientUserId: invoice.customerId,
      entityType: 'invoice',
      entityId: invoice.id,
      reference: invoice.invoiceNumber,
      // Invoices carry no contact column of their own, so the email channel
      // records this delivery as skipped. The in-app feed is unaffected.
    };
    this.events.emit(payload.eventKey, payload);

    return document;
  }

  async listDocuments(
    invoiceId: string,
    user: AuthenticatedUser,
  ): Promise<InvoiceDocumentEntity[]> {
    // Scoped on purpose: the documents ARE the invoice as far as a customer
    // is concerned, so this route needs the same predicate the invoice does.
    await this.loadVisible(invoiceId, user);
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

  /**
   * Read access: the caller only ever resolves an invoice their own
   * visibility predicate admits. 404 rather than 403, matching `list`'s
   * empty page — both refuse to confirm that a foreign invoice exists.
   */
  private async loadVisible(
    id: string,
    user: AuthenticatedUser,
  ): Promise<InvoiceEntity> {
    const scope = buildWhere(user, {});
    const found = scope
      ? await this.invoiceRepo.findOne({
          where: { ...scope, id },
          relations: ['documents', 'order', 'sale'],
        })
      : null;
    if (!found) throw new NotFoundException(`Invoice ${id} not found`);
    return found;
  }

  /**
   * Write access: unscoped, today's pre-existing behavior for the
   * `@Roles('billing:write')` staff routes (`update`, `remove`,
   * `addDocument`). Ownership-based write authorization is deliberately out
   * of scope for this change, exactly as it is for orders (D2).
   */
  private async loadForWrite(id: string): Promise<InvoiceEntity> {
    const found = await this.invoiceRepo.findOne({
      where: { id },
      relations: ['documents', 'order', 'sale'],
    });
    if (!found) throw new NotFoundException(`Invoice ${id} not found`);
    return found;
  }

  private generateInvoiceNumber(): string {
    return `INV-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  }
}
