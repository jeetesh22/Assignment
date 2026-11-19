function getString(
  config: Record<string, unknown>,
  key: string,
  defaultValue?: string,
): string {
  const value = config[key] ?? defaultValue;
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Environment variable ${key} must be a non-empty string`);
  }
  return value.trim();
}

function getOptionalString(
  config: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = config[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    throw new Error(`Environment variable ${key} must be a string`);
  }
  return value.trim() || undefined;
}

function getPort(
  config: Record<string, unknown>,
  key: string,
  defaultValue: number,
): number {
  const value = config[key] ?? defaultValue;
  const port = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Environment variable ${key} must be a valid port`);
  }
  return port;
}

export function validateEnvironment(config: Record<string, unknown>) {
  const mongoUri = getString(config, 'MONGODB_URI');
  if (!mongoUri.startsWith('mongodb://') && !mongoUri.startsWith('mongodb+srv://')) {
    throw new Error('Environment variable MONGODB_URI must be a MongoDB URI');
  }
  const jwtSecret = getString(config, 'JWT_SECRET');
  if (jwtSecret.length < 32) {
    throw new Error('Environment variable JWT_SECRET must be at least 32 characters');
  }
  const openAiApiKey = getOptionalString(config, 'OPENAI_API_KEY');
  const postgresValue = config.POSTGRES_URL;
  const postgresUrl =
    typeof postgresValue === 'string' && postgresValue.trim()
      ? postgresValue.trim()
      : undefined;
  if (
    postgresUrl &&
    !postgresUrl.startsWith('postgres://') &&
    !postgresUrl.startsWith('postgresql://')
  ) {
    throw new Error(
      'Environment variable POSTGRES_URL must be a PostgreSQL connection URI',
    );
  }
  if (postgresUrl) {
    try {
      new URL(postgresUrl);
    } catch {
      throw new Error(
        'Environment variable POSTGRES_URL must be a valid PostgreSQL connection URI',
      );
    }
  }

  const corsOrigins = getString(
    config,
    'CORS_ORIGIN',
    'http://localhost:3000',
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (corsOrigins.length === 0 || corsOrigins.includes('*')) {
    throw new Error('Environment variable CORS_ORIGIN must specify allowed origins');
  }

  const nodeEnv = getString(config, 'NODE_ENV', 'development');
  if (nodeEnv === 'production' && !postgresUrl) {
    throw new Error(
      'Environment variable POSTGRES_URL is required in production',
    );
  }
  if (nodeEnv === 'production' && !openAiApiKey) {
    throw new Error(
      'Environment variable OPENAI_API_KEY is required in production',
    );
  }

  return {
    ...config,
    NODE_ENV: nodeEnv,
    PORT: getPort(config, 'PORT', 4000),
    MONGODB_URI: mongoUri,
    JWT_SECRET: jwtSecret,
    OPENAI_API_KEY: openAiApiKey,
    POSTGRES_URL: postgresUrl,
    REDIS_HOST: getString(config, 'REDIS_HOST', '127.0.0.1'),
    REDIS_PORT: getPort(config, 'REDIS_PORT', 6379),
    CORS_ORIGIN: corsOrigins.join(','),
  };
}
