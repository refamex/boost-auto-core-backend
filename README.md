# Boost Auto Backend Core

Enterprise-grade automotive catalog and e-commerce backend built with NestJS 11, TypeORM, and PostgreSQL 16.

## Description

Boost Auto Backend Core is a comprehensive backend system for automotive parts and accessories catalog management, featuring:

- **Product Information Management (PIM)** - Brands, categories, departments, products
- **Vehicle Compatibility** - Multi-dimensional vehicle-product mapping
- **Inventory Management** - Stock tracking and synchronization
- **Order Processing** - Complete order lifecycle management
- **Integration Layer** - Rough Country, Polar.sh payments, Skydropx shipping
- **Multi-tenant Architecture** - Supports multiple providers and branches

### Key Features

- 🔒 **JWT Authentication** - RS256 with JWKS support
- 📊 **11 Domain Schemas** - Clean separation of concerns
- 🚀 **Optimized Performance** - <5ms database queries with strategic indexing
- 📄 **Pagination Support** - All list endpoints with memory-efficient pagination
- 🔍 **Vehicle Search** - Advanced product filtering by vehicle compatibility
- ✅ **98 Tests** - Comprehensive test coverage (71 unit + 12 integration + 15 performance)
- 📚 **API Documentation** - Swagger UI at `/docs`

### Architecture

Built on **Hexagonal/Clean Architecture** principles:
- Domain-driven design
- Dependency inversion
- Testable business logic
- Infrastructure abstraction

## Tech Stack

- **Framework**: NestJS 11.1.22
- **Database**: PostgreSQL 16 with TypeORM 1.0.0
- **Authentication**: Passport JWT (RS256)
- **Testing**: Jest + Testcontainers
- **Package Manager**: pnpm
- **Language**: TypeScript 5.x

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+
- PostgreSQL 16
- Docker (for e2e tests)

### Installation

```bash
# Install dependencies
pnpm install

# Configure environment
cp .env.example .env
# Edit .env with your database credentials
```

### Database Setup

```bash
# Run migrations
pnpm migration:run

# Check migration status
pnpm migration:show
```

## Development

```bash
# Start development server (watch mode)
pnpm start:dev

# Start production mode
pnpm start:prod

# Build for production
pnpm build
```

The API will be available at `http://localhost:3000`.

## Testing

```bash
# Run all tests
pnpm test

# Run unit tests only
pnpm test

# Run integration tests
pnpm test:e2e

# Run performance benchmarks
pnpm test:e2e -- performance.e2e-spec.ts

# Test coverage report
pnpm test:cov
```

### Test Coverage

- **Unit Tests**: 71 tests
- **Integration Tests**: 12 tests  
- **Performance Tests**: 15 benchmarks
- **Total**: 98 tests, 100% passing

## API Documentation

### Swagger UI

Interactive API documentation available at: `http://localhost:3000/docs`

### Health Check

```bash
curl http://localhost:3000/health
```

### Authentication

All endpoints (except `/health`) require JWT authentication:

```bash
curl -H "Authorization: Bearer <your-jwt-token>" \
     http://localhost:3000/api/v1/brands
```

## Project Structure

```
src/
├── core/                 # Domain modules
│   ├── pim/             # Product Information Management
│   ├── vehicles/        # Vehicle catalog
│   ├── compatibility/   # Vehicle-product mapping
│   ├── inventory/       # Stock management
│   ├── orders/          # Order processing
│   ├── billing/         # Invoicing
│   ├── suppliers/       # Provider management
│   └── ...
├── shared/              # Shared infrastructure
│   ├── database/        # TypeORM config & migrations
│   ├── auth/            # JWT guards & strategies
│   └── dto/             # Common DTOs
└── main.ts              # Application entry point

test/
├── *.e2e-spec.ts       # Integration tests
└── performance.e2e-spec.ts  # Performance benchmarks

docs/
├── API.md              # Complete API reference (Spanish)
├── MIGRATIONS.md       # Database migration guide
└── CHANGELOG.md        # Release notes
```

## Database Schemas

The database is organized into 11 domain schemas:

| Schema | Purpose |
|--------|---------|
| `pim` | Product Information Management |
| `suppliers` | Suppliers and providers |
| `vehicles` | Vehicle catalog (brands, models, years, etc.) |
| `compatibility` | Product-vehicle compatibility mapping |
| `inventory` | Stock and warehouse management |
| `commerce` | Pricing and discounts |
| `orders` | Order lifecycle management |
| `shipping` | Fulfillment and tracking |
| `payments` | Payment processing |
| `customers` | Customer profiles |
| `billing` | Invoicing |
| `notifications` | Notification system |

## Performance Benchmarks

All endpoints meet strict performance requirements (verified via `test/performance.e2e-spec.ts`):

| Metric | Target | Status |
|--------|--------|--------|
| Paginated endpoints (first page) | <150ms | ✅ <100ms |
| Paginated endpoints (with filters) | <200ms | ✅ <150ms |
| Database indexes | <5ms | ✅ <5ms |
| Vehicle product search | <100ms | ✅ <80ms |
| Bulk operations (200+ records) | <200ms | ✅ <150ms |
| Concurrent load (10 requests) | <500ms | ✅ <400ms |

## Security

### Authentication

- **Algorithm**: RS256 (asymmetric encryption)
- **Token Validation**: JWKS support for key rotation
- **Guards**: All routes protected by JWT guards

### Recent Security Audit

A comprehensive 10-phase security audit was completed (Aug 2026):

1. ✅ Security verification (JWT RS256, JWKS)
2. ✅ PIM pagination (prevent OOM attacks)
3. ✅ Database indexing (query optimization)
4. ✅ Vehicle search optimization (99% data transfer reduction)
5. ✅ Stock sync alerting (admin notifications)
6. ✅ Category soft delete (data integrity)
7. ✅ Integration testing (E2E coverage)
8. ✅ Performance testing (strict benchmarks)
9. ✅ Documentation updates (this file!)

See [CHANGELOG.md](./CHANGELOG.md) for complete audit details.

## Migrations

### Running Migrations

```bash
# Apply all pending migrations
pnpm migration:run

# Show migration status
pnpm migration:show

# Rollback last migration
pnpm migration:revert
```

### Creating Migrations

```bash
# Generate from entity changes
pnpm migration:generate src/shared/database/migrations/MigrationName

# Create empty migration
pnpm migration:create src/shared/database/migrations/MigrationName
```

See [docs/MIGRATIONS.md](./docs/MIGRATIONS.md) for detailed migration guide.

## Key Endpoints

### PIM (Product Information)

- `GET /v1/brands` - List brands with pagination
- `GET /v1/categories` - List categories with filters
- `GET /v1/departments` - List departments
- `GET /v1/products` - List products
- `GET /v1/products/by-vehicle` - Search products by vehicle compatibility ⚡

### Vehicles

- `GET /v1/vehicles/brands` - Vehicle brands
- `GET /v1/vehicles/models` - Vehicle models
- `GET /v1/vehicles/years` - Model years

### Orders

- `POST /v1/orders` - Create order
- `GET /v1/orders/:id` - Get order details
- `PATCH /v1/orders/:id/status` - Update order status

See [docs/API.md](./docs/API.md) for complete API reference (Spanish).

## Environment Variables

```bash
# Database
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=your_password
DB_DATABASE=autoboost

# Server
PORT=3000
NODE_ENV=development

# JWT
JWT_SECRET=your-secret-key
JWT_ISSUER=autoboost-api
JWT_AUDIENCE=autoboost-frontend

# Integrations (optional)
ROUGH_COUNTRY_API_KEY=...
POLAR_API_KEY=...
SKYDROPX_API_KEY=...
```

## Contributing

### Code Style

- Use TypeScript strict mode
- Follow NestJS conventions
- Write tests for new features
- Update API documentation

### Pull Request Process

1. Create feature branch from `main`
2. Write tests for changes
3. Run `pnpm test` and `pnpm build`
4. Update documentation if needed
5. Submit PR with clear description

### Commit Convention

Follow conventional commits:
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation only
- `test:` - Adding tests
- `refactor:` - Code refactoring
- `perf:` - Performance improvement

## Deployment

### Production Build

```bash
# Build application
pnpm build

# Start production server
pnpm start:prod
```

### Docker (Optional)

```bash
# Build image
docker build -t autoboost-backend .

# Run container
docker run -p 3000:3000 --env-file .env autoboost-backend
```

### Health Monitoring

Monitor application health:
```bash
curl http://your-domain.com/health
```

Response:
```json
{
  "status": "ok",
  "info": {
    "database": { "status": "up" }
  }
}
```

## Troubleshooting

### Database Connection Issues

```bash
# Check PostgreSQL is running
psql -U postgres -h localhost -p 5432

# Verify connection in .env
echo $DB_HOST $DB_PORT $DB_USERNAME
```

### Migration Errors

```bash
# Show current migration status
pnpm migration:show

# Revert and retry
pnpm migration:revert
pnpm migration:run
```

### Test Failures

```bash
# Clear Jest cache
pnpm test --clearCache

# Run specific test file
pnpm test -- brand.service.spec.ts

# Run with verbose output
pnpm test -- --verbose
```

## Resources

- [Complete API Reference](./docs/API.md) (Spanish)
- [Migration Guide](./docs/MIGRATIONS.md)
- [Changelog](./CHANGELOG.md)
- [NestJS Documentation](https://docs.nestjs.com)
- [TypeORM Documentation](https://typeorm.io)

## License

Proprietary - Boost Auto © 2026

## Support

For questions or issues, contact the development team.

---

Built with ❤️ using [NestJS](https://nestjs.com)
