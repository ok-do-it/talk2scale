package dev.talk2scale;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import java.util.ArrayList;
import java.util.List;

public class LogAdapter extends RecyclerView.Adapter<LogAdapter.ViewHolder> {

    private List<LogEntry> items = new ArrayList<>();

    public void setItems(List<LogEntry> newItems) {
        items = newItems;
        notifyDataSetChanged();
    }

    @NonNull
    @Override
    public ViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View v = LayoutInflater.from(parent.getContext())
                .inflate(R.layout.item_log, parent, false);
        return new ViewHolder(v);
    }

    @Override
    public void onBindViewHolder(@NonNull ViewHolder holder, int position) {
        LogEntry entry = items.get(position);
        holder.food.setText(entry.foodName);
        holder.weight.setText(entry.weightGrams + " g");
        holder.calories.setText(String.valueOf(entry.calories));
    }

    @Override
    public int getItemCount() {
        return items.size();
    }

    static class ViewHolder extends RecyclerView.ViewHolder {
        final TextView food;
        final TextView weight;
        final TextView calories;

        ViewHolder(View itemView) {
            super(itemView);
            food = itemView.findViewById(R.id.logFood);
            weight = itemView.findViewById(R.id.logWeight);
            calories = itemView.findViewById(R.id.logCalories);
        }
    }
}
