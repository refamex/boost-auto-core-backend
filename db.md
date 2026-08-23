CREATE TABLE pim.category_department (
  id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code            VARCHAR NOT NULL UNIQUE,
  department_name VARCHAR NOT NULL,
  is_active       BOOLEAN   DEFAULT TRUE,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE pim.category (
  id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name          TEXT    NOT NULL,
  description   TEXT,
  code          TEXT    NOT NULL UNIQUE,
  id_department INTEGER NOT NULL REFERENCES pim.category_department(id),
  image         TEXT,
  is_active     BOOLEAN   DEFAULT TRUE,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE pim.brand (
  id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       TEXT                     NOT NULL,
  brand_code TEXT UNIQUE,
  image      TEXT,
  is_active  BOOLEAN                  DEFAULT TRUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE pim.brand_category (
  id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  brand_code    TEXT REFERENCES pim.brand(brand_code) ON UPDATE CASCADE,
  category_code TEXT REFERENCES pim.category(code)    ON UPDATE CASCADE,
  is_active     BOOLEAN DEFAULT TRUE,
  UNIQUE(brand_code, category_code)
);

CREATE TABLE pim.category_complement (
  id                     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  category_index_id      INTEGER REFERENCES pim.category(id),
  category_complement_id INTEGER REFERENCES pim.category(id),
  created_at             TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  CHECK (category_index_id <> category_complement_id)
);

CREATE TABLE pim.volume_category (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  description TEXT,
  weight      DOUBLE PRECISION,
  height      DOUBLE PRECISION,   -- FIX: era "high"
  width       DOUBLE PRECISION,
  length      DOUBLE PRECISION,   -- FIX: era "long"
  created_at  DATE DEFAULT NOW() NOT NULL
);

CREATE TABLE pim.auto_part_catalog (
  id                 INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name               TEXT NOT NULL,
  code               TEXT UNIQUE,
  volume_category_id INTEGER REFERENCES pim.volume_category(id),
  category_id        INTEGER REFERENCES pim.category(id),
  is_activate        BOOLEAN DEFAULT TRUE,
  created_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- =====================================================
-- SCHEMA: suppliers
-- (debe existir antes de pim.product porque product.provider_id lo referencia)
-- =====================================================

CREATE TABLE suppliers.provider (
  id                INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name              TEXT,
  direction         TEXT,
  city              TEXT,
  state             TEXT,
  postal_code       VARCHAR,
  representative    TEXT,
  phone             TEXT,
  email             TEXT,
  inventory_reading TEXT,
  warranty          TEXT,
  code_identity     TEXT UNIQUE
);

CREATE TABLE suppliers.provider_branch (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider_id    BIGINT  NOT NULL REFERENCES suppliers.provider(id),
  branch_name    VARCHAR NOT NULL,
  contact_person VARCHAR,
  phone          VARCHAR NOT NULL,
  email          VARCHAR,
  address        TEXT    NOT NULL,
  city           VARCHAR NOT NULL,
  postal_code    VARCHAR NOT NULL,
  is_main_branch BOOLEAN DEFAULT FALSE NOT NULL,
  is_active      BOOLEAN DEFAULT TRUE  NOT NULL,
  notes          TEXT,
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- FIX: original tenía id como FK a brand (incorrecto) y brand_id como varchar.
CREATE TABLE suppliers.brand_provider (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  brand_id    INTEGER NOT NULL REFERENCES pim.brand(id)          ON DELETE CASCADE,
  provider_id BIGINT  NOT NULL REFERENCES suppliers.provider(id) ON DELETE CASCADE,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  UNIQUE(brand_id, provider_id)
);

-- =====================================================
-- SCHEMA: pim (product y dependientes)
-- =====================================================

CREATE TABLE pim.product (
  id                         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sku                        TEXT NOT NULL UNIQUE,   -- original no tenía UNIQUE; se agrega
  name                       TEXT,
  description                TEXT,
  category_id                BIGINT REFERENCES pim.category(id),
  brand_id                   BIGINT REFERENCES pim.brand(id) ON UPDATE CASCADE ON DELETE CASCADE,
  provider_id                BIGINT REFERENCES suppliers.provider(id),
  auto_part_type_id          BIGINT REFERENCES pim.auto_part_catalog(id),
  provider_sku               TEXT,
  classification_by_rotation TEXT,
  warranty_period            BIGINT,
  is_visible                 BOOLEAN DEFAULT TRUE,
  principal_image            TEXT,
  price                      DOUBLE PRECISION,
  created_at                 TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at                 TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE pim.product_color (
  id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_product INTEGER NOT NULL REFERENCES pim.product(id) ON DELETE CASCADE,
  name       TEXT,
  code       TEXT
);

CREATE TABLE pim.product_dimension (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_sku TEXT NOT NULL UNIQUE REFERENCES pim.product(sku) ON UPDATE CASCADE,
  length      DOUBLE PRECISION,
  width       DOUBLE PRECISION NOT NULL,
  height      DOUBLE PRECISION,
  weight      DOUBLE PRECISION
);

CREATE TABLE pim.products_image (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_sku TEXT REFERENCES pim.product(sku) ON UPDATE CASCADE,
  url         TEXT,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- FIX: id ahora tiene IDENTITY (antes BIGINT NOT NULL sin secuencia).
-- Nota: provider_sku se mantiene como texto plano — es el código del
-- proveedor en su propio sistema, sin tabla local que referenciar.
CREATE TABLE pim.product_cross_references (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_sku           TEXT NOT NULL
    REFERENCES pim.product(sku) ON UPDATE CASCADE ON DELETE CASCADE,
  product_brand         TEXT
    REFERENCES pim.brand(brand_code) ON UPDATE CASCADE ON DELETE SET NULL,
  reference_sku         TEXT
    REFERENCES pim.product(sku) ON UPDATE CASCADE ON DELETE SET NULL,
  reference_brand       TEXT
    REFERENCES pim.brand(brand_code) ON UPDATE CASCADE ON DELETE SET NULL,
  reference_product_sku TEXT
    REFERENCES pim.product(sku) ON UPDATE CASCADE ON DELETE SET NULL,
  provider_sku          TEXT,  -- código externo del proveedor, no FK
  created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- SCHEMA: vehicles
-- =====================================================

CREATE TABLE vehicles.assembly_plant (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code           TEXT UNIQUE,
  assembly_plant TEXT
);

CREATE TABLE vehicles.model_car (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code_model          TEXT UNIQUE,
  model_car           TEXT,
  code_assembly_plant TEXT REFERENCES vehicles.assembly_plant(code) ON UPDATE CASCADE,
  created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE vehicles.year_car (
  id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code       TEXT UNIQUE,
  year       TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE vehicles.motorization_car (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code         TEXT UNIQUE,
  motorization TEXT,
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE vehicles.model_car_motorization (
  id                INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  model_car_code    TEXT REFERENCES vehicles.model_car(code_model)  ON UPDATE CASCADE,
  motorization_code TEXT REFERENCES vehicles.motorization_car(code) ON UPDATE CASCADE,
  UNIQUE(model_car_code, motorization_code)
);

-- =====================================================
-- SCHEMA: compatibility
-- =====================================================

CREATE TABLE compatibility.compatibilities (
  id                  BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  sku                 TEXT NOT NULL
    REFERENCES pim.product(sku)              ON UPDATE CASCADE ON DELETE CASCADE,
  assembly_plant_code TEXT NOT NULL
    REFERENCES vehicles.assembly_plant(code) ON UPDATE CASCADE ON DELETE RESTRICT,
  model_code          TEXT NOT NULL
    REFERENCES vehicles.model_car(code_model) ON UPDATE CASCADE ON DELETE RESTRICT,
  year_code           TEXT NOT NULL
    REFERENCES vehicles.year_car(code)        ON UPDATE CASCADE ON DELETE RESTRICT,
  motorization_code   TEXT NOT NULL
    REFERENCES vehicles.motorization_car(code) ON UPDATE CASCADE ON DELETE RESTRICT,
  created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  UNIQUE(sku, assembly_plant_code, model_code, year_code, motorization_code)
);
-- Nota: se eliminaron las columnas desnormalizadas (assembly_plant, model,
-- year, motorization). Para mostrar los nombres legibles, hacer JOIN con
-- vehicles.assembly_plant / model_car / year_car / motorization_car.

-- =====================================================
-- SCHEMA: inventory
-- =====================================================

CREATE TABLE inventory.inventory (
  id                 SERIAL PRIMARY KEY,
  product_sku        TEXT    NOT NULL
    REFERENCES pim.product(sku) ON UPDATE CASCADE ON DELETE RESTRICT,
  provider_sku       TEXT    NOT NULL,  -- código externo del proveedor, no FK
  provider_branch_id BIGINT  NOT NULL REFERENCES suppliers.provider_branch(id),
  stock              INTEGER NOT NULL DEFAULT 0,
  reserved_stock     INTEGER          DEFAULT 0,
  updated_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(product_sku, provider_branch_id)
);

-- =====================================================
-- SCHEMA: commerce
-- =====================================================

CREATE TABLE commerce.price_lists (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          VARCHAR(50) UNIQUE NOT NULL,
  name          VARCHAR(255) NOT NULL,
  customer_type VARCHAR(50),
  currency      VARCHAR(10) DEFAULT 'MXN',
  is_default    BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW()
);

CREATE TABLE commerce.price_list_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  price_list_id UUID    NOT NULL REFERENCES commerce.price_lists(id) ON DELETE CASCADE,
  product_id    INTEGER NOT NULL REFERENCES pim.product(id),
  price         NUMERIC(14,2) NOT NULL,
  min_qty       INT DEFAULT 1,
  valid_from    DATE,
  valid_to      DATE,
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW(),
  UNIQUE(price_list_id, product_id, valid_from)
);

CREATE TABLE commerce.payment_methods (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code       VARCHAR(50) UNIQUE NOT NULL,
  name       VARCHAR(150) NOT NULL,
  provider   VARCHAR(150),
  is_active  BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- =====================================================
-- SCHEMA: orders
-- =====================================================

CREATE TABLE orders.orders (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number       VARCHAR(80) UNIQUE NOT NULL,
  customer_id        UUID NOT NULL,                                                  -- ref lógica → autoboost-auth
  sales_rep_id       UUID NULL,                                                      -- ref lógica → autoboost-auth
  provider_branch_id BIGINT NULL REFERENCES suppliers.provider_branch(id),
  status             VARCHAR(50) NOT NULL,
  payment_status     VARCHAR(50) DEFAULT 'pending',
  shipping_status    VARCHAR(50) DEFAULT 'pending',
  subtotal           NUMERIC(14,2) DEFAULT 0,
  discount_total     NUMERIC(14,2) DEFAULT 0,
  shipping_total     NUMERIC(14,2) DEFAULT 0,
  tax_total          NUMERIC(14,2) DEFAULT 0,
  grand_total        NUMERIC(14,2) DEFAULT 0,
  placed_at          TIMESTAMP DEFAULT NOW(),
  created_at         TIMESTAMP DEFAULT NOW(),
  updated_at         TIMESTAMP DEFAULT NOW()
);

CREATE TABLE orders.order_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            UUID    NOT NULL REFERENCES orders.orders(id) ON DELETE CASCADE,
  product_id          INTEGER NOT NULL REFERENCES pim.product(id),
  sku_snapshot        TEXT    NOT NULL,
  name_snapshot       TEXT    NOT NULL,
  qty                 NUMERIC(14,2) NOT NULL,
  unit_price_snapshot NUMERIC(14,2) NOT NULL,
  tax_snapshot        NUMERIC(14,2) DEFAULT 0,
  line_total          NUMERIC(14,2) NOT NULL,
  created_at          TIMESTAMP DEFAULT NOW()
);

CREATE TABLE orders.order_payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          UUID NOT NULL REFERENCES orders.orders(id) ON DELETE CASCADE,
  payment_method_id UUID REFERENCES commerce.payment_methods(id),
  provider          VARCHAR(150),
  amount            NUMERIC(14,2) NOT NULL,
  status            VARCHAR(50) NOT NULL,
  transaction_ref   VARCHAR(255),
  paid_at           TIMESTAMP NULL,
  created_at        TIMESTAMP DEFAULT NOW()
);

-- =====================================================
-- SCHEMA: sales
-- =====================================================

CREATE TABLE sales.sales (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_number    VARCHAR(80) UNIQUE NOT NULL,
  source_type    VARCHAR(50) NOT NULL,
  order_id       UUID NULL REFERENCES orders.orders(id),
  customer_id    UUID NOT NULL,    -- ref lógica → autoboost-auth
  employee_id    UUID NULL,        -- ref lógica → autoboost-auth
  subtotal       NUMERIC(14,2) DEFAULT 0,
  discount_total NUMERIC(14,2) DEFAULT 0,
  tax_total      NUMERIC(14,2) DEFAULT 0,
  grand_total    NUMERIC(14,2) DEFAULT 0,
  payment_status VARCHAR(50),
  sale_status    VARCHAR(50),
  sold_at        TIMESTAMP DEFAULT NOW(),
  created_at     TIMESTAMP DEFAULT NOW(),
  updated_at     TIMESTAMP DEFAULT NOW()
);

-- =====================================================
-- SCHEMA: billing
-- =====================================================

CREATE TABLE billing.invoices (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number VARCHAR(80) UNIQUE NOT NULL,
  order_id       UUID NULL REFERENCES orders.orders(id),
  sale_id        UUID NULL REFERENCES sales.sales(id),
  customer_id    UUID NOT NULL,    -- ref lógica → autoboost-auth
  rfc            VARCHAR(20),
  legal_name     VARCHAR(255),
  subtotal       NUMERIC(14,2) DEFAULT 0,
  tax_total      NUMERIC(14,2) DEFAULT 0,
  grand_total    NUMERIC(14,2) DEFAULT 0,
  currency       VARCHAR(10) DEFAULT 'MXN',
  sat_status     VARCHAR(50),
  issue_date     TIMESTAMP DEFAULT NOW(),
  created_at     TIMESTAMP DEFAULT NOW(),
  updated_at     TIMESTAMP DEFAULT NOW()
);

CREATE TABLE billing.invoice_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id    UUID NOT NULL REFERENCES billing.invoices(id) ON DELETE CASCADE,
  document_type VARCHAR(20) NOT NULL,
  file_url      TEXT NOT NULL,
  checksum      VARCHAR(255),
  created_at    TIMESTAMP DEFAULT NOW()
);

-- =====================================================
-- SCHEMA: integrations
-- =====================================================

CREATE TABLE integrations.api_clients (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(255) NOT NULL,
  api_key    VARCHAR(64)  NOT NULL UNIQUE,
  is_active  BOOLEAN                  DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE integrations.import_jobs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type          VARCHAR(100) NOT NULL,
  source_system     VARCHAR(150),
  status            VARCHAR(50) NOT NULL,
  started_at        TIMESTAMP,
  finished_at       TIMESTAMP,
  records_received  INT DEFAULT 0,
  records_processed INT DEFAULT 0,
  records_failed    INT DEFAULT 0,
  created_at        TIMESTAMP DEFAULT NOW()
);

CREATE TABLE integrations.import_job_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id       UUID NOT NULL REFERENCES integrations.import_jobs(id) ON DELETE CASCADE,
  level        VARCHAR(20),
  message      TEXT NOT NULL,
  payload_json JSONB,
  created_at   TIMESTAMP DEFAULT NOW()
);

-- =====================================================
-- SCHEMA: payments (Polar.sh)
-- =====================================================

CREATE TABLE payments.polar_checkouts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id           UUID NOT NULL REFERENCES orders.orders(id),
  polar_checkout_id  TEXT NOT NULL UNIQUE,
  polar_order_id     TEXT,
  status             VARCHAR(50) NOT NULL,
  checkout_url       TEXT NOT NULL,
  amount             NUMERIC(14,2) NOT NULL,
  currency           VARCHAR(10) NOT NULL DEFAULT 'MXN',
  created_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE payments.webhook_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  polar_event_id  TEXT NOT NULL UNIQUE,
  event_type      VARCHAR(100) NOT NULL,
  payload_json    JSONB NOT NULL,
  processed_at    TIMESTAMP WITH TIME ZONE,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);


-- =====================================================
-- SCHEMA: customers
-- Added by migration 1779738126227-AddCustomersSchema.ts
-- =====================================================

## `customers`

Added by `src/shared/database/migrations/1779738126227-AddCustomersSchema.ts`.

Commercial customer profile registry per sales rep, plus an address book per customer. Keyed by a
core-owned surrogate `id` — not the auth-issued customer id — so a rep can register a prospect before an
identity exists in `autoboost-backend-auth`.

### `customers.customer_profile`

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID PK` | Core-owned surrogate. |
| `auth_customer_id` | `UUID NULL` | The auth-issued id, once linked. No FK (cross-service). `NULL` = prospect, not yet linked. |
| `owner_sales_rep_id` | `UUID NULL` | Indexed. `NULL` = unassigned house account, visible only to `customers:admin`. |
| `display_name` | `VARCHAR(150) NOT NULL` | The only mandatory field on create. |
| `legal_name`, `rfc`, `customer_type`, `email`, `phone`, `notes` | nullable | Commercial fields; `rfc`/`legal_name` are re-captured on `billing.invoices` at invoice time, not sourced from here. |
| `is_active` | `BOOLEAN DEFAULT TRUE` | The only delete mechanism — hard delete is out of scope. |
| `created_at`, `updated_at` | `TIMESTAMPTZ` | `updated_at` via `utils.set_updated_at` trigger + `@UpdateDateColumn`. |

**Invariant**: two profiles cannot share the same non-null `auth_customer_id`. Enforced by a partial
unique index (`uq_customer_profile_auth_customer_id`, added in a follow-up migration alongside the
integration test that proves it) so many `NULL` prospects remain allowed. Linking is a compare-and-set
`UPDATE ... WHERE auth_customer_id IS NULL`; the pure guard lives in `customer-link.ts`.

### `customers.customer_branch`

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID PK` | |
| `customer_profile_id` | `UUID NOT NULL` | `REFERENCES customer_profile(id) ON DELETE CASCADE`. Indexed. |
| `branch_name`, `contact_person`, `phone`, `email`, `notes` | nullable | |
| `recipient_name`, `company`, `street1`, `postal_code`, `area_level1/2/3`, `country_code` | nullable (`country_code` defaults `MX`) | Mapped 1:1 onto `orders.orders`' `ship_to_*` snapshot shape, so a future order-creation flow can copy from a branch without transforming fields. |
| `is_main_branch` | `BOOLEAN DEFAULT FALSE` | |
| `is_active` | `BOOLEAN DEFAULT TRUE` | |
| `created_at`, `updated_at` | `TIMESTAMPTZ` | Same trigger + column-decorator pattern as `customer_profile`. |

**Invariant**: at most one `is_main_branch = TRUE` row per `customer_profile_id`. Enforced by a
transactional demote-then-promote (`CustomerBranchService`, copied in shape from
`ProviderBranchService.demoteOtherMainBranches`) plus a partial unique index
(`uq_customer_branch_main ... WHERE is_main_branch`) as the final arbiter under concurrency — added in
the same follow-up migration as the auth-id index above. Deleting the main branch is always rejected
(409), even when it is the customer's only branch.

### Visibility

Read/write access is derived only from the caller's JWT (`customers:admin` / `salesRepId`), never from
client-supplied filters — see `src/modules/customers/domain/customer-visibility.ts`. A rep sees only
profiles it owns; `customers:admin` sees everything, including unowned house accounts; anyone outside
scope gets an empty list or a 404 (never a 403, so existence is never confirmed to an outside caller).

---

*Note: this file did not exist before the `sales-rep-commercial-cycle` change. It documents only the
`customers` schema for now; earlier schemas (`pim`, `suppliers`, `inventory`, `orders`, `sales`,
`billing`, `commerce`, `payments`, `shipping`, `quotes`, `notifications`, `stock-sync`/`integrations`)
are not yet documented here — see their migrations under `src/shared/database/migrations/` and
`CLAUDE.md` for an architectural overview.*
