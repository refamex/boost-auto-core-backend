import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { ArgumentMetadata } from '@nestjs/common';
import { CreateCustomerDto, UpdateCustomerDto } from './customer.dto';

/**
 * Guards the second door into `auth_customer_id`.
 *
 * `POST /v1/customers/:id/link` protects re-linking with `canLink()`, but
 * `UpdateCustomerDto` used to inherit the full `CreateCustomerDto` shape via
 * `PartialType`, and that shape declares `authCustomerId`. So a rep holding
 * `customers:write` could re-point an already-linked profile at another UUID
 * through `PATCH /v1/customers/:id`, which calls no guard — orphaning the
 * orders, quotes and billing joins. The doc-comment claimed the field was
 * excluded; inheritance said otherwise.
 *
 * These cases pin the DTO shape rather than the service, because the fix
 * lives in the pipe: the field has to be gone from the metatype so
 * `forbidNonWhitelisted` answers 400 before any handler runs.
 */
describe('UpdateCustomerDto — link-once cannot be smuggled through PATCH', () => {
  // Mirrors `main.ts` exactly. A divergence here would make these tests pass
  // against a pipe the application never uses.
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
  });

  const asBody = (metatype: unknown): ArgumentMetadata => ({
    type: 'body',
    metatype: metatype as ArgumentMetadata['metatype'],
  });

  const AUTH_CUSTOMER_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

  it('rejects authCustomerId on update', async () => {
    await expect(
      pipe.transform({ authCustomerId: AUTH_CUSTOMER_ID }, asBody(UpdateCustomerDto)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects authCustomerId even alongside fields that are legitimately editable', async () => {
    await expect(
      pipe.transform(
        { legalName: 'Refamex SA de CV', authCustomerId: AUTH_CUSTOMER_ID },
        asBody(UpdateCustomerDto),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects ownerSalesRepId on update, as it already did', async () => {
    // Control case: this one was never inherited, since `CreateCustomerDto`
    // does not declare it (D7). If it ever starts passing, the pipe config
    // drifted rather than this DTO.
    await expect(
      pipe.transform({ ownerSalesRepId: AUTH_CUSTOMER_ID }, asBody(UpdateCustomerDto)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('still accepts the fields an update is actually for', async () => {
    await expect(
      pipe.transform({ legalName: 'Refamex SA de CV', isActive: false }, asBody(UpdateCustomerDto)),
    ).resolves.toMatchObject({ legalName: 'Refamex SA de CV', isActive: false });
  });

  it('keeps authCustomerId accepted on create, which is where linking belongs', async () => {
    // `displayName` is the only required field, so it has to be present for
    // this to test the omission rather than a missing-field rejection.
    await expect(
      pipe.transform(
        { displayName: 'Refamex', authCustomerId: AUTH_CUSTOMER_ID },
        asBody(CreateCustomerDto),
      ),
    ).resolves.toMatchObject({ authCustomerId: AUTH_CUSTOMER_ID });
  });
});
