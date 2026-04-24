import type { Database } from './types.js';

type ColumnIdentifiers = {
	[TableName in keyof Database]: {
		[ColumnName in keyof Database[TableName]]: ColumnName;
	};
};

export const TABLE = {
	users: 'users',
	element: 'element',
	link: 'link',
	measure: 'measure',
	food_name: 'food_name',
	meal: 'meal',
	food_log: 'food_log',
} as const satisfies Record<keyof Database, keyof Database>;

export const COLUMN = {
	users: {
		id: 'id',
		name: 'name',
		email: 'email',
	},
	element: {
		id: 'id',
		type: 'type',
		name: 'name',
		source: 'source',
		external_id: 'external_id',
	},
	link: {
		parent_id: 'parent_id',
		child_id: 'child_id',
		ratio: 'ratio',
	},
	measure: {
		id: 'id',
		element_id: 'element_id',
		name: 'name',
		grams: 'grams',
	},
	food_name: {
		id: 'id',
		element_id: 'element_id',
		user_id: 'user_id',
		embedding: 'embedding',
		name: 'name',
		locale: 'locale',
	},
	meal: {
		id: 'id',
		user_id: 'user_id',
		name: 'name',
		logged_at: 'logged_at',
	},
	food_log: {
		id: 'id',
		meal_id: 'meal_id',
		element_id: 'element_id',
		raw_name: 'raw_name',
		amount: 'amount',
		unit_id: 'unit_id',
	},
} as const satisfies ColumnIdentifiers;

export type TableIdentifier = (typeof TABLE)[keyof typeof TABLE];

export type ColumnIdentifier<TableName extends keyof typeof COLUMN> =
	(typeof COLUMN)[TableName][keyof (typeof COLUMN)[TableName]];
