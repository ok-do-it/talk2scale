export type LogEntry = {
  foodName: string;
  weightGrams: number;
  calories: number;
};

export type MealEntry = {
  name: string;
  time: string;
  calories: number;
};

export type WeightReading = {
  weight: number;
  stable: boolean;
};
