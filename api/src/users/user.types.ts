import { UserRole } from './schemas/user.schema.js';

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateUserInput = Pick<
  import('./schemas/user.schema.js').User,
  'name' | 'email' | 'password' | 'role'
>;
