package dev.talk2scale;

import android.content.SharedPreferences;
import android.text.InputType;
import android.view.View;
import android.widget.EditText;
import android.widget.ImageButton;
import android.widget.TextView;

import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import java.util.ArrayList;

/** Self-contained controller for the home/landing screen. */
public class HomeScreenController {

    private static final String PREFS_NAME = "talk2scale_prefs";
    private static final String KEY_USER_ID = "user_id";

    private final AppCompatActivity activity;
    private TextView textUserName;

    public HomeScreenController(AppCompatActivity activity) {
        this.activity = activity;
    }

    public void bind(View root, Runnable onNavigateToScale) {
        ImageButton btnUser = root.findViewById(R.id.btnUser);
        textUserName = root.findViewById(R.id.textUserName);
        ImageButton btnMenu = root.findViewById(R.id.btnMenu);
        RecyclerView mealsRecycler = root.findViewById(R.id.mealsRecycler);

        mealsRecycler.setLayoutManager(new LinearLayoutManager(activity));
        mealsRecycler.setAdapter(new MealAdapter());

        btnUser.setOnClickListener(v -> showUserIdDialog());
        btnMenu.setOnClickListener(v -> { });

        root.findViewById(R.id.btnScaleMeal).setOnClickListener(v -> onNavigateToScale.run());

        int userId = activity.getSharedPreferences(PREFS_NAME, AppCompatActivity.MODE_PRIVATE)
                .getInt(KEY_USER_ID, 0);
        if (userId != 0) {
            textUserName.setText(String.valueOf(userId));
        }
    }

    private void showUserIdDialog() {
        EditText input = new EditText(activity);
        input.setInputType(InputType.TYPE_CLASS_NUMBER);
        new AlertDialog.Builder(activity)
                .setTitle("User ID")
                .setView(input)
                .setPositiveButton("OK", (d, w) -> {
                    String val = input.getText().toString().trim();
                    if (!val.isEmpty()) {
                        int uid = Integer.parseInt(val);
                        activity.getSharedPreferences(PREFS_NAME, AppCompatActivity.MODE_PRIVATE)
                                .edit().putInt(KEY_USER_ID, uid).apply();
                        textUserName.setText(val);
                    }
                })
                .setNegativeButton("Cancel", null)
                .show();
    }
}
