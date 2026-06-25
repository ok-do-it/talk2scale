package dev.talk2scale;

public class MealEntry {
    public final String name;
    public final String time;
    public final int calories;

    public MealEntry(String name, String time, int calories) {
        this.name = name;
        this.time = time;
        this.calories = calories;
    }
}
