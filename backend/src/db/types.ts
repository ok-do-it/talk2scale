import type { Insertable, Selectable, Updateable } from 'kysely';
import type { DB, Users } from './types.generated.js';

export * from './types.generated.js';
export type Database = DB;

export type User = Selectable<Users>;
export type NewUser = Insertable<Users>;
export type UserUpdate = Updateable<Users>;
