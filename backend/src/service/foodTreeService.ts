import { sql } from 'kysely';
import { db } from '../db/client.js';
import type { ElementType } from '../db/types.js';
import {
	getNutrientGroupsResolved,
	type NutrientGroupRow,
} from './nutrientGroupsConfig.js';

export type { NutrientGroupRow };

const MAX_TREE_DEPTH = 10;

type ElementRow = {
	id: number;
	type: ElementType;
	name: string;
	source: 'user' | 'usda' | 'admin';
	external_id: string | null;
};

export type TreeNode = {
	id: number;
	type: ElementType;
	name: string;
	ratio: number;
	children: TreeNode[];
};

export type NutrientEntry = {
	id: number | null;
	name: string;
	amount: number;
	calculated?: true;
};

export type NutrientGroupPayload = {
	id: number;
	name: string;
	displayOrder: number;
	nutrients: NutrientEntry[];
};

export type MeasureRow = {
	id: number;
	element_id: number | null;
	name: string;
	grams: number;
};

export type FoodTreeService = {
	listElements: (type?: ElementType, filter?: string) => Promise<ElementRow[]>;
	treeByElement: (elementId: number) => Promise<TreeNode | null>;
	nutrientsByElement: (
		elementId: number,
		mass: number,
	) => Promise<NutrientGroupPayload[] | null>;
	listMeasures: (elementId?: number) => Promise<MeasureRow[]>;
	listNutrientGroups: () => Promise<NutrientGroupRow[]>;
};

const BASIC_GROUP_NAME = 'Basic';
const ENERGY_SOURCE_EXTERNAL_IDS = {
	protein: '1003',
	fat: '1004',
	carbs: '1005',
} as const;
const ENERGY_NUTRIENT_NAME = 'Energy (kCal)';

function buildTree(
	elementId: number,
	ratio: number,
	elementsById: Map<number, ElementRow>,
	edgesByParent: Map<number, Array<{ childId: number; ratio: number }>>,
	visited: Set<number>,
): TreeNode {
	const element = elementsById.get(elementId);
	if (!element) {
		throw new Error(`Element ${elementId} is missing from fetched tree data`);
	}

	if (visited.has(elementId)) {
		return {
			id: element.id,
			type: element.type,
			name: element.name,
			ratio,
			children: [],
		};
	}

	const nextVisited = new Set(visited);
	nextVisited.add(elementId);

	const children = (edgesByParent.get(elementId) ?? []).map((edge) =>
		buildTree(
			edge.childId,
			edge.ratio,
			elementsById,
			edgesByParent,
			nextVisited,
		),
	);

	return {
		id: element.id,
		type: element.type,
		name: element.name,
		ratio,
		children,
	};
}

type NutrientAmountEntry = {
	name: string;
	amount: number;
	externalId: string | null;
};

function computeEnergyKcal(
	amountsById: Map<number, NutrientAmountEntry>,
): number {
	let protein = 0;
	let fat = 0;
	let carbs = 0;
	for (const entry of amountsById.values()) {
		if (entry.externalId === ENERGY_SOURCE_EXTERNAL_IDS.protein) {
			protein = entry.amount;
		} else if (entry.externalId === ENERGY_SOURCE_EXTERNAL_IDS.fat) {
			fat = entry.amount;
		} else if (entry.externalId === ENERGY_SOURCE_EXTERNAL_IDS.carbs) {
			carbs = entry.amount;
		}
	}
	return 4 * carbs + 4 * protein + 9 * fat;
}

export function createFoodTreeService(): FoodTreeService {
	return {
		listElements: async (type?: ElementType, filter?: string) => {
			let query = db
				.selectFrom('element')
				.select(['id', 'type', 'name', 'source', 'external_id']);

			if (type) {
				query = query.where('type', '=', type);
			}

			if (filter) {
				query = query.where('name', 'like', `%${filter}%`);
			}

			return query.orderBy('name', 'asc').execute();
		},

		treeByElement: async (elementId: number) => {
			const root = await db
				.selectFrom('element')
				.select(['id', 'type', 'name', 'source', 'external_id'])
				.where('id', '=', elementId)
				.executeTakeFirst();

			if (!root) {
				return null;
			}

			const descendants = await sql<{
				parent_id: number;
				child_id: number;
				ratio: number;
				child_name: string;
				child_type: ElementType;
				child_source: 'user' | 'usda' | 'admin';
				child_external_id: string | null;
			}>`
        WITH RECURSIVE tree AS (
          SELECT
            l.parent_id,
            l.child_id,
            l.ratio,
            ARRAY[l.parent_id, l.child_id]::bigint[] AS path,
            1 AS depth
          FROM link l
          WHERE l.parent_id = ${elementId}

          UNION ALL

          SELECT
            l.parent_id,
            l.child_id,
            l.ratio,
            t.path || l.child_id,
            t.depth + 1
          FROM link l
          JOIN tree t ON l.parent_id = t.child_id
          WHERE t.depth < ${MAX_TREE_DEPTH} AND NOT l.child_id = ANY(t.path)
        )
        SELECT
          t.parent_id,
          t.child_id,
          t.ratio,
          e.name AS child_name,
          e.type AS child_type,
          e.source AS child_source,
          e.external_id AS child_external_id
        FROM tree t
        JOIN element e ON e.id = t.child_id
        ORDER BY e.name
      `.execute(db);

			const elementsById = new Map<number, ElementRow>();
			elementsById.set(root.id, root);

			const edgesByParent = new Map<
				number,
				Array<{ childId: number; ratio: number }>
			>();
			for (const row of descendants.rows) {
				elementsById.set(row.child_id, {
					id: row.child_id,
					type: row.child_type,
					name: row.child_name,
					source: row.child_source,
					external_id: row.child_external_id,
				});

				const current = edgesByParent.get(row.parent_id) ?? [];
				current.push({ childId: row.child_id, ratio: row.ratio });
				edgesByParent.set(row.parent_id, current);
			}

			return buildTree(
				root.id,
				1,
				elementsById,
				edgesByParent,
				new Set<number>(),
			);
		},

		nutrientsByElement: async (elementId: number, mass: number) => {
			const root = await db
				.selectFrom('element')
				.select(['id', 'type', 'name', 'external_id'])
				.where('id', '=', elementId)
				.executeTakeFirst();

			if (!root) {
				return null;
			}

			const amountsById = new Map<number, NutrientAmountEntry>();

			if (root.type === 'nutrient') {
				amountsById.set(Number(root.id), {
					name: root.name,
					amount: mass,
					externalId: root.external_id,
				});
			} else {
				const nutrients = await sql<{
					id: number;
					name: string;
					external_id: string | null;
					total_ratio: number;
				}>`
          WITH RECURSIVE tree AS (
            SELECT
              l.child_id,
              l.ratio::double precision AS cumulative_ratio,
              ARRAY[l.parent_id, l.child_id]::bigint[] AS path,
              1 AS depth
            FROM link l
            WHERE l.parent_id = ${elementId}

            UNION ALL

            SELECT
              l.child_id,
              t.cumulative_ratio * l.ratio,
              t.path || l.child_id,
              t.depth + 1
            FROM link l
            JOIN tree t ON l.parent_id = t.child_id
            WHERE t.depth < ${MAX_TREE_DEPTH} AND NOT l.child_id = ANY(t.path)
          )
          SELECT
            e.id,
            e.name,
            e.external_id,
            SUM(tree.cumulative_ratio)::double precision AS total_ratio
          FROM tree
          JOIN element e ON e.id = tree.child_id
          WHERE e.type = 'nutrient'
          GROUP BY e.id, e.name, e.external_id
        `.execute(db);

				for (const row of nutrients.rows) {
					amountsById.set(Number(row.id), {
						name: row.name,
						amount: row.total_ratio * mass,
						externalId: row.external_id,
					});
				}
			}

			const groups = await getNutrientGroupsResolved();
			const result: NutrientGroupPayload[] = [];

			for (const group of groups) {
				const nutrients: NutrientEntry[] = [];

				for (const id of group.element_ids) {
					const entry = amountsById.get(id);
					if (entry === undefined) continue;
					nutrients.push({ id, name: entry.name, amount: entry.amount });
				}

				nutrients.sort((a, b) => a.name.localeCompare(b.name));

				if (group.name === BASIC_GROUP_NAME && nutrients.length > 0) {
					nutrients.unshift({
						id: null,
						name: ENERGY_NUTRIENT_NAME,
						amount: computeEnergyKcal(amountsById),
						calculated: true,
					});
				}

				if (nutrients.length === 0) continue;

				result.push({
					id: group.id,
					name: group.name,
					displayOrder: group.display_order,
					nutrients,
				});
			}

			return result;
		},

		listMeasures: async (elementId?: number) => {
			const scopedElementId = elementId ?? null;
			const measures = await sql<MeasureRow>`
        SELECT id, element_id, name, grams
        FROM measure
        WHERE element_id IS NULL
        UNION
        SELECT id, element_id, name, grams
        FROM measure
        WHERE element_id = ${scopedElementId}
        ORDER BY name
      `.execute(db);

			return measures.rows;
		},

		listNutrientGroups: () => getNutrientGroupsResolved(),
	};
}
