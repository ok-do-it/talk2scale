package dev.talk2scale;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import java.util.ArrayList;
import java.util.List;

public class MealAdapter extends RecyclerView.Adapter<MealAdapter.ViewHolder> {

    private List<MealEntry> items = new ArrayList<>();

    public void setItems(List<MealEntry> newItems) {
        items = newItems == null ? new ArrayList<>() : newItems;
        notifyDataSetChanged();
    }

    @NonNull
    @Override
    public ViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View v = LayoutInflater.from(parent.getContext())
                .inflate(R.layout.item_meal, parent, false);
        return new ViewHolder(v);
    }

    @Override
    public void onBindViewHolder(@NonNull ViewHolder holder, int position) {
        MealEntry entry = items.get(position);
        holder.name.setText(entry.name);
        holder.time.setText(entry.time);
        holder.cal.setText(String.valueOf(entry.calories));
    }

    @Override
    public int getItemCount() {
        return items.size();
    }

    static class ViewHolder extends RecyclerView.ViewHolder {
        final TextView name;
        final TextView time;
        final TextView cal;

        ViewHolder(View itemView) {
            super(itemView);
            name = itemView.findViewById(R.id.mealName);
            time = itemView.findViewById(R.id.mealTime);
            cal = itemView.findViewById(R.id.mealCal);
        }
    }
}
