import { randomBytes } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../app.module.js';
import { UserRole } from '../users/schemas/user.schema.js';
import { UsersService } from '../users/users.service.js';

async function seedAdmin(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    const config = app.get(ConfigService);
    const users = app.get(UsersService);
    const email = (
      config.get<string>('BOOTSTRAP_ADMIN_EMAIL') || 'admin@kriscent.local'
    )
      .trim()
      .toLowerCase();
    const name =
      config.get<string>('BOOTSTRAP_ADMIN_NAME')?.trim() || 'Kriscent Admin';
    const configuredPassword =
      config.get<string>('BOOTSTRAP_ADMIN_PASSWORD') || undefined;
    const password =
      configuredPassword ?? randomBytes(32).toString('base64url');

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('BOOTSTRAP_ADMIN_EMAIL must be a valid email address');
    }
    if (Buffer.byteLength(password, 'utf8') > 72 || password.length < 12) {
      throw new Error(
        'Bootstrap admin password must be at least 12 characters and no more than 72 bytes',
      );
    }

    const existing = await users.findByEmail(email);
    if (existing) {
      if (existing.role === UserRole.ADMIN) {
        console.log(`Admin account ${email} already exists; no changes made.`);
        return;
      }
      throw new Error(
        `An account already exists for ${email}; refusing to promote it automatically`,
      );
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    await users.create({
      name,
      email,
      password: hashedPassword,
      role: UserRole.ADMIN,
    });

    console.log(`Created ADMIN account: ${email}`);
    if (!configuredPassword) {
      console.log(`One-time generated password: ${password}`);
      console.log('Save this password securely; it will not be shown again.');
    }
  } finally {
    await app.close();
  }
}

seedAdmin().catch((error: unknown) => {
  console.error('Could not seed the initial admin account:', error);
  process.exitCode = 1;
});
