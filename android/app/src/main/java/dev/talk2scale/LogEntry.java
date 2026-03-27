package dev.talk2scale;

public class LogEntry {
    public final String foodName;
    public final int weightGrams;
    public final int calories;

    public LogEntry(String foodName, int weightGrams, int calories) {
        this.foodName = foodName;
        this.weightGrams = weightGrams;
        this.calories = calories;
    }
}
