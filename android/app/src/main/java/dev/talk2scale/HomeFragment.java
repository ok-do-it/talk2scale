package dev.talk2scale;

import android.os.Bundle;
import android.text.InputType;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.EditText;
import android.widget.ImageButton;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AlertDialog;
import androidx.fragment.app.Fragment;
import androidx.navigation.Navigation;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

public class HomeFragment extends Fragment {

    private static final String PREFS_NAME = "talk2scale_prefs";
    private static final String KEY_USER_ID = "user_id";

    private TextView textUserName;

    public HomeFragment() {
        super(R.layout.fragment_home);
    }

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container,
                             @Nullable Bundle savedInstanceState) {
        return inflater.inflate(R.layout.fragment_home, container, false);
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        super.onViewCreated(view, savedInstanceState);

        ImageButton btnUser = view.findViewById(R.id.btnUser);
        textUserName = view.findViewById(R.id.textUserName);
        ImageButton btnMenu = view.findViewById(R.id.btnMenu);
        RecyclerView mealsRecycler = view.findViewById(R.id.mealsRecycler);

        mealsRecycler.setLayoutManager(new LinearLayoutManager(requireContext()));
        mealsRecycler.setAdapter(new MealAdapter());

        btnUser.setOnClickListener(v -> showUserIdDialog());
        btnMenu.setOnClickListener(v -> { });
        view.findViewById(R.id.btnScaleMeal)
                .setOnClickListener(v -> Navigation.findNavController(v)
                        .navigate(R.id.action_home_to_scale));

        int userId = requireActivity()
                .getSharedPreferences(PREFS_NAME, androidx.appcompat.app.AppCompatActivity.MODE_PRIVATE)
                .getInt(KEY_USER_ID, 0);
        if (userId != 0) {
            textUserName.setText(String.valueOf(userId));
        }
    }

    private void showUserIdDialog() {
        EditText input = new EditText(requireContext());
        input.setInputType(InputType.TYPE_CLASS_NUMBER);
        new AlertDialog.Builder(requireContext())
                .setTitle("User ID")
                .setView(input)
                .setPositiveButton("OK", (d, w) -> {
                    String val = input.getText().toString().trim();
                    if (!val.isEmpty()) {
                        int uid = Integer.parseInt(val);
                        requireActivity()
                                .getSharedPreferences(PREFS_NAME, androidx.appcompat.app.AppCompatActivity.MODE_PRIVATE)
                                .edit()
                                .putInt(KEY_USER_ID, uid)
                                .apply();
                        textUserName.setText(val);
                    }
                })
                .setNegativeButton("Cancel", null)
                .show();
    }
}
