import { buildApiUrl } from '../config/api';

export type NutrientEntry = {
  id: number | null;
  name: string;
  amount: number;
  calculated?: boolean;
};

export type NutrientGroup = {
  id: number;
  name: string;
  displayOrder: number;
  nutrients: NutrientEntry[];
};

export type DailyTargets = {
  kcal: number;
  nutrient_amounts: Array<{ id: number; grams: number }>;
};

export type ApiFoodLog = {
  id: number;
  user_id: number;
  logged_at: string;
  element_id: number | null;
  raw_name: string;
  amount: number;
  measure_id: number;
  kcal?: number;
};

export type ElementSummary = {
  id: number;
  type: 'nutrient' | 'whole_food' | 'recipe' | 'branded_food';
  name: string;
};

export type FoodNameSearchHit = {
  foodNameId: number;
  elementId: number;
  elementName: string;
  name: string;
  distance: number;
};

export type ApiMeasure = {
  id: number;
  element_id: number | null;
  user_id: number | null;
  name: string;
  grams: number;
};

export type NewFoodLogInput = {
  user_id: number;
  logged_at?: string;
  element_id: number | null;
  raw_name: string;
  amount: number;
  measure_id: number;
};

export type NewRecipeInput = {
  name: string;
  children: Array<{ element_id: number; grams: number }>;
  serving_grams?: number;
  user_id?: number;
};

export type ApiRecipe = {
  id: number;
  type: 'recipe';
  name: string;
  source: string;
  external_id: string | null;
  links: Array<{ parent_id: number; child_id: number; ratio: number }>;
  measures: ApiMeasure[];
};

async function readJsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) detail = body.error;
    } catch {
      // ignore
    }
    throw new Error(detail);
  }

  return (await res.json()) as T;
}

export async function fetchDailyTargets(
  userId: number,
): Promise<DailyTargets | null> {
  const res = await fetch(buildApiUrl(`/users/${userId}/daily-targets`));
  return readJsonOrThrow<DailyTargets | null>(res);
}

export async function fetchUserFoodLogNutrients(
  userId: number,
  from: Date,
  to: Date,
): Promise<NutrientGroup[]> {
  const params = new URLSearchParams({
    from: from.toISOString(),
    to: to.toISOString(),
  });
  const res = await fetch(
    buildApiUrl(`/users/${userId}/food-logs/nutrients?${params.toString()}`),
  );
  return readJsonOrThrow<NutrientGroup[]>(res);
}

export async function fetchElementNutrients(
  elementId: number,
  mass: number,
): Promise<NutrientGroup[]> {
  const params = new URLSearchParams({ mass: String(mass) });
  const res = await fetch(
    buildApiUrl(`/element/${elementId}/nutrients?${params.toString()}`),
  );
  return readJsonOrThrow<NutrientGroup[]>(res);
}

export async function fetchMeasures(
  elementId?: number,
  userId?: number,
): Promise<ApiMeasure[]> {
  const params = new URLSearchParams();
  if (userId !== undefined && userId > 0) {
    params.set('user_id', String(userId));
  }
  const path =
    elementId === undefined ? '/measures' : `/measures/${elementId}`;
  const suffix = params.size > 0 ? `?${params.toString()}` : '';
  const res = await fetch(buildApiUrl(`${path}${suffix}`));
  return readJsonOrThrow<ApiMeasure[]>(res);
}

export async function fetchUserFoodLogs(
  userId: number,
  from: Date,
  to: Date,
): Promise<ApiFoodLog[]> {
  const params = new URLSearchParams({
    from: from.toISOString(),
    to: to.toISOString(),
  });
  const res = await fetch(
    buildApiUrl(`/users/${userId}/food-logs?${params.toString()}`),
  );
  return readJsonOrThrow<ApiFoodLog[]>(res);
}

export async function createFoodLog(
  input: NewFoodLogInput,
): Promise<ApiFoodLog> {
  const res = await fetch(buildApiUrl('/food-logs'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return readJsonOrThrow<ApiFoodLog>(res);
}

export async function deleteFoodLog(logId: number): Promise<void> {
  const res = await fetch(buildApiUrl(`/food-logs/${logId}`), {
    method: 'DELETE',
  });
  if (!res.ok) {
    await readJsonOrThrow<unknown>(res);
  }
}

export async function createRecipe(input: NewRecipeInput): Promise<ApiRecipe> {
  const res = await fetch(buildApiUrl('/recipes'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return readJsonOrThrow<ApiRecipe>(res);
}

export async function fetchNutrientElements(): Promise<ElementSummary[]> {
  const res = await fetch(buildApiUrl('/elements?type=nutrient'));
  return readJsonOrThrow<ElementSummary[]>(res);
}

export async function searchElements(
  filter: string,
  limit = 10,
): Promise<ElementSummary[]> {
  const params = new URLSearchParams({ filter });
  const res = await fetch(buildApiUrl(`/elements?${params.toString()}`));
  const elements = await readJsonOrThrow<ElementSummary[]>(res);
  return elements.slice(0, limit);
}

export async function searchFoodNames(
  query: string,
  limit = 10,
): Promise<ElementSummary[]> {
  const params = new URLSearchParams({ food_name: query });
  const res = await fetch(buildApiUrl(`/search-food?${params.toString()}`));
  const hits = await readJsonOrThrow<FoodNameSearchHit[]>(res);
  return hits.slice(0, limit).map((hit) => ({
    id: hit.elementId,
    type: 'whole_food',
    name: hit.name,
  }));
}
