import { validateEnvironment } from './env.validation.js';

describe('validateEnvironment', () => {
  const required = {
    MONGODB_URI: 'mongodb://127.0.0.1:27017/assignment',
    JWT_SECRET: 's'.repeat(32),
    OPENAI_API_KEY: 'test-key',
  };

  it('provides Redis queue connection defaults', () => {
    expect(validateEnvironment(required)).toMatchObject({
      REDIS_HOST: '127.0.0.1',
      REDIS_PORT: 6379,
    });
  });

  it('allows local API startup without an OpenAI key', () => {
    const config = { ...required, OPENAI_API_KEY: '' };

    expect(validateEnvironment(config).OPENAI_API_KEY).toBeUndefined();
  });

  it('requires an OpenAI key in production', () => {
    expect(() =>
      validateEnvironment({
        ...required,
        OPENAI_API_KEY: '',
        NODE_ENV: 'production',
        POSTGRES_URL: 'postgresql://assignment:secret@localhost:5432/assignment',
      }),
    ).toThrow('OPENAI_API_KEY is required in production');
  });

  it('accepts a PostgreSQL connection URI and requires it in production', () => {
    expect(
      validateEnvironment({
        ...required,
        POSTGRES_URL: 'postgresql://assignment:secret@localhost:5432/assignment',
      }),
    ).toMatchObject({
      POSTGRES_URL:
        'postgresql://assignment:secret@localhost:5432/assignment',
    });
    expect(() =>
      validateEnvironment({
        ...required,
        NODE_ENV: 'production',
      }),
    ).toThrow('POSTGRES_URL is required in production');
    expect(() =>
      validateEnvironment({ ...required, POSTGRES_URL: 'mysql://localhost/db' }),
    ).toThrow('POSTGRES_URL must be a PostgreSQL connection URI');
  });

  it('accepts Redis queue connection overrides', () => {
    expect(
      validateEnvironment({
        ...required,
        REDIS_HOST: 'redis.internal',
        REDIS_PORT: '6380',
        REDIS_PASSWORD: 'queue-password',
      }),
    ).toMatchObject({
      REDIS_HOST: 'redis.internal',
      REDIS_PORT: 6380,
      REDIS_PASSWORD: 'queue-password',
    });
  });

  it('rejects an invalid Redis port', () => {
    expect(() =>
      validateEnvironment({ ...required, REDIS_PORT: '70000' }),
    ).toThrow('REDIS_PORT must be a valid port');
  });
});
