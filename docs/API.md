# Autoboost Core — Referencia completa de la API

> Servicio de catálogo automotriz: **PIM + Suppliers + Inventory + Vehicles + Compatibility + Commerce + Orders + Sales + Billing + Integrations + Payments (Polar.sh) + Shipping (Skydropx)**.
> Stack: **NestJS 11 + TypeORM + PostgreSQL**. Versionado URI, Swagger en `/docs`.
> Este documento describe **cada endpoint** implementado hoy, con su request, response, auth y errores.

---

## Tabla de contenidos

1. [Generalidades](#1-generalidades)
2. [Autenticación y roles](#2-autenticación-y-roles)
3. [Convenciones: paginación, errores, IDs](#3-convenciones-paginación-errores-ids)
4. [Health](#4-health)
5. [PIM — Departments](#5-pim--departments)
6. [PIM — Categories](#6-pim--categories)
7. [PIM — Brands](#7-pim--brands)
8. [PIM — AutoParts](#8-pim--autoparts)
9. [PIM — Volume Categories](#9-pim--volume-categories)
10. [PIM — Brand�↔Category](#10-pim--brandcategory)
11. [PIM — Category Complements](#11-pim--category-complements)
12. [PIM — Products](#12-pim--products)
13. [PIM — Product sub-recursos (colors, images, dimensions, cross-refs)](#13-pim--product-sub-recursos)
14. [Suppliers — Providers y Branches](#14-suppliers--providers-y-branches)
15. [Suppliers — Brand�↔Provider](#15-suppliers--brandprovider)
16. [Inventory](#16-inventory)
17. [Vehicles](#17-vehicles)
18. [Compatibility](#18-compatibility)
19. [Commerce](#19-commerce)
20. [Orders](#20-orders)
21. [Sales](#21-sales)
22. [Billing](#22-billing)
23. [Integrations](#23-integrations)
24. [Payments — Polar.sh](#24-payments--polarsh)
25. [Shipping — Skydropx](#25-shipping--skydropx)
26. [Modelo de datos (campos)](#26-modelo-de-datos-campos)
27. [Catálogo de errores](#27-catálogo-de-errores)

---

## 1. Generalidades

| Item | Valor |
|------|-------|
| Base URL (dev) | `http://localhost:3000` |
| Puerto | `PORT` (default `3000`) |
| Versionado | URI, prefijo `/v1` en todas las rutas de negocio |
| Excepción al versionado | `/health` (sin `/v1`) |
| Swagger UI | `GET /docs` |
| Content-Type | `application/json` |
| Validación | `ValidationPipe` global: `whitelist`, `forbidNonWhitelisted`, `transform`. Campos no declarados en el DTO → **400**. |
| CORS | habilitado |
| Seguridad HTTP | Helmet |
| Trazabilidad | header `x-request-id` en cada respuesta (se respeta el entrante o se genera uno) |

> **Nota de notación:** abajo, los paths se muestran con el prefijo `/v1`. La columna **Auth** indica `@Public` (sin token), `Bearer` (token válido, cualquier rol) o un rol concreto (`pim:write`, etc.).

---

## 2. Autenticación y roles

Todas las rutas requieren JWT **salvo** que estén marcadas `@Public()` (sólo `/health`). El guard `JwtAuthGuard` es global.

Los tokens los emite el servicio externo `autoboost-backend-auth` (RS256/JWKS). Este servicio sólo **valida**. Claims esperados: `sub` (UUID), `email`, `roles[]`, `iss=autoboost-auth`, `aud=autoboost-core`.

> Guía de integración (front + deploy): [AUTH-CONSUMER.md](./AUTH-CONSUMER.md). Detalle del auth: [INTEGRATION.md](./INTEGRATION.md), [RS256-JWKS.md](./RS256-JWKS.md).

### Integración front → auth → core

1. Login en auth: `POST /api/auth/login` → `accessToken` (RS256, TTL ~15m).
2. Llamadas al core: `Authorization: Bearer <accessToken>` (no reenviar secretos del auth al core).
3. Core en producción: `JWT_MODE=jwks` y `JWT_JWKS_URL=https://<host-auth>/.well-known/jwks.json` (**sin** prefijo `/api`).
4. Refresh al expirar: `POST /api/auth/refresh` en auth con `{ refreshToken }`.

**No uses** en el core `JWT_ACCESS_SECRET` ni otros secretos simétricos del auth (modelo HS256 obsoleto).

### Modos (`JWT_MODE`)

| Modo | Comportamiento |
|------|----------------|
| `mock` (dev) | No valida firma. Lee identidad de headers: `X-User-Id` (requerido) y `X-Roles` (CSV, p. ej. `pim:write,inventory:read,orders:write`). Sin `X-User-Id` → **401**. |
| `jwks` | Valida RS256 contra `JWT_JWKS_URL`, más `iss` y `aud`. |
| `static` | Valida contra `JWT_PUBLIC_KEY` (PEM). |

### Variables JWT en core

| Variable | Req si | Descripción |
|----------|--------|-------------|
| `JWT_MODE` | — | `mock` (default), `jwks` (prod), `static` |
| `JWT_JWKS_URL` | `mode=jwks` | URL completa al JWKS del auth (raíz del host) |
| `JWT_PUBLIC_KEY` | `mode=static` | PEM público; en `jwks` **no** definir en Railway |
| `JWT_ISSUER` | — | default `autoboost-auth` (debe coincidir con auth) |
| `JWT_AUDIENCE` | — | default `autoboost-core` (debe estar en `aud` del token) |

Ejemplo producción:

```env
JWT_MODE=jwks
JWT_JWKS_URL=https://boost-auto-auth-backend-production.up.railway.app/.well-known/jwks.json
JWT_ISSUER=autoboost-auth
JWT_AUDIENCE=autoboost-core
```

### Roles de auth vs permisos del core

El JWT de auth incluye `roles[]` con códigos de **identidad** (`customer`, `admin`, `hr`, …). Los endpoints de este servicio exigen permisos **`module:action`** (tabla siguiente), validados literalmente por `RolesGuard`.

Un token válido con solo `customer` puede pasar autenticación pero recibir **403** en rutas con `@Roles('orders:write')`, etc. En `JWT_MODE=mock`, envía en `X-Roles` los permisos de core (p. ej. `pim:write,orders:write`).

### Roles usados (permisos HTTP en core)

| Rol | Habilita |
|-----|----------|
| `pim:write` | Crear/editar/borrar en todo PIM |
| `suppliers:write` | Crear/editar/borrar en Suppliers |
| `inventory:read` | Leer inventario |
| `inventory:write` | Crear filas de inventario, reserve / release / adjust |
| `vehicles:write` | Crear/editar/borrar taxonomía vehicular |
| `compatibility:write` | Crear/borrar compatibilidades SKU↔vehículo |
| `commerce:write` | Listas de precio, ítems y métodos de pago |
| `orders:write` | Órdenes, confirmación/cancelación, pagos |
| `sales:write` | Ventas |
| `billing:write` | Facturas y documentos |
| `integrations:write` | API clients e import jobs |
| `payments:write` | Crear checkout Polar para una orden |
| `shipping:read` | Consultar envío/tracking |
| `shipping:write` | Cotizar, crear y cancelar envío |

Las lecturas de PIM, Suppliers, Vehicles, Compatibility, Commerce, Orders, Sales, Billing, Integrations, Payments y Shipping (excepto webhooks) requieren token pero **no** un rol específico (salvo Inventory y Shipping, que sí exigen sus roles `inventory:*` y `shipping:*`). Si falta el rol exigido → **403**.

### Variables de entorno Polar (opcional)

| Variable | Req si `POLAR_ENABLED=true` | Descripción |
|----------|----------------------------|-------------|
| `POLAR_ENABLED` | — | `true` activa checkout + webhook |
| `POLAR_ACCESS_TOKEN` | sí | Organization Access Token |
| `POLAR_WEBHOOK_SECRET` | sí | Secreto del endpoint en Polar Dashboard |
| `POLAR_SERVER` | no | `sandbox` (default) o `production` |
| `POLAR_PRODUCT_ID` | sí | Product ID del catálogo Polar (precio dinámico por orden) |
| `POLAR_SUCCESS_URL` | sí | Redirect tras pago exitoso |
| `POLAR_CANCEL_URL` | sí | URL de retorno / cancelación |
| `POLAR_CURRENCY` | no | default `mxn` |

### Variables de entorno Skydropx (opcional)

| Variable | Req si `SKYDROPX_ENABLED=true` | Descripción |
|----------|-------------------------------|-------------|
| `SKYDROPX_ENABLED` | — | `true` activa cotización, creación/cancelación y webhook |
| `SKYDROPX_CLIENT_ID` | sí | OAuth2 client id |
| `SKYDROPX_CLIENT_SECRET` | sí | OAuth2 client secret |
| `SKYDROPX_SERVER` | no | `sandbox` (default) o `production` |
| `SKYDROPX_WEBHOOK_SECRET` | sí | Secreto para validar firma HMAC del webhook |
| `SKYDROPX_ORIGIN_NAME` | sí | Nombre remitente (origen) |
| `SKYDROPX_ORIGIN_COMPANY` | no | Empresa remitente |
| `SKYDROPX_ORIGIN_STREET1` | sí | Calle y número origen |
| `SKYDROPX_ORIGIN_POSTAL_CODE` | sí | Código postal origen |
| `SKYDROPX_ORIGIN_AREA_LEVEL1` | sí | Estado/provincia origen |
| `SKYDROPX_ORIGIN_AREA_LEVEL2` | sí | Ciudad/municipio origen |
| `SKYDROPX_ORIGIN_AREA_LEVEL3` | no | Colonia/zona origen |
| `SKYDROPX_ORIGIN_COUNTRY_CODE` | no | default `MX` |
| `SKYDROPX_ORIGIN_PHONE` | sí | Teléfono remitente |
| `SKYDROPX_ORIGIN_EMAIL` | no | Email remitente |

### Ejemplo (modo mock)

```bash
curl -X POST http://localhost:3000/v1/brands \
  -H 'Content-Type: application/json' \
  -H 'X-User-Id: dev-1' -H 'X-Roles: pim:write' \
  -d '{"name":"Bosch","brandCode":"BOSCH"}'
```

### Ejemplo (modo jwks, token del auth)

```bash
AUTH=https://boost-auto-auth-backend-production.up.railway.app
TOKEN=$(curl -s -X POST "$AUTH/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"user@example.com","password":"..."}' | jq -r .accessToken)

curl http://localhost:3000/v1/products \
  -H "Authorization: Bearer $TOKEN"
```

### Auth — errores frecuentes

| Síntoma | Causa | Acción |
|---------|-------|--------|
| `Missing X-User-Id` | Core en `mock`, front usa Bearer | `JWT_MODE=jwks` en core |
| Boot `JWT_PUBLIC_KEY` vacío | Variable vacía en PaaS | Eliminar variable; usar `jwks` |
| `401` en core, OK en `/auth/me` | `iss`/`aud` o JWKS incorrecto | Alinear env; verificar URL JWKS |
| `403` con JWT válido | Rol auth ≠ permiso core | Ver [AUTH-CONSUMER.md](./AUTH-CONSUMER.md) § roles |

---

## 3. Convenciones: paginación, errores, IDs

### Paginación

Sólo `GET /v1/products` pagina. Query params:

| Param | Tipo | Default | Límite |
|-------|------|---------|--------|
| `page` | int ≥ 1 | `1` | — |
| `limit` | int ≥ 1 | `25` | `200` |

Respuesta:

```json
{
  "items": [ /* ... */ ],
  "total": 134,
  "page": 1,
  "limit": 25,
  "pages": 6
}
```

El resto de los listados devuelven un **array plano** (sin envoltorio de paginación).

### Formato de error

Errores de dominio (filtro `DomainExceptionFilter`):

```json
{ "statusCode": 409, "code": "CONFLICT", "message": "..." }
```

Errores de validación / HTTP estándar (Nest):

```json
{ "statusCode": 400, "message": ["sku should not be empty"], "error": "Bad Request" }
```

Ver el [catálogo completo](#27-catálogo-de-errores).

### IDs

- PIM `department/category/brand/autopart/volume/product/color`: enteros.
- `products_image`, `cross_references`, `provider_branch`, `brand_provider`, `category_complement`: BIGINT (viajan como string en JSON, número en queries).
- `inventory.id`: entero (SERIAL).
- Vehicles `assembly_plant`, `model_car`, `motorization_car`: BIGINT (string en JSON).
- Vehicles `year_car`, `model_car_motorization`: entero.
- Commerce, Orders, Sales, Billing, Integrations (jobs/logs/docs): **UUID** (string).
- `integrations.api_clients.id`: entero (SERIAL).
- Productos exponen acceso por `id` **y** por `sku` (único).

---

## 4. Health

| Método | Path | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/health` | `@Public` | Ping a la DB vía Terminus |

**200**:

```json
{ "status": "ok", "info": { "database": { "status": "up" } }, "error": {}, "details": { "database": { "status": "up" } } }
```

DB caída → **503**.

---

## 5. PIM — Departments

Recurso: `pim.category_department`. Base: `/v1/departments`.

| Método | Path | Auth | Body / Params |
|--------|------|------|---------------|
| GET | `/v1/departments` | Bearer | — (lista ordenada por `code`) |
| GET | `/v1/departments/:id` | Bearer | `id` int |
| POST | `/v1/departments` | `pim:write` | `CreateCategoryDepartmentDto` |
| PATCH | `/v1/departments/:id` | `pim:write` | `UpdateCategoryDepartmentDto` (parcial) |
| DELETE | `/v1/departments/:id` | `pim:write` | → **204** |

**CreateCategoryDepartmentDto:**

| Campo | Tipo | Req | Notas |
|-------|------|-----|-------|
| `code` | string | sí | único |
| `departmentName` | string | sí | |
| `isActive` | boolean | no | default `true` |

---

## 6. PIM — Categories

Recurso: `pim.category`. Base: `/v1/categories`.

| Método | Path | Auth | Body / Params |
|--------|------|------|---------------|
| GET | `/v1/categories` | Bearer | filtros query (abajo) |
| GET | `/v1/categories/:id` | Bearer | `id` int (incluye `department`) |
| POST | `/v1/categories` | `pim:write` | `CreateCategoryDto` |
| PATCH | `/v1/categories/:id` | `pim:write` | parcial |
| DELETE | `/v1/categories/:id` | `pim:write` | → **204** |

**Query (`CategoryQueryDto`):** `departmentCode?`, `brandCode?` (join contra `brand_category`), `isActive?`.

**CreateCategoryDto:**

| Campo | Tipo | Req | Notas |
|-------|------|-----|-------|
| `name` | string | sí | |
| `description` | string | no | |
| `code` | string | sí | único |
| `idDepartment` | int | sí | FK → department |
| `image` | string | no | |
| `isActive` | boolean | no | default `true` |

---

## 7. PIM — Brands

Recurso: `pim.brand`. Base: `/v1/brands`.

| Método | Path | Auth | Body / Params |
|--------|------|------|---------------|
| GET | `/v1/brands` | Bearer | lista ordenada por `name` |
| GET | `/v1/brands/:id` | Bearer | `id` int |
| GET | `/v1/brands/by-code/:code` | Bearer | `brand_code` único |
| POST | `/v1/brands` | `pim:write` | `CreateBrandDto` |
| PATCH | `/v1/brands/:id` | `pim:write` | parcial |
| DELETE | `/v1/brands/:id` | `pim:write` | → **204** |

**CreateBrandDto:** `name` (string, req), `brandCode?` (único), `image?`, `isActive?` (default `true`).

---

## 8. PIM — AutoParts

Recurso: `pim.auto_part_catalog`. Base: `/v1/autoparts`.

| Método | Path | Auth | Body / Params |
|--------|------|------|---------------|
| GET | `/v1/autoparts` | Bearer | incluye `category` y `volumeCategory` |
| GET | `/v1/autoparts/:id` | Bearer | `id` int |
| POST | `/v1/autoparts` | `pim:write` | `CreateAutoPartDto` |
| PATCH | `/v1/autoparts/:id` | `pim:write` | parcial |
| DELETE | `/v1/autoparts/:id` | `pim:write` | → **204** |

**CreateAutoPartDto:** `name` (req), `code?` (único), `volumeCategoryId?` (int), `categoryId?` (int), `isActive?` (default `true`, mapea a la columna `is_activate`).

---

## 9. PIM — Volume Categories

Recurso: `pim.volume_category`. Base: `/v1/volume-categories`.

| Método | Path | Auth | Body / Params |
|--------|------|------|---------------|
| GET | `/v1/volume-categories` | Bearer | ordenado por `code` |
| GET | `/v1/volume-categories/:id` | Bearer | `id` int |
| POST | `/v1/volume-categories` | `pim:write` | `CreateVolumeCategoryDto` |
| PATCH | `/v1/volume-categories/:id` | `pim:write` | parcial |
| DELETE | `/v1/volume-categories/:id` | `pim:write` | → **204** |

**CreateVolumeCategoryDto:** `code` (req, único), `description?`, `weight?`, `height?`, `width?`, `length?` (todos number).

---

## 10. PIM — Brand↔Category

Recurso: `pim.brand_category` (relación marca↔categoría por código). Base: `/v1/brand-categories`.

| Método | Path | Auth | Body / Params |
|--------|------|------|---------------|
| GET | `/v1/brand-categories` | Bearer | query: `brandCode?`, `categoryCode?` |
| POST | `/v1/brand-categories` | `pim:write` | `CreateBrandCategoryDto` |
| DELETE | `/v1/brand-categories/:id` | `pim:write` | → **204** |

**CreateBrandCategoryDto:** `brandCode` (req), `categoryCode` (req), `isActive?`. Par duplicado → **409 CONFLICT**.

---

## 11. PIM — Category Complements

Recurso: `pim.category_complement` (categorías complementarias). Base: `/v1/category-complements`.

| Método | Path | Auth | Body / Params |
|--------|------|------|---------------|
| GET | `/v1/category-complements` | Bearer | query: `categoryIndexId?` |
| POST | `/v1/category-complements` | `pim:write` | `CreateCategoryComplementDto` |
| DELETE | `/v1/category-complements/:id` | `pim:write` | `id` BIGINT → **204** |

**CreateCategoryComplementDto:** `categoryIndexId` (int, req), `categoryComplementId` (int, req). Si son iguales → **400**.

---

## 12. PIM — Products

Recurso: `pim.product`. Base: `/v1/products`.

| Método | Path | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/v1/products` | Bearer | **búsqueda paginada** con filtros |
| GET | `/v1/products/:id` | Bearer | por id (incluye brand/category/autoPartType/provider) |
| GET | `/v1/products/by-sku/:sku` | Bearer | por SKU (mismas relaciones) |
| POST | `/v1/products` | `pim:write` | `CreateProductDto` |
| PATCH | `/v1/products/:id` | `pim:write` | parcial |
| DELETE | `/v1/products/:id` | `pim:write` | → **204** |

**Query de búsqueda (`ProductQueryDto`, extiende paginación):**

| Param | Tipo | Filtro |
|-------|------|--------|
| `q` | string | `ILIKE` sobre `sku` o `name` |
| `brandId` | int | exacto |
| `categoryId` | int | exacto |
| `autoPartTypeId` | int | exacto |
| `providerId` | int | exacto |
| `isVisible` | boolean | exacto (ver gotcha de booleanos) |
| `page`, `limit` | int | paginación |

> La búsqueda usa QueryBuilder y pega contra los índices `idx_product_filter_*`. Resultado en envoltorio paginado.

**CreateProductDto:**

| Campo | Tipo | Req | Notas |
|-------|------|-----|-------|
| `sku` | string | sí | único |
| `name` | string | no | |
| `description` | string | no | |
| `categoryId` | int | no | FK |
| `brandId` | int | no | FK |
| `providerId` | int | no | FK → suppliers.provider |
| `autoPartTypeId` | int | no | FK → auto_part_catalog |
| `providerSku` | string | no | |
| `classificationByRotation` | string | no | |
| `warrantyPeriod` | int | no | |
| `isVisible` | boolean | no | default `true` |
| `principalImage` | string | no | |
| `price` | number | no | |

---

## 13. PIM — Product sub-recursos

Todos cuelgan de products. Lectura con Bearer; escritura con `pim:write`.

### Colors (`pim.product_color`, por `id` de producto)

| Método | Path | Auth | Body |
|--------|------|------|------|
| GET | `/v1/products/:id/colors` | Bearer | — |
| POST | `/v1/products/:id/colors` | `pim:write` | `{ name?, code? }` |
| DELETE | `/v1/products/colors/:colorId` | `pim:write` | → **204** |

### Images (`pim.products_image`, por **SKU**)

| Método | Path | Auth | Body |
|--------|------|------|------|
| GET | `/v1/products/by-sku/:sku/images` | Bearer | — (orden desc por `createdAt`) |
| POST | `/v1/products/by-sku/:sku/images` | `pim:write` | `{ url }` (req, URL) |
| DELETE | `/v1/products/images/:imageId` | `pim:write` | `imageId` BIGINT → **204** |

### Dimensions (`pim.product_dimension`, 1:1 por SKU)

| Método | Path | Auth | Body |
|--------|------|------|------|
| GET | `/v1/products/by-sku/:sku/dimensions` | Bearer | — |
| POST | `/v1/products/by-sku/:sku/dimensions` | `pim:write` | `UpsertProductDimensionDto` (upsert) |

**UpsertProductDimensionDto:** `width` (number, req), `length?`, `height?`, `weight?`. Es **upsert**: si ya existe la dimensión del SKU, la actualiza.

### Cross-references (`pim.product_cross_references`, por SKU)

| Método | Path | Auth | Body |
|--------|------|------|------|
| GET | `/v1/products/by-sku/:sku/cross-references` | Bearer | — |
| POST | `/v1/products/by-sku/:sku/cross-references` | `pim:write` | `CreateCrossReferenceDto` |
| DELETE | `/v1/products/cross-references/:refId` | `pim:write` | `refId` BIGINT → **204** |

**CreateCrossReferenceDto:** `productBrand?`, `referenceSku?`, `referenceBrand?`, `referenceProductSku?`, `providerSku?` (todos string). Si `referenceProductSku === sku` → **409**.

---

## 14. Suppliers — Providers y Branches

Recursos: `suppliers.provider`, `suppliers.provider_branch`. Base: `/v1/providers`.

| Método | Path | Auth | Body / Params |
|--------|------|------|---------------|
| GET | `/v1/providers` | Bearer | ordenado por `name` |
| GET | `/v1/providers/:id` | Bearer | `id` int |
| POST | `/v1/providers` | `suppliers:write` | `CreateProviderDto` |
| PATCH | `/v1/providers/:id` | `suppliers:write` | parcial |
| DELETE | `/v1/providers/:id` | `suppliers:write` | → **204** |
| GET | `/v1/providers/:id/branches` | Bearer | sucursales del provider |
| POST | `/v1/providers/:id/branches` | `suppliers:write` | `CreateProviderBranchDto` |
| PATCH | `/v1/providers/branches/:branchId` | `suppliers:write` | parcial (`branchId` BIGINT) |
| DELETE | `/v1/providers/branches/:branchId` | `suppliers:write` | → **204** |

**CreateProviderDto** (todos opcionales): `name`, `direction`, `city`, `state`, `postalCode`, `representative`, `phone`, `email` (formato email), `inventoryReading`, `warranty`, `codeIdentity` (único).

**CreateProviderBranchDto:**

| Campo | Tipo | Req |
|-------|------|-----|
| `branchName` | string | sí |
| `phone` | string | sí |
| `address` | string | sí |
| `city` | string | sí |
| `postalCode` | string | sí |
| `contactPerson` | string | no |
| `email` | string (email) | no |
| `isMainBranch` | boolean | no (default `false`) |
| `isActive` | boolean | no (default `true`) |
| `notes` | string | no |

> **Regla de negocio:** crear/actualizar una branch con `isMainBranch: true` **degrada** a las demás del mismo provider (sólo una main, en transacción). **Borrar la main branch → 409** (promové otra primero).

---

## 15. Suppliers — Brand↔Provider

Recurso: `suppliers.brand_provider`. Rutas (controller sin prefijo de path propio):

| Método | Path | Auth | Body / Params |
|--------|------|------|---------------|
| GET | `/v1/brands/:brandId/providers` | Bearer | providers de una marca (incluye `provider`) |
| GET | `/v1/providers/:providerId/brands` | Bearer | marcas de un provider (incluye `brand`) |
| POST | `/v1/brand-providers` | `suppliers:write` | `CreateBrandProviderDto` |
| DELETE | `/v1/brand-providers/:id` | `suppliers:write` | `id` BIGINT → **204** |

**CreateBrandProviderDto:** `brandId` (int, req), `providerId` (int, req). Par duplicado → **409**.

---

## 16. Inventory

Recurso: `inventory.inventory` (único por `product_sku` + `provider_branch_id`). Base: `/v1/inventory`. **Todo requiere rol de inventory.**

| Método | Path | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/v1/inventory` | `inventory:read` | lista filtrable |
| GET | `/v1/inventory/by-sku/:sku` | `inventory:read` | **resumen agregado** del SKU entre branches |
| GET | `/v1/inventory/:id` | `inventory:read` | detalle de una fila |
| POST | `/v1/inventory` | `inventory:write` | **crear** fila `(productSku, providerBranchId)` |
| POST | `/v1/inventory/:id/reserve` | `inventory:write` | reservar stock |
| POST | `/v1/inventory/:id/release` | `inventory:write` | liberar reserva |
| POST | `/v1/inventory/:id/adjust` | `inventory:write` | ajustar stock físico |

### `GET /v1/inventory` — query (`InventoryQueryDto`)

| Param | Tipo | Filtro |
|-------|------|--------|
| `sku` | string | exacto (`product_sku`) |
| `branchId` | int | exacto (`provider_branch_id`) |
| `lowStockThreshold` | int ≥ 0 | `(stock - reserved) <= threshold` |

Item de respuesta:

```json
{
  "id": 12,
  "productSku": "SKU-1",
  "providerSku": "PRV-1",
  "providerBranchId": 3,
  "stock": 10,
  "reservedStock": 3,
  "available": 7,
  "updatedAt": "2026-05-24T..."
}
```

### `GET /v1/inventory/by-sku/:sku` — resumen

```json
{
  "productSku": "SKU-1",
  "totalStock": 25,
  "totalReserved": 5,
  "totalAvailable": 20,
  "branches": 3
}
```

### `POST /v1/inventory` — alta (bootstrap)

**CreateInventoryDto:**

| Campo | Tipo | Req | Notas |
|-------|------|-----|-------|
| `productSku` | string | sí | FK → `pim.product(sku)` |
| `providerSku` | string | sí | código externo del proveedor |
| `providerBranchId` | int | sí | FK → `suppliers.provider_branch` |
| `stock` | int ≥ 0 | no | default `0` |
| `reservedStock` | int ≥ 0 | no | default `0` |

Par `(productSku, providerBranchId)` duplicado → **409 CONFLICT**. Debe existir la fila antes de `reserve`/`adjust` si no se creó por este endpoint.

### Mutaciones (reserve / release / adjust)

Las tres operan sobre el aggregate `Inventory` dentro de una **transacción con `SELECT ... FOR UPDATE`** (lock pesimista) — son seguras ante concurrencia.

| Endpoint | Body | Invariante / error |
|----------|------|---------------------|
| `POST /:id/reserve` | `{ "qty": 3 }` (int ≥ 1) | `qty <= available`; si no → **409 InsufficientStockError** |
| `POST /:id/release` | `{ "qty": 3 }` (int ≥ 1) | `qty <= reservedStock`; si no → **409 InvalidReleaseError** |
| `POST /:id/adjust` | `{ "delta": -5, "reason": "merma" }` | `delta` int (±); resultado no puede bajar de 0 ni por debajo de `reserved` → **409** |

`id` inexistente → **404 NOT_FOUND**. `qty`/`delta` inválidos (no entero, ≤ 0 donde corresponde) → **422 VALIDATION** o **400** (según validación DTO vs dominio).

Respuesta de las mutaciones:

```json
{ "id": 12, "productSku": "SKU-1", "providerBranchId": 3, "stock": 10, "reservedStock": 3, "available": 7 }
```

`adjust` registra en log el `reason` y el `actorId` (del claim `sub`).

> **Órdenes:** `POST /v1/orders/:id/confirm` reserva stock in-process vía `ReserveStockUseCase` (no HTTP). `InventoryModule` exporta también `INVENTORY_REPOSITORY` para otros consumidores.

---

## 17. Vehicles

Taxonomía vehicular (`vehicles.*`). Lectura con Bearer; escritura con `vehicles:write`.

### Assembly plants (`vehicles.assembly_plant`)

Base: `/v1/assembly-plants`.

| Método | Path | Auth | Body / Params |
|--------|------|------|---------------|
| GET | `/v1/assembly-plants` | Bearer | ordenado por `code` |
| GET | `/v1/assembly-plants/by-code/:code` | Bearer | por `code` |
| GET | `/v1/assembly-plants/:id` | Bearer | `id` BIGINT |
| POST | `/v1/assembly-plants` | `vehicles:write` | `CreateAssemblyPlantDto` |
| PATCH | `/v1/assembly-plants/:id` | `vehicles:write` | parcial |
| DELETE | `/v1/assembly-plants/:id` | `vehicles:write` | → **204** |

**CreateAssemblyPlantDto:** `code?`, `assemblyPlant?` (todos string).

### Model cars (`vehicles.model_car`)

Base: `/v1/model-cars`.

| Método | Path | Auth | Body / Params |
|--------|------|------|---------------|
| GET | `/v1/model-cars` | Bearer | query: `codeAssemblyPlant?` |
| GET | `/v1/model-cars/by-code/:code` | Bearer | `code_model` |
| GET | `/v1/model-cars/:id` | Bearer | `id` BIGINT (incluye `assemblyPlant`) |
| POST | `/v1/model-cars` | `vehicles:write` | `CreateModelCarDto` |
| PATCH | `/v1/model-cars/:id` | `vehicles:write` | parcial |
| DELETE | `/v1/model-cars/:id` | `vehicles:write` | → **204** |

**CreateModelCarDto:** `codeModel?`, `modelCar?`, `codeAssemblyPlant?` (FK por código a `assembly_plant`).

### Year cars (`vehicles.year_car`)

Base: `/v1/year-cars`.

| Método | Path | Auth | Body / Params |
|--------|------|------|---------------|
| GET | `/v1/year-cars` | Bearer | ordenado por `code` |
| GET | `/v1/year-cars/by-code/:code` | Bearer | |
| GET | `/v1/year-cars/:id` | Bearer | `id` int |
| POST | `/v1/year-cars` | `vehicles:write` | `CreateYearCarDto` |
| PATCH | `/v1/year-cars/:id` | `vehicles:write` | parcial |
| DELETE | `/v1/year-cars/:id` | `vehicles:write` | → **204** |

**CreateYearCarDto:** `code?`, `year?`.

### Motorizations (`vehicles.motorization_car`)

Base: `/v1/motorizations`.

| Método | Path | Auth | Body / Params |
|--------|------|------|---------------|
| GET | `/v1/motorizations` | Bearer | ordenado por `code` |
| GET | `/v1/motorizations/by-code/:code` | Bearer | |
| GET | `/v1/motorizations/:id` | Bearer | `id` BIGINT |
| POST | `/v1/motorizations` | `vehicles:write` | `CreateMotorizationCarDto` |
| PATCH | `/v1/motorizations/:id` | `vehicles:write` | parcial |
| DELETE | `/v1/motorizations/:id` | `vehicles:write` | → **204** |

**CreateMotorizationCarDto:** `code?`, `motorization?`.

### Model ↔ Motorization (`vehicles.model_car_motorization`)

Base: `/v1/model-car-motorizations` (tabla puente).

| Método | Path | Auth | Body / Params |
|--------|------|------|---------------|
| GET | `/v1/model-car-motorizations` | Bearer | query: `modelCarCode?`, `motorizationCode?` |
| POST | `/v1/model-car-motorizations` | `vehicles:write` | `CreateModelCarMotorizationDto` |
| DELETE | `/v1/model-car-motorizations/:id` | `vehicles:write` | `id` int → **204** |

**CreateModelCarMotorizationDto:** `modelCarCode` (req), `motorizationCode` (req). Par duplicado → **409**.

---

## 18. Compatibility

Recurso: `compatibility.compatibilities` (SKU + códigos de vehículo). Base: `/v1/compatibilities`.

| Método | Path | Auth | Body / Params |
|--------|------|------|---------------|
| GET | `/v1/compatibilities` | Bearer | query: `sku?`, `modelCode?`, `yearCode?`, `assemblyPlantCode?`, `motorizationCode?` |
| GET | `/v1/compatibilities/:id` | Bearer | `id` BIGINT |
| POST | `/v1/compatibilities` | `compatibility:write` | `CreateCompatibilityDto` |
| DELETE | `/v1/compatibilities/:id` | `compatibility:write` | → **204** |

**CreateCompatibilityDto:**

| Campo | Tipo | Req | FK |
|-------|------|-----|-----|
| `sku` | string | sí | `pim.product(sku)` |
| `assemblyPlantCode` | string | sí | `vehicles.assembly_plant(code)` |
| `modelCode` | string | sí | `vehicles.model_car(code_model)` |
| `yearCode` | string | sí | `vehicles.year_car(code)` |
| `motorizationCode` | string | sí | `vehicles.motorization_car(code)` |

Tupla `(sku, assemblyPlantCode, modelCode, yearCode, motorizationCode)` duplicada → **409**.

---

## 19. Commerce

### Price lists (`commerce.price_lists`, `commerce.price_list_items`)

Base: `/v1/price-lists`.

| Método | Path | Auth | Body / Params |
|--------|------|------|---------------|
| GET | `/v1/price-lists` | Bearer | ordenado por `code` |
| GET | `/v1/price-lists/:id` | Bearer | UUID |
| POST | `/v1/price-lists` | `commerce:write` | `CreatePriceListDto` |
| PATCH | `/v1/price-lists/:id` | `commerce:write` | parcial |
| DELETE | `/v1/price-lists/:id` | `commerce:write` | → **204** |
| GET | `/v1/price-lists/:id/items` | Bearer | ítems (incluye `product`) |
| POST | `/v1/price-lists/:id/items` | `commerce:write` | `CreatePriceListItemDto` |
| PATCH | `/v1/price-lists/items/:itemId` | `commerce:write` | parcial |
| DELETE | `/v1/price-lists/items/:itemId` | `commerce:write` | → **204** |

**CreatePriceListDto:** `code` (req, único), `name` (req), `customerType?`, `currency?` (default `MXN`), `isDefault?`.

**CreatePriceListItemDto:** `productId` (int, req), `price` (number ≥ 0, req), `minQty?` (default 1), `validFrom?`, `validTo?` (date ISO). Uniq `(priceListId, productId, validFrom)` → **409**.

### Payment methods (`commerce.payment_methods`)

Base: `/v1/payment-methods`.

| Método | Path | Auth | Body / Params |
|--------|------|------|---------------|
| GET | `/v1/payment-methods` | Bearer | ordenado por `code` |
| GET | `/v1/payment-methods/:id` | Bearer | UUID |
| POST | `/v1/payment-methods` | `commerce:write` | `CreatePaymentMethodDto` |
| PATCH | `/v1/payment-methods/:id` | `commerce:write` | parcial |
| DELETE | `/v1/payment-methods/:id` | `commerce:write` | → **204** |

**CreatePaymentMethodDto:** `code` (req, único), `name` (req), `provider?`, `isActive?` (default `true`).

---

## 20. Orders

Recursos: `orders.orders`, `orders.order_items`, `orders.order_payments`. Base: `/v1/orders`.

`customerId` y `salesRepId` son UUID de referencia lógica al servicio `autoboost-backend-auth` (sin FK en esta DB).

| Método | Path | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/v1/orders` | Bearer | lista (query abajo) |
| GET | `/v1/orders/:id` | Bearer | detalle con `items`, `payments`, `providerBranch` |
| POST | `/v1/orders` | `orders:write` | crear orden + líneas |
| PATCH | `/v1/orders/:id` | `orders:write` | actualizar estados |
| POST | `/v1/orders/:id/confirm` | `orders:write` | confirmar y **reservar stock** |
| POST | `/v1/orders/:id/cancel` | `orders:write` | cancelar y **liberar reservas** si estaba confirmada |
| POST | `/v1/orders/:id/payments` | `orders:write` | registrar pago |

**Query (`OrderQueryDto`):** `customerId?` (UUID), `status?`.

**CreateOrderDto:**

| Campo | Tipo | Req | Notas |
|-------|------|-----|-------|
| `customerId` | UUID | sí | ref lógica → auth |
| `salesRepId` | UUID | no | ref lógica → auth |
| `providerBranchId` | int | no | requerido para reservar stock al confirmar |
| `status` | string | no | default `draft`; si es `confirmed` al crear, reserva de inmediato |
| `items` | array | sí | ver abajo |

**CreateOrderItemDto (cada ítem):** `productId` (int), `qty` (number > 0), `unitPrice` (≥ 0), `tax?` (default 0). El servicio rellena `skuSnapshot` y `nameSnapshot` desde el producto y calcula `subtotal`, `taxTotal`, `grandTotal`.

**UpdateOrderDto:** `status?`, `paymentStatus?`, `shippingStatus?`.

**CreateOrderPaymentDto:** `paymentMethodId?` (UUID), `provider?`, `amount` (req), `status` (req), `transactionRef?`.

### Confirmación y stock

- `POST .../confirm`: pasa `status` a `confirmed` y, por cada línea, busca inventario `(skuSnapshot, providerBranchId)` y ejecuta `reserve` con `ceil(qty)`.
- Requiere `providerBranchId` en la orden; si falta inventario para un SKU → **404**.
- Orden ya confirmada → **409**. Orden cancelada → **409** al confirmar.

### Cancelación

- `POST .../cancel`: si estaba `confirmed`, libera reservas; luego `status = cancelled`.
- Ya cancelada → **409**.

`orderNumber` se genera automáticamente (`ORD-{timestamp}-{suffix}`).

---

## 21. Sales

Recurso: `sales.sales`. Base: `/v1/sales`.

| Método | Path | Auth | Body / Params |
|--------|------|------|---------------|
| GET | `/v1/sales` | Bearer | query: `customerId?`, `orderId?` |
| GET | `/v1/sales/:id` | Bearer | UUID (incluye `order` si hay) |
| POST | `/v1/sales` | `sales:write` | `CreateSaleDto` |
| PATCH | `/v1/sales/:id` | `sales:write` | parcial |
| DELETE | `/v1/sales/:id` | `sales:write` | → **204** |

**CreateSaleDto:**

| Campo | Tipo | Req | Notas |
|-------|------|-----|-------|
| `sourceType` | string | sí | p. ej. `ecommerce`, `pos` |
| `orderId` | UUID | no | FK opcional → `orders.orders` |
| `customerId` | UUID | sí | ref lógica → auth |
| `employeeId` | UUID | no | ref lógica → auth |
| `subtotal`, `discountTotal`, `taxTotal`, `grandTotal` | number | no | default 0; si omites `grandTotal`, se calcula |
| `paymentStatus`, `saleStatus` | string | no | |

`saleNumber` se genera automáticamente (`SALE-...`).

---

## 22. Billing

Recursos: `billing.invoices`, `billing.invoice_documents`. Base: `/v1/invoices`.

| Método | Path | Auth | Body / Params |
|--------|------|------|---------------|
| GET | `/v1/invoices` | Bearer | query: `customerId?`, `orderId?` |
| GET | `/v1/invoices/:id` | Bearer | UUID (incluye `documents`, `order`, `sale`) |
| POST | `/v1/invoices` | `billing:write` | `CreateInvoiceDto` |
| PATCH | `/v1/invoices/:id` | `billing:write` | parcial |
| DELETE | `/v1/invoices/:id` | `billing:write` | → **204** |
| GET | `/v1/invoices/:id/documents` | Bearer | documentos de la factura |
| POST | `/v1/invoices/:id/documents` | `billing:write` | `CreateInvoiceDocumentDto` |
| DELETE | `/v1/invoices/documents/:documentId` | `billing:write` | → **204** |

**CreateInvoiceDto:** `orderId?`, `saleId?`, `customerId` (req), `rfc?`, `legalName?`, `subtotal?`, `taxTotal?`, `grandTotal?`, `currency?` (default `MXN`), `satStatus?`.

**CreateInvoiceDocumentDto:** `documentType` (req, p. ej. `pdf`, `xml`), `fileUrl` (req), `checksum?`.

`invoiceNumber` se genera automáticamente (`INV-...`).

---

## 23. Integrations

### API clients (`integrations.api_clients`)

Base: `/v1/api-clients`.

| Método | Path | Auth | Body / Params |
|--------|------|------|---------------|
| GET | `/v1/api-clients` | Bearer | ordenado por `name` |
| GET | `/v1/api-clients/:id` | Bearer | `id` int |
| POST | `/v1/api-clients` | `integrations:write` | `CreateApiClientDto` |
| PATCH | `/v1/api-clients/:id` | `integrations:write` | parcial |
| DELETE | `/v1/api-clients/:id` | `integrations:write` | → **204** |

**CreateApiClientDto:** `name` (req), `isActive?` (default `true`). El `apiKey` (64 chars) se **genera en el servidor** al crear; no se envía en el body.

### Import jobs (`integrations.import_jobs`, `integrations.import_job_logs`)

Base: `/v1/import-jobs`.

| Método | Path | Auth | Body / Params |
|--------|------|------|---------------|
| GET | `/v1/import-jobs` | Bearer | query: `status?`, `jobType?` |
| GET | `/v1/import-jobs/:id` | Bearer | UUID (incluye `logs`) |
| POST | `/v1/import-jobs` | `integrations:write` | `CreateImportJobDto` |
| PATCH | `/v1/import-jobs/:id` | `integrations:write` | `UpdateImportJobDto` |
| DELETE | `/v1/import-jobs/:id` | `integrations:write` | → **204** |
| GET | `/v1/import-jobs/:id/logs` | Bearer | logs del job |
| POST | `/v1/import-jobs/:id/logs` | `integrations:write` | `CreateImportJobLogDto` |

**CreateImportJobDto:** `jobType` (req), `sourceSystem?`, `status` (req).

**UpdateImportJobDto:** `status?`, `startedAt?`, `finishedAt?`, `recordsReceived?`, `recordsProcessed?`, `recordsFailed?`.

**CreateImportJobLogDto:** `level?`, `message` (req), `payloadJson?` (objeto JSON).

---

## 24. Payments — Polar.sh

Integración con [Polar.sh](https://polar.sh) para cobrar órdenes internas (`orders.orders`) con checkout one-time. Requiere `POLAR_ENABLED=true` y variables de entorno (tabla en §2).

### Checkout por orden

| Método | Path | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/v1/orders/:orderId/polar-checkout` | `payments:write` | Crea sesión Polar y devuelve `checkoutUrl` |
| GET | `/v1/orders/:orderId/polar-checkout` | Bearer | Última sesión Polar de la orden |
| GET | `/v1/payments/polar-checkouts/:id` | Bearer | Detalle local (UUID) |

**Reglas:**

- Orden debe existir con `grandTotal > 0` y `paymentStatus` distinto de `paid`.
- No se permite una segunda checkout **abierta** para la misma orden → **409**.
- El precio enviado a Polar es `grandTotal` en centavos (`POLAR_PRODUCT_ID` + precio fijo ad-hoc).
- `metadata` en Polar incluye `orderId` y `orderNumber` para reconciliación en webhooks.

**Respuesta típica (POST):**

```json
{
  "id": "uuid-local",
  "orderId": "uuid-orden",
  "polarCheckoutId": "polar_c_...",
  "checkoutUrl": "https://buy.polar.sh/...",
  "status": "open",
  "amount": 1500.5,
  "currency": "MXN"
}
```

Si Polar no está habilitado → **503**.

### Webhook Polar

| Método | Path | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/v1/payments/webhooks/polar` | `@Public` + firma HMAC | Eventos Polar (`order.paid`, etc.) |

- Body **crudo** (la app arranca con `rawBody: true` en Nest).
- Firma validada con `POLAR_WEBHOOK_SECRET` vía SDK Polar.
- Idempotencia por `polar_event_id` = `{type}:{data.id}`.

**`order.paid`:**

- Lee `metadata.orderId` del pedido Polar.
- `orders.payment_status` → `paid`.
- Inserta `orders.order_payments` (`provider: polar`, `transactionRef` = id orden Polar).
- Actualiza `payments.polar_checkouts` (`polar_order_id`, `status: succeeded`).

**`order.refunded`:** `payment_status` → `refunded`.

**No** reserva inventario automáticamente; usar `POST /v1/orders/:id/confirm` tras el pago si aplica.

Configurar en Polar Dashboard: endpoint `https://<host>/v1/payments/webhooks/polar`, eventos `order.paid`, `order.refunded`, `checkout.updated`.

---

## 25. Shipping — Skydropx

Integración con Skydropx para cotizar, crear y rastrear envíos asociados a `orders.orders`. Requiere `SKYDROPX_ENABLED=true` y variables de entorno (tabla en §2).

### Endpoints

| Método | Path | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/v1/orders/:orderId/shipping/quotes` | `shipping:write` | Cotiza el envío del pedido (usa destino/bulto del pedido o override opcional) |
| POST | `/v1/orders/:orderId/shipping/shipments` | `shipping:write` | Crea el envío en Skydropx usando `quotationId` + `rateId` |
| GET | `/v1/orders/:orderId/shipping/shipment` | `shipping:read` | Obtiene el último envío del pedido (incluye `trackingEvents`) |
| POST | `/v1/shipping/shipments/:id/cancel` | `shipping:write` | Cancela un envío en estado cancelable |
| GET | `/v1/shipping/shipments/:id/tracking` | `shipping:read` | Consulta tracking on-demand y persiste eventos nuevos |
| POST | `/v1/shipping/webhooks/skydropx` | `@Public` + firma HMAC | Recibe eventos asíncronos de Skydropx |

### Requisitos de datos en el pedido para cotizar

El pedido (`orders.orders`) debe tener destino y bulto:

- Destino mínimo: `shipToStreet1`, `shipToPostalCode` (más campos de dirección recomendados).
- Bulto: `parcelWeight`, `parcelLength`, `parcelWidth`, `parcelHeight` (> 0).

Si faltan, `POST /shipping/quotes` responde **400**. También puedes enviar overrides en el body (`destination`, `parcel`) para recotizar.

### Body principales

**QuoteShipmentDto** (todos opcionales para override):
- `destination?`: `name`, `company`, `street1`, `postalCode`, `areaLevel1`, `areaLevel2`, `areaLevel3`, `countryCode`, `phone`, `email`
- `parcel?`: `weight`, `length`, `width`, `height`

**CreateShipmentDto**:
- `quotationId` (req)
- `rateId` (req)

### Reglas de negocio

- No se permite crear un segundo envío activo para el mismo pedido (si existe y no está `cancelled`) → **409**.
- Al crear envío, se actualiza `orders.shipping_status` a `shipment_created`.
- Cancelación sólo permitida en: `created`, `pending`, `label_generated`, `ready`; otros estados → **409**.
- Al cancelar envío, `orders.shipping_status` pasa a `cancelled`.
- Si `SKYDROPX_ENABLED=false`, operaciones de shipping responden **503**.

### Webhook Skydropx

Configurar en Skydropx:
- Endpoint: `https://<host>/v1/shipping/webhooks/skydropx`
- Firma HMAC en header `x-skydropx-signature` (validada con `SKYDROPX_WEBHOOK_SECRET`)

Procesamiento:
- Idempotencia por `skydropx_event_id = {type}:{event.id || data.id || data.shipment_id}`.
- Si llega `status`, se actualiza `shipping.shipments.status`.
- También se sincroniza `orders.shipping_status` (`in_transit`, `out_for_delivery`, `delivered`, `exception`, `cancelled`).
- Se persiste evento en `shipping.shipment_tracking_events`.

### Flujo recomendado: pedidos + pagos + envío

1. Crear pedido `POST /v1/orders` con líneas, datos de destino (`shipTo*`) y bulto (`parcel*`).
2. Generar checkout `POST /v1/orders/:orderId/polar-checkout`.
3. Confirmar pago vía webhook Polar (`order.paid`) o reconciliación con `GET /v1/orders/:orderId/polar-checkout`.
4. Confirmar pedido (reserva stock) con `POST /v1/orders/:id/confirm`.
5. Cotizar envío `POST /v1/orders/:orderId/shipping/quotes` y elegir `rateId`.
6. Crear envío `POST /v1/orders/:orderId/shipping/shipments`.
7. Seguir tracking por webhook de Skydropx y/o `GET /v1/shipping/shipments/:id/tracking`.

> Nota: el webhook de Polar marca `paymentStatus`, pero no crea envío automáticamente. El flujo de shipping se dispara con los endpoints de Skydropx.

---

## 26. Modelo de datos (campos)

Resumen de las entidades expuestas. La fuente de verdad del schema son las **3 migraciones** ([InitialSchema](../src/shared/database/migrations/1700000000000-InitialSchema.ts) + [AddPaymentsPolarSchema](../src/shared/database/migrations/1779738126223-AddPaymentsPolarSchema.ts) + [AddShippingSchema](../src/shared/database/migrations/1779738126224-AddShippingSchema.ts)) y [db.md](../db.md) (nota: `db.md` aún no incluye el esquema `shipping`). El DDL completo de los **12 esquemas de negocio** (`pim`, `suppliers`, `vehicles`, `compatibility`, `inventory`, `commerce`, `orders`, `sales`, `billing`, `integrations`, `payments`, `shipping`) vive en esas migraciones.

### PIM

- **category_department**: `id` int, `code` (uniq), `departmentName`, `isActive`, `createdAt`.
- **category**: `id` int, `name`, `description?`, `code` (uniq), `idDepartment` FK, `image?`, `isActive`, `createdAt`.
- **brand**: `id` int, `name`, `brandCode?` (uniq), `image?`, `isActive`, `createdAt`.
- **brand_category**: `id` int, `brandCode` FK, `categoryCode` FK, `isActive`. Uniq `(brandCode, categoryCode)`.
- **category_complement**: `id` BIGINT, `categoryIndexId` FK, `categoryComplementId` FK. Check `index <> complement`.
- **volume_category**: `id` int, `code` (uniq), `description?`, `weight/height/width/length?`, `createdAt`.
- **auto_part_catalog**: `id` int, `name`, `code?` (uniq), `volumeCategoryId?`, `categoryId?`, `isActive` (col `is_activate`), `createdAt`.
- **product**: `id` int, `sku` (uniq), `name?`, `description?`, `categoryId?`, `brandId?`, `providerId?`, `autoPartTypeId?`, `providerSku?`, `classificationByRotation?`, `warrantyPeriod?`, `isVisible`, `principalImage?`, `price?`, `createdAt`, `updatedAt` (trigger).
- **product_color**: `id` int, `productId` FK (`id_product`), `name?`, `code?`.
- **product_dimension**: `id` int, `productSku` (uniq, FK por sku), `length?`, `width` (req), `height?`, `weight?`.
- **products_image**: `id` BIGINT, `productSku` FK, `url?`, `createdAt`.
- **product_cross_references**: `id` BIGINT, `productSku` FK, `productBrand?`, `referenceSku?`, `referenceBrand?`, `referenceProductSku?`, `providerSku?`, `createdAt`, `updatedAt` (trigger).

### Suppliers

- **provider**: `id` int, `name?`, `direction?`, `city?`, `state?`, `postalCode?`, `representative?`, `phone?`, `email?`, `inventoryReading?`, `warranty?`, `codeIdentity?` (uniq).
- **provider_branch**: `id` BIGINT, `providerId` FK, `branchName`, `contactPerson?`, `phone`, `email?`, `address`, `city`, `postalCode`, `isMainBranch`, `isActive`, `notes?`, `createdAt`, `updatedAt` (trigger).
- **brand_provider**: `id` BIGINT, `brandId` FK, `providerId` FK, `createdAt`. Uniq `(brandId, providerId)`.

### Inventory

- **inventory**: `id` int, `productSku` FK, `providerSku`, `providerBranchId` FK, `stock`, `reservedStock`, `updatedAt` (trigger). Uniq `(productSku, providerBranchId)`. Derivado: `available = stock - reservedStock`.

### Vehicles

- **assembly_plant**: `id` BIGINT, `code?` (uniq), `assemblyPlant?`.
- **model_car**: `id` BIGINT, `codeModel?` (uniq), `modelCar?`, `codeAssemblyPlant?` FK, `createdAt`.
- **year_car**: `id` int, `code?` (uniq), `year?`, `createdAt`.
- **motorization_car**: `id` BIGINT, `code?` (uniq), `motorization?`, `createdAt`.
- **model_car_motorization**: `id` int, `modelCarCode?` FK, `motorizationCode?` FK. Uniq par de códigos.

### Compatibility

- **compatibilities**: `id` BIGINT, `sku` FK, `assemblyPlantCode`, `modelCode`, `yearCode`, `motorizationCode`, `createdAt`. Uniq tupla de códigos + sku.

### Commerce

- **price_lists**: `id` UUID, `code` (uniq), `name`, `customerType?`, `currency`, `isDefault`, `createdAt`, `updatedAt` (trigger).
- **price_list_items**: `id` UUID, `priceListId` FK, `productId` FK, `price`, `minQty`, `validFrom?`, `validTo?`, timestamps.
- **payment_methods**: `id` UUID, `code` (uniq), `name`, `provider?`, `isActive`, `createdAt`.

### Orders

- **orders**: `id` UUID, `orderNumber` (uniq), `customerId`, `salesRepId?`, `providerBranchId?` FK, `status`, `paymentStatus`, `shippingStatus`, totales numéricos, `placedAt`, timestamps.
- **order_items**: `id` UUID, `orderId` FK, `productId` FK, snapshots de sku/nombre/precio, `qty`, `lineTotal`, `createdAt`.
- **order_payments**: `id` UUID, `orderId` FK, `paymentMethodId?` FK, `provider?`, `amount`, `status`, `transactionRef?`, `paidAt?`, `createdAt`.

### Sales

- **sales**: `id` UUID, `saleNumber` (uniq), `sourceType`, `orderId?` FK, `customerId`, `employeeId?`, totales, `paymentStatus?`, `saleStatus?`, `soldAt`, timestamps.

### Billing

- **invoices**: `id` UUID, `invoiceNumber` (uniq), `orderId?`, `saleId?`, `customerId`, `rfc?`, `legalName?`, totales, `currency`, `satStatus?`, `issueDate`, timestamps.
- **invoice_documents**: `id` UUID, `invoiceId` FK, `documentType`, `fileUrl`, `checksum?`, `createdAt`.

### Integrations

- **api_clients**: `id` int, `name`, `apiKey` (uniq), `isActive`, timestamps (trigger en `updated_at`).
- **import_jobs**: `id` UUID, `jobType`, `sourceSystem?`, `status`, contadores, `startedAt?`, `finishedAt?`, `createdAt`.
- **import_job_logs**: `id` UUID, `jobId` FK, `level?`, `message`, `payloadJson?` (JSONB), `createdAt`.

### Payments (Polar)

- **polar_checkouts**: `id` UUID, `orderId` FK, `polarCheckoutId` (uniq), `polarOrderId?`, `status`, `checkoutUrl`, `amount`, `currency`, timestamps.
- **webhook_events**: `id` UUID, `polarEventId` (uniq), `eventType`, `payloadJson`, `processedAt?`, `createdAt`.

### Shipping (Skydropx)

- **shipments**: `id` UUID, `orderId` FK, `skydropxShipmentId` (uniq), `quotationId?`, `rateId?`, `carrierName?`, `serviceLevel?`, `trackingNumber?`, `trackingUrl?`, `labelUrl?`, `status`, `amount?`, `currency`, timestamps.
- **shipment_tracking_events**: `id` UUID, `shipmentId` FK, `status`, `description?`, `occurredAt?`, `rawJson?`, `createdAt`.
- **webhook_events** (schema `shipping`): `id` UUID, `skydropxEventId` (uniq), `eventType`, `payloadJson`, `processedAt?`, `createdAt`.

---

## 27. Catálogo de errores

| HTTP | `code` | Origen | Cuándo |
|------|--------|--------|--------|
| 400 | (Nest) | `ValidationPipe` / `BadRequestException` | DTO inválido, campos extra; p. ej. confirmar orden sin `providerBranchId` |
| 401 | — | `JwtAuthGuard` / webhook Polar | sin token; firma HMAC Polar inválida |
| 403 | — | `RolesGuard` | falta el rol exigido (`pim:write`, etc.) |
| 404 | `NOT_FOUND` | servicios / `InventoryNotFoundError` | recurso inexistente; inventario no encontrado para SKU+branch al confirmar orden |
| 409 | `CONFLICT` | `ConflictException` / dominio | par duplicado, checkout Polar abierto, orden ya confirmada/cancelada, `InsufficientStockError`, etc. |
| 422 | `VALIDATION` | `InvalidStockOperationError` | operación de stock inválida (qty no positiva, delta no entero) |
| 500 | `INTERNAL_ERROR` | `AllExceptionsFilter` | error no controlado |
| 503 | — | Terminus / Polar | DB caída en `/health`; Polar deshabilitado (`POLAR_ENABLED=false`) |

Forma de los errores de dominio: `{ statusCode, code, message }`. Forma de los de Nest: `{ statusCode, message, error }`.

---

> **Alcance:** este documento cubre **todos los endpoints HTTP** implementados en los **12 esquemas de negocio** (`pim`, `suppliers`, `vehicles`, `compatibility`, `inventory`, `commerce`, `orders`, `sales`, `billing`, `integrations`, `payments`, `shipping`). Para arquitectura interna, patrones y gotchas de desarrollo, ver [CLAUDE.md](../CLAUDE.md).
