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
    private OnItemClickListener onItemClickListener;
    private int selectedPosition = RecyclerView.NO_POSITION;

    public interface OnItemClickListener {
        void onItemClick(int position);
    }

    public void setOnItemClickListener(OnItemClickListener listener) {
        onItemClickListener = listener;
    }

    public void setItems(List<LogEntry> newItems) {
        items = newItems == null ? new ArrayList<>() : newItems;
        if (selectedPosition >= items.size()) {
            selectedPosition = RecyclerView.NO_POSITION;
        }
        notifyDataSetChanged();
    }

    public void setSelectedPosition(int position) {
        int normalized = (position >= 0 && position < items.size())
                ? position
                : RecyclerView.NO_POSITION;
        if (selectedPosition == normalized) {
            return;
        }

        int previous = selectedPosition;
        selectedPosition = normalized;

        if (previous != RecyclerView.NO_POSITION) {
            notifyItemChanged(previous);
        }
        if (selectedPosition != RecyclerView.NO_POSITION) {
            notifyItemChanged(selectedPosition);
        }
    }

    public void clearSelection() {
        setSelectedPosition(RecyclerView.NO_POSITION);
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
        holder.itemView.setSelected(position == selectedPosition);
        holder.itemView.setOnClickListener(v -> {
            int adapterPosition = holder.getBindingAdapterPosition();
            if (adapterPosition == RecyclerView.NO_POSITION) {
                return;
            }
            if (onItemClickListener != null) {
                onItemClickListener.onItemClick(adapterPosition);
            }
        });
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
