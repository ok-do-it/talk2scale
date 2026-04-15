import type { Generated, Insertable, Selectable, Updateable } from 'kysely';

export type ElementType = 'nutrient' | 'whole_food' | 'recipe' | 'branded_food';

export interface UsersTable {
  id: Generated<number>;
  name: string;
  email: string;
}

export interface ElementTable {
  id: Generated<number>;
  type: ElementType;
  name: string;
  user_id: number | null;
}

export interface LinkTable {
  parent_id: number;
  child_id: number;
  ratio: number;
}

export interface UnitTable {
  id: Generated<number>;
  element_id: number | null;
  name: string;
  grams: number;
}

export interface AliasTable {
  id: Generated<number>;
  element_id: number;
  name: string;
  locale: string | null;
}

export interface MealTable {
  id: Generated<number>;
  user_id: number;
  name: string | null;
  logged_at: Date;
}

export interface LogTable {
  id: Generated<number>;
  meal_id: number;
  element_id: number | null;
  raw_name: string;
  amount: number;
  unit_id: number;
}

export interface Database {
  users: UsersTable;
  element: ElementTable;
  link: LinkTable;
  unit: UnitTable;
  alias: AliasTable;
  meal: MealTable;
  log: LogTable;
}

export type User = Selectable<UsersTable>;
export type NewUser = Insertable<UsersTable>;
export type UserUpdate = Updateable<UsersTable>;
