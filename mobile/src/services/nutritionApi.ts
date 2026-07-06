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
  meal_id: number;
  element_id: number | null;
  raw_name: string;
  amount: number;
  measure_id: number;
};

export type ApiMeal = {
  id: number;
  user_id: number;
  name: string | null;
  logged_at: string;
  kcal?: number;
  food_logs: ApiFoodLog[];
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

export type MealFoodLogInput = {
  element_id: number | null;
  raw_name: string;
  amount: number;
  measure_id: number;
};

export type NewMealInput = {
  user_id: number;
  logged_at?: string;
  food_logs: MealFoodLogInput[];
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

export async function fetchUserMealNutrients(
  userId: number,
  from: Date,
  to: Date,
): Promise<NutrientGroup[]> {
  const params = new URLSearchParams({
    from: from.toISOString(),
    to: to.toISOString(),
  });
  const res = await fetch(
    buildApiUrl(`/users/${userId}/meals/nutrients?${params.toString()}`),
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

export async function fetchUserMeals(
  userId: number,
  from: Date,
  to: Date,
): Promise<ApiMeal[]> {
  const params = new URLSearchParams({
    from: from.toISOString(),
    to: to.toISOString(),
  });
  const res = await fetch(
    buildApiUrl(`/users/${userId}/meals?${params.toString()}`),
  );
  return readJsonOrThrow<ApiMeal[]>(res);
}

export async function fetchMeal(mealId: number): Promise<ApiMeal> {
  const res = await fetch(buildApiUrl(`/meals/${mealId}`));
  return readJsonOrThrow<ApiMeal>(res);
}

export async function createMeal(input: NewMealInput): Promise<ApiMeal> {
  const res = await fetch(buildApiUrl('/meals'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return readJsonOrThrow<ApiMeal>(res);
}

export async function renameMeal(mealId: number, name: string): Promise<ApiMeal> {
  const res = await fetch(buildApiUrl(`/meals/${mealId}/name`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  return readJsonOrThrow<ApiMeal>(res);
}

export async function addMealFoodLog(
  mealId: number,
  input: MealFoodLogInput,
): Promise<ApiFoodLog> {
  const res = await fetch(buildApiUrl(`/meals/${mealId}/food-logs`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return readJsonOrThrow<ApiFoodLog>(res);
}

export async function deleteMealFoodLog(
  mealId: number,
  logId: number,
): Promise<void> {
  const res = await fetch(buildApiUrl(`/meals/${mealId}/food-logs/${logId}`), {
    method: 'DELETE',
  });
  if (!res.ok) {
    await readJsonOrThrow<unknown>(res);
  }
}

export async function deleteMeal(mealId: number): Promise<void> {
  const res = await fetch(buildApiUrl(`/meals/${mealId}`), {
    method: 'DELETE',
  });
  if (!res.ok) {
    await readJsonOrThrow<unknown>(res);
  }
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
    name: hit.elementName,
  }));
}
