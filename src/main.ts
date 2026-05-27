import 'reflect-metadata';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './shared/common/filters/http-exception.filter';
import { DomainExceptionFilter } from './shared/common/filters/domain-exception.filter';
import { LoggingInterceptor } from './shared/common/interceptors/logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: false, rawBody: true });

  app.use(helmet());
  app.enableCors();
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter(), new DomainExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  const swagger = new DocumentBuilder()
    .setTitle('AutoBoost Core API')
    .setDescription('PIM + Suppliers + Inventory + Vehicles + Compatibility + Commerce + Orders + Sales + Billing + Integrations + Payments (Polar)')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swagger));

  const port = parseInt(process.env.PORT ?? '3000', 10);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`✓ autoboost-core listening on http://localhost:${port} — docs at /docs`);
}

void bootstrap();
