import {
  Controller,
  Get,
  INestApplication,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { GlobalExceptionFilter } from './global-exception.filter.js';

@Controller('filter-test')
class FilterTestController {
  @Get('unavailable')
  unavailable(): never {
    throw new ServiceUnavailableException(
      'PostgreSQL is not configured; set POSTGRES_URL to enable semantic search',
    );
  }

  @Get('unexpected')
  unexpected(): never {
    throw new Error('Private internal diagnostic');
  }
}

describe('GlobalExceptionFilter', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FilterTestController],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('preserves safe service-unavailable messages', async () => {
    await request(app.getHttpServer())
      .get('/filter-test/unavailable')
      .expect(503)
      .expect(({ body }) => {
        expect(body.message).toBe(
          'PostgreSQL is not configured; set POSTGRES_URL to enable semantic search',
        );
      });
  });

  it('continues hiding unexpected server error details', async () => {
    await request(app.getHttpServer())
      .get('/filter-test/unexpected')
      .expect(500)
      .expect(({ body }) => {
        expect(body.message).toBe('Internal server error');
        expect(body.message).not.toContain('Private internal diagnostic');
      });
  });
});
