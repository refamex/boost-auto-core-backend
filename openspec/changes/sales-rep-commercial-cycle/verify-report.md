```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:2a079f9258807964c83679f5c89f40f3fd4405f90bedd999ad414c295224f586
verdict: fail
blockers: 3
critical_findings: 3
requirements: 8/14
scenarios: 20/27
test_command: pnpm test
test_exit_code: 0
test_output_hash: sha256:f6c8e07df6d26ddb48899e0ff2bc61a8ddbac766dd9fe94996a950b06ca9166f
build_command: pnpm build
build_exit_code: 0
build_output_hash: sha256:dabd67ef866819dfa879da412f1c17d406106a511f5ea39f0eff1a3be1f71e9e
```

## Verification Report

**Change**: sales-rep-commercial-cycle
**Version**: N/A (primeras specs del repo; `openspec/specs/` vacio)
**Mode**: Strict TDD
**Checkout verificado**: `autoboost-backend-core`, rama `feat/close-customer-price-override`, working tree limpio
**Nota de contexto**: el apply se ejecuto en otro worktree (`...-worktrees/customers`, rama `feature/customers-registry`, HEAD `d170683`). El codigo llego a este checkout, pero la rama avanzo mas alla del cambio (price lists), por lo que este arbol es un **superset** del change.

### Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 25 |
| Tasks marcadas [x] en tasks.md | 0 |
| Tasks cubiertas por codigo verificado | 22 |
| Tasks solo con evidencia reportada (no reproducible aqui) | 3 |

### Build & Tests Execution

**Build**: PASSED - `pnpm build` (nest build), exit 0, sin errores.

**Tests (unit)**: 453 passed / 0 failed
```text
pnpm test
Test Suites: 41 passed, 41 total
Tests:       453 passed, 453 total
Time:        57.151 s   (exit 0)

pnpm test -- src/modules/customers
Test Suites: 4 passed, 4 total
Tests:       48 passed, 48 total   (exit 0)
```

**Tests (e2e)**: NO EJECUTABLE - Docker no disponible
```text
docker info -> failed to connect at npipe:////./pipe/dockerDesktopLinuxEngine
npx jest --config test/jest-e2e.json --runTestsByPath test/customers.e2e-spec.ts test/customers-constraints.e2e-spec.ts
Test Suites: 2 skipped, 0 of 2 total
Tests:       12 skipped, 12 total
```
`describeWithDocker` auto-skipea y el runner sale con codigo 0. Es exactamente el "vacuously green" que el propio `design.md:269-270` advierte. **No se cuenta como PASS.** El apply-progress reporta 7/7 + 5/5 con Docker levantado; esa evidencia se preserva como *reportada*, no como *re-verificada*.

**Linter**: `npx eslint <archivos del cambio> --no-fix` -> exit 0, 0 errores. (`pnpm lint` NO se ejecuto: es `eslint --fix` y reescribe el arbol.)

**Coverage**: no ejecutado (no hay umbral configurado para este cambio).

### Spec Compliance Matrix

#### customer-registry (6 requisitos / 13 escenarios)

| Requirement | Scenario | Test | Result |
|---|---|---|---|
| Create customer profile | Rep creates own customer | `customer-profile.service.spec.ts:94` | COMPLIANT |
| Create customer profile | Ownership cannot be set from body (400) | `customer-profile.service.spec.ts:101` (servicio) + `customers.e2e-spec.ts:150` SKIPPED | PARTIAL |
| Create customer profile | Admin creates unowned house account | `customer-profile.service.spec.ts:112` | COMPLIANT |
| Create customer profile | Rep JWT missing salesRepId (422) | `customer-profile.service.spec.ts:119` | COMPLIANT |
| Register a prospect | Rep registers a prospect | `customer-profile.service.spec.ts:126` | COMPLIANT |
| Register a prospect | Prospect can hold a branch | (ninguno) | UNTESTED |
| Link an auth identity | Link succeeds | `customer-profile.service.spec.ts:193` | COMPLIANT |
| Link an auth identity | Re-linking already-linked rejected (409) | `customer-profile.service.spec.ts:204` (solo via link()) | PARTIAL - ver CRITICAL-1 |
| Link an auth identity | Duplicate auth_customer_id rejected (409) | `customer-profile.service.spec.ts:222` + `customers-constraints.e2e-spec.ts:82` SKIPPED | PARTIAL - ver CRITICAL-1 |
| Update and deactivate | Owner deactivates a customer | `customer-profile.service.spec.ts:149,158` | COMPLIANT |
| Ownership reassignment | Admin reassigns a customer | `customer-profile.service.spec.ts:183` | COMPLIANT |
| Ownership reassignment | Non-admin reassignment attempt | `customer.controller.ts:67-68` (@Roles) + `customers.e2e-spec.ts:166` SKIPPED | PARTIAL |
| Unknown customer | Unknown id -> 404 | `customer-profile.service.spec.ts:174` | COMPLIANT |

#### customer-branches (4 requisitos / 7 escenarios)

| Requirement | Scenario | Test | Result |
|---|---|---|---|
| Create and list branches | Create a branch | `customer-branch.service.spec.ts:115,128` + `customer-branch.entity.ts:56-77` | COMPLIANT |
| Exactly one main branch | Promoting demotes the previous main | `customer-branch.service.spec.ts:115,142` | COMPLIANT |
| Exactly one main branch | Concurrent promotion race | `customer-branch.service.spec.ts:133` (23505->409) + `customers-constraints.e2e-spec.ts:111` SKIPPED | PARTIAL |
| Main branch cannot be deleted | Delete main blocked while another exists | `customer-branch.service.spec.ts:161` | COMPLIANT |
| Main branch cannot be deleted | Delete sole main blocked | `customer-branch.service.spec.ts:169` | COMPLIANT |
| Main branch cannot be deleted | Delete non-main succeeds | `customer-branch.service.spec.ts:178` | COMPLIANT |
| Unknown branch or customer | Unknown branch id -> 404 | `customer-branch.service.spec.ts:184,199` | COMPLIANT |

#### customer-visibility (4 requisitos / 7 escenarios)

| Requirement | Scenario | Test | Result |
|---|---|---|---|
| Rep sees only own portfolio | Rep lists own customers | `customer-visibility.spec.ts:37` | COMPLIANT |
| Rep sees only own portfolio | Rep cannot read another rep customer (404) | `customer-profile.service.spec.ts:167` | COMPLIANT |
| Rep sees only own portfolio | Rep cannot write to another rep customer/branches | `customer-branch.service.spec.ts:152,199` | COMPLIANT |
| Admin sees everything | Admin lists all, incl. unowned | `customer-visibility.spec.ts:25,87` | COMPLIANT |
| Reps cannot browse unassigned | Unassigned hidden from rep | `customer-visibility.spec.ts:97` | COMPLIANT |
| Non-matching scope returns empty | No matching scope on list | `customer-visibility.spec.ts:62,69` | COMPLIANT |
| Non-matching scope returns empty | No relevant role at all -> 403 | (ninguno; @Roles + RolesGuard global) | UNTESTED |

**Compliance summary**: 20/27 escenarios COMPLIANT, 5 PARTIAL, 2 UNTESTED

### Correctness (Static Evidence)

| Requirement | Status | Notes |
|---|---|---|
| Esquema customers + 2 tablas | Implementado | `1779738126227-AddCustomersSchema.ts:16-60`; FK ON DELETE CASCADE en `:41` |
| Indices unicos parciales | Implementado | `:75-84` ambos, con DROP INDEX simetrico en down() `:101-106` |
| Triggers utils.set_updated_at | Implementado | `:86-91` |
| Ownership desde el JWT | Implementado | `customer-profile.service.ts:86-89`; ownerSalesRepId ausente del DTO (`customer.dto.ts:20-73`) |
| 404-not-403 en scoped miss | Implementado | `customer-profile.service.ts:175-185`; `customer-branch.service.ts:42-50` |
| Link-once (CAS) | PARCIAL | `customer-profile.service.ts:142-173` correcto, pero **eludible** via update() - CRITICAL-1 |
| Demote-then-promote transaccional | Implementado | `customer-branch.service.ts:56-92,109-131` |
| Delete main bloqueado | Implementado | `customer-branch.service.ts:99-107` |
| Direcciones 1:1 con ship_to_* | Implementado | `customer-branch.entity.ts:56-77` |
| Wiring | Implementado | `app.module.ts:25,78`; `customers.module.ts:10-21` (no exporta entidades) |
| db.md documentado | Implementado | `db.md:457-501` |

### Coherence (Design)

| Decision | Followed? | Notes |
|---|---|---|
| D1 thin CRUD + modulos puros | Si | Sin agregado; customer-visibility.ts y customer-link.ts puros |
| D2 copiar quote-visibility, no extraer helper | Desvio documentado | La tabla de D2 lista un tier "customer" (`{authCustomerId: user.id}`) que la spec customer-visibility descarta explicitamente. La implementacion sigue la **spec** (`customer-visibility.ts:37` -> null). El design quedo desactualizado, no el codigo. |
| D3 link por compare-and-set | Si | `customer-profile.service.ts:156-160` |
| D4 demote + indice parcial | Si | Servicio + uq_customer_branch_main |
| D5 convenciones de persistencia | Si | UUID PK, @Entity({schema:'customers'}), sin FK cross-service |
| D6 migracion | Si | Coincide literalmente con el SQL de `design.md:100-104` |
| D7 ownership fuera del DTO | PARCIAL | ownerSalesRepId correctamente ausente (verificado: 400). Pero el mismo razonamiento no se aplico a authCustomerId - CRITICAL-1 |
| D8 module boundary | Si | Exporta solo servicios; findByAuthCustomerId presente (`customer-profile.service.ts:62-66`) |
| Data Flow nombra assertLinkable() | Desvio menor | La implementacion es canLink() (`customer-link.ts:14`) |

### TDD Compliance

| Check | Result | Details |
|---|---|---|
| TDD Evidence reportada | OK | Tabla presente en apply-progress (batch 5-7); batch 1-4 sobrescrito por el topic_key upsert |
| Todas las tasks tienen tests | OK | 4 spec unitarios + 2 e2e, todos existen en disco |
| RED confirmado (los tests existen) | OK | 6/6 archivos verificados en disco |
| GREEN confirmado (los tests pasan) | PARCIAL | 48/48 unitarios pasan aqui; 12/12 e2e NO ejecutables (Docker) |
| Triangulacion adecuada | OK | 48 casos unitarios sobre 4 archivos; multiples casos por comportamiento |
| Safety net en archivos modificados | OK | Baseline 453/453 verde en este checkout |

**TDD Compliance**: 5/6 checks (el restante bloqueado por entorno, no por el codigo)

### Test Layer Distribution

| Layer | Tests | Files | Tools |
|---|---|---|---|
| Unit | 48 | 4 | jest + ts-jest |
| Integration (DB) | 7 | 1 | @testcontainers/postgresql (no ejecutable) |
| E2E (API) | 5 | 1 | supertest + testcontainers (no ejecutable) |
| **Total del cambio** | **60** | **6** | |

### Assertion Quality

Auditados los 6 archivos de test del cambio. Sin tautologias (`expect(true).toBe(true)`), sin aserciones huerfanas sobre colecciones vacias, sin ghost loops, sin smoke-tests sin asercion de comportamiento, sin acoplamiento a clases CSS. Los specs de servicio mockean Repository/DataSource segun la Testing Strategy del design y afirman valores concretos, no solo tipos.

**Assertion quality**: todas las aserciones verifican comportamiento real

### Quality Metrics

**Linter**: 0 errores (`eslint --no-fix` sobre los archivos del cambio)
**Type Checker**: 0 errores (`pnpm build` / nest build, exit 0)

### Issues Found

**CRITICAL**

- **CRITICAL-1 - `PATCH /v1/customers/:id` elude el guard link-once.**
  `UpdateCustomerDto extends PartialType(CreateCustomerDto)` (`customer.dto.ts:81`) hereda `authCustomerId`
  de `CreateCustomerDto:30`. El doc-comment de `customer.dto.ts:76-79` afirma que authCustomerId esta
  "intentionally excluded" - es **falso**. `CustomerProfileService.update()`
  (`customer-profile.service.ts:98-106`) hace `repo.merge(existing, dto)` + `save()` sin llamar `canLink()`
  ni traducir el `23505`. Consecuencia: un rep con customers:write, sobre su propio cliente ya vinculado,
  puede re-apuntar auth_customer_id a otro UUID via PATCH, huerfanando los joins de orders/quotes/billing;
  y un duplicado por esa via sale como 500 (QueryFailedError sin traducir) en vez de 409.
  Viola customer-registry -> "Link an auth identity to a prospect" ("Re-linking an already-linked profile
  to a different value MUST be rejected") y su escenario de duplicado (409).
  Evidencia empirica (sonda descartable con el ValidationPipe real del repo, `main.ts:25-27`):
  `[CREATE + ownerSalesRepId] REJECTED(400)`, `[UPDATE + ownerSalesRepId] REJECTED(400)`,
  `[UPDATE + authCustomerId] ACCEPTED -> {"authCustomerId":"3f2504e0-..."}`.
  Ningun test cubre este camino.

- **CRITICAL-2 - Sin evidencia runtime para 12 escenarios DB/API.** Docker no esta disponible; las 2 suites
  e2e se auto-skipean y jest sale 0. Los invariantes que **solo** la DB puede probar (ambos indices unicos
  parciales, carrera de promocion concurrente, CASCADE, trigger, ciclo up->down->up) y los 5 escenarios de
  API quedan sin verificar en esta corrida. `design.md:267-270` lo declara explicitamente no-negociable.

- **CRITICAL-3 - tasks.md desincronizado: 0/25 marcadas.** Las 25 tasks siguen sin marcar en este checkout,
  pese a que 22 estan cubiertas por codigo verificado. El commit `d170683` que las marco vive en la rama
  `feature/customers-registry` del otro worktree y no llego aqui. Bloquea el archivado por regla de fase.

**WARNING**

- El design D2 documenta un tier "customer" que la spec customer-visibility elimina; el design quedo
  desactualizado respecto de la spec y del codigo.
- `design.md` Data Flow nombra assertLinkable(); la implementacion exporta canLink().
- Task 7.3 (diff cero en orders/sales/billing/notifications) **no es verificable** en este arbol:
  la rama avanzo mucho mas alla de origin/main@3de05df.
- El servicio verificado es un **superset** del cambio: CustomerProfileService inyecta PriceListService
  y maneja priceListCode (`customer-profile.service.ts:30,84,104,119-122`; `customer.dto.ts:69-72`),
  ajeno a estas 3 specs. Proviene del trabajo posterior de la rama actual.
- El apply-progress del batch 1-4 fue sobrescrito por el upsert de topic_key; solo sobrevive la evidencia
  TDD del batch 5-7.

**SUGGESTION**

- Anadir un caso unitario para "Prospect can hold a branch" y otro para el 403 del RolesGuard, los 2
  escenarios hoy UNTESTED.
- Al corregir CRITICAL-1, considerar `OmitType(CreateCustomerDto, ['authCustomerId'] as const)` en lugar de
  `PartialType(CreateCustomerDto)`, para que el ValidationPipe lo rechace con 400 igual que
  ownerSalesRepId - coherente con el razonamiento de D7.

### Reconciliacion pendiente de tasks.md (NO aplicada - requiere aprobacion)

Marcar como completas: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 4.4,
4.5, 5.1, 5.2, 6.1, 7.2 (21 tasks con evidencia en codigo verificada arriba).
Dejar pendientes: **5.3**, **6.2** (exigen una corrida real con Docker; hoy skipeadas), **7.1** (ciclo
migration run->revert->run, no reproducible sin Docker), **7.3** (diff cero ya no verificable contra la base).

### Verdict

**FAIL** - el cambio esta sustancialmente implementado y los 48 tests unitarios, el lint acotado y el build
pasan, pero un guard de integridad de la spec es eludible por HTTP (CRITICAL-1) y los invariantes de base de
datos no tienen evidencia runtime en esta corrida (CRITICAL-2).
