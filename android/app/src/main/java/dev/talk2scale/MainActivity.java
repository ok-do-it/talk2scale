package dev.talk2scale;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.View;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.EdgeToEdge;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.lifecycle.ViewModelProvider;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends AppCompatActivity {

    private ScaleViewModel viewModel;

    private FrameLayout calibrationOverlay;
    private EditText editCalibGrams;
    private TextView weightDisplay;
    private LogAdapter logAdapter;
    private CheckBox checkMockTop;
    private ImageButton btnAddWeightTop;

    private EditText editFoodName;
    private Button btnMic;
    private ImageButton btnClearFood;
    private ImageButton btnApplyInline;
    private TextView textListeningOverlay;
    private SpeechRecognition speechRecognition;
    private final List<LogEntry> logEntries = new ArrayList<>();
    private int selectedLogIndex = RecyclerView.NO_POSITION;
    private LogEntry selectedLogEntry;

    private ConnectionOverlayController connectionOverlay;
    private ActivityResultLauncher<String> permissionLauncher;
    private ActivityResultLauncher<String> micPermissionLauncher;
    private ActivityResultLauncher<IntentSenderRequest> cdmLauncher;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        EdgeToEdge.enable(this);
        setContentView(R.layout.activity_main);
        ViewCompat.setOnApplyWindowInsetsListener(findViewById(R.id.main), (v, insets) -> {
            Insets systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            v.setPadding(systemBars.left, systemBars.top, systemBars.right, systemBars.bottom);
            return insets;
        });

        viewModel = new ViewModelProvider(this).get(ScaleViewModel.class);
        registerLaunchers();
        bindViews();
        observeViewModel();
    }

    private void registerLaunchers() {
        permissionLauncher = registerForActivityResult(
                new ActivityResultContracts.RequestPermission(),
                granted -> connectionOverlay.onBluetoothPermissionResult(granted));

        micPermissionLauncher = registerForActivityResult(
                new ActivityResultContracts.RequestPermission(), granted -> {
                    if (granted) {
                        speechRecognition.startListening();
                    } else {
                        Toast.makeText(this, R.string.speech_status_no_mic_permission,
                                Toast.LENGTH_SHORT).show();
                    }
                });

        cdmLauncher = registerForActivityResult(
                new ActivityResultContracts.StartIntentSenderForResult(),
                result -> connectionOverlay.onCdmResult(result.getResultCode(), result.getData()));
    }

    private void bindViews() {
        weightDisplay = findViewById(R.id.weightDisplay);

        checkMockTop = findViewById(R.id.checkMockTop);
        btnAddWeightTop = findViewById(R.id.btnAddWeightTop);
        ImageButton btnConnectTop = findViewById(R.id.btnConnectTop);
        ImageButton btnCalibrateTop = findViewById(R.id.btnCalibrateTop);
        Button btnTare = findViewById(R.id.btnTare);
        btnMic = findViewById(R.id.btnMic);
        editFoodName = findViewById(R.id.editFoodName);
        btnClearFood = findViewById(R.id.btnClearFood);
        btnApplyInline = findViewById(R.id.btnApplyInline);
        textListeningOverlay = findViewById(R.id.textListeningOverlay);
        RecyclerView logRecycler = findViewById(R.id.logRecycler);

        calibrationOverlay = findViewById(R.id.calibrationOverlay);
        editCalibGrams = findViewById(R.id.editCalibGrams);
        ImageButton btnCloseCalibration = findViewById(R.id.btnCloseCalibration);
        Button btnSetZero = findViewById(R.id.btnSetZero);
        Button btnSetCalibWeight = findViewById(R.id.btnSetCalibWeight);

        speechRecognition = new SpeechRecognition(this, new SpeechRecognition.Callback() {
            @Override
            public void onListeningStateChanged(boolean isListening) {
                if (isListening) {
                    setListeningState();
                } else {
                    setIdleState();
                }
            }

            @Override
            public void onPartialText(String text) {
                editFoodName.setText(text);
                editFoodName.setSelection(editFoodName.getText().length());
            }

            @Override
            public void onFinalText(String text) {
                editFoodName.setText(text);
                editFoodName.setSelection(editFoodName.getText().length());
                String food = text.trim();
                if (isEditingLogEntry() && applySelectedLogEntryRename(food)) {
                    editFoodName.setText("");
                } else if (viewModel.getLastStableWeight() > 0 && applyLogEntry(food)) {
                    editFoodName.setText("");
                }
            }

            @Override
            public void onNoMatchOrTimeout() {
                Toast.makeText(MainActivity.this, R.string.speech_status_error,
                        Toast.LENGTH_SHORT).show();
            }

            @Override
            public void onUnavailable() {
                Toast.makeText(MainActivity.this, R.string.speech_status_unavailable,
                        Toast.LENGTH_SHORT).show();
            }
        });

        connectionOverlay = new ConnectionOverlayController(
                this, viewModel, permissionLauncher, cdmLauncher);
        connectionOverlay.bind(findViewById(R.id.main));
        checkMockTop.setOnCheckedChangeListener((buttonView, isChecked) ->
                viewModel.setMockEnabled(isChecked));
        btnAddWeightTop.setOnClickListener(v -> viewModel.addMockWeight());
        btnConnectTop.setOnClickListener(v -> connectionOverlay.show());
        btnCalibrateTop.setOnClickListener(v -> showCalibrationOverlay());
        btnTare.setOnClickListener(v -> viewModel.sendTare());

        btnMic.setOnClickListener(v -> {
            if (speechRecognition.isListening()) {
                speechRecognition.cancelListening();
                editFoodName.setText("");
            } else {
                onMicTap();
            }
        });

        btnClearFood.setOnClickListener(v -> {
            if (isEditingLogEntry()) {
                clearLogItemEditing(true);
            } else {
                editFoodName.setText("");
            }
        });

        btnApplyInline.setOnClickListener(v -> {
            String food = editFoodName.getText().toString().trim();
            boolean applied = isEditingLogEntry()
                    ? applySelectedLogEntryRename(food)
                    : applyLogEntry(food);
            if (applied) {
                editFoodName.setText("");
            }
        });
        editFoodName.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) { }
            @Override public void onTextChanged(CharSequence s, int start, int before, int count) {
                refreshApplyButtonState();
            }
            @Override public void afterTextChanged(Editable s) { }
        });
        refreshApplyButtonState();

        btnCloseCalibration.setOnClickListener(v ->
                calibrationOverlay.setVisibility(View.GONE));
        btnSetZero.setOnClickListener(v -> handleSetZero());
        btnSetCalibWeight.setOnClickListener(v -> handleSetCalibWeight());

        logAdapter = new LogAdapter();
        logAdapter.setOnItemClickListener(this::selectLogItemForEditing);
        logRecycler.setLayoutManager(new LinearLayoutManager(this));
        logRecycler.setAdapter(logAdapter);
    }

    private void observeViewModel() {
        connectionOverlay.observeViewModel(this);
        viewModel.getMockEnabled().observe(this, enabled ->
                checkMockTop.setChecked(Boolean.TRUE.equals(enabled)));
        viewModel.getMockControlsEnabled().observe(this, enabled -> {
            boolean controlsEnabled = Boolean.TRUE.equals(enabled);
            btnAddWeightTop.setEnabled(controlsEnabled);
            float alpha = controlsEnabled ? 1.0f : 0.35f;
            btnAddWeightTop.setAlpha(alpha);
        });

        viewModel.getWeightData().observe(this, data -> {
            if (data == null) return;
            int weight = data.weight;
            boolean stable = data.stable;
            weightDisplay.setText(weight + " g");
            weightDisplay.setTextColor(ContextCompat.getColor(this,
                    stable ? R.color.weightStable : R.color.weightUnstable));
        });

        viewModel.getLogEntries().observe(this, entries -> {
            logEntries.clear();
            if (entries != null) {
                logEntries.addAll(entries);
            }
            logAdapter.setItems(logEntries);

            if (!isEditingLogEntry()) {
                return;
            }

            if (selectedLogIndex >= logEntries.size()) {
                clearLogItemEditing(false);
                return;
            }

            // Without stable IDs, any list rewrite can shift rows. Clear edit mode in that case.
            if (logEntries.get(selectedLogIndex) != selectedLogEntry) {
                clearLogItemEditing(true);
                return;
            }

            logAdapter.setSelectedPosition(selectedLogIndex);
        });
    }

    // --- Speech recognition (inline) ---

    private void onMicTap() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            micPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO);
            return;
        }
        speechRecognition.startListening();
    }

    private void setListeningState() {
        btnMic.setText(R.string.btn_cancel);
        refreshApplyButtonState();
    }

    private void setIdleState() {
        btnMic.setText(R.string.btn_mic);
        refreshApplyButtonState();
    }

    private void refreshApplyButtonState() {
        boolean isListening = speechRecognition != null && speechRecognition.isListening();
        String food = editFoodName.getText().toString().trim();
        boolean hasFood = !food.isEmpty();

        int actionsVisibility = hasFood ? View.VISIBLE : View.GONE;
        btnClearFood.setVisibility(actionsVisibility);
        btnApplyInline.setVisibility(actionsVisibility);
        btnApplyInline.setEnabled(hasFood && !isListening);
        textListeningOverlay.setVisibility(isListening ? View.VISIBLE : View.GONE);
    }

    private boolean isEditingLogEntry() {
        return selectedLogIndex != RecyclerView.NO_POSITION;
    }

    private void selectLogItemForEditing(int position) {
        if (position < 0 || position >= logEntries.size()) {
            return;
        }
        selectedLogIndex = position;
        selectedLogEntry = logEntries.get(position);
        logAdapter.setSelectedPosition(position);
        editFoodName.setText(selectedLogEntry.foodName);
        editFoodName.setSelection(editFoodName.getText().length());
        refreshApplyButtonState();
    }

    private void clearLogItemEditing(boolean clearInput) {
        selectedLogIndex = RecyclerView.NO_POSITION;
        selectedLogEntry = null;
        logAdapter.clearSelection();
        if (clearInput) {
            editFoodName.setText("");
        } else {
            refreshApplyButtonState();
        }
    }

    private boolean applySelectedLogEntryRename(String food) {
        if (food.isEmpty()) {
            Toast.makeText(this, R.string.toast_no_food, Toast.LENGTH_SHORT).show();
            return false;
        }
        if (!isEditingLogEntry()) {
            return false;
        }
        boolean renamed = viewModel.renameLogEntry(selectedLogIndex, food);
        if (renamed) {
            clearLogItemEditing(false);
        }
        return renamed;
    }

    // --- Calibration ---

    private void showCalibrationOverlay() {
        if (!viewModel.isConnected()) {
            Toast.makeText(this, R.string.toast_not_connected, Toast.LENGTH_SHORT).show();
            return;
        }
        calibrationOverlay.setVisibility(View.VISIBLE);
    }

    private void handleSetZero() {
        if (!viewModel.isConnected()) {
            Toast.makeText(this, R.string.toast_not_connected, Toast.LENGTH_SHORT).show();
            return;
        }
        viewModel.sendTare();
        Toast.makeText(this, R.string.toast_calib_zero_done, Toast.LENGTH_SHORT).show();
    }

    private void handleSetCalibWeight() {
        if (!viewModel.isConnected()) {
            Toast.makeText(this, R.string.toast_not_connected, Toast.LENGTH_SHORT).show();
            return;
        }
        String text = editCalibGrams.getText().toString().trim();
        if (text.isEmpty()) {
            Toast.makeText(this, R.string.toast_calib_no_weight, Toast.LENGTH_SHORT).show();
            return;
        }
        int grams;
        try {
            grams = Integer.parseInt(text);
        } catch (NumberFormatException e) {
            Toast.makeText(this, R.string.toast_calib_no_weight, Toast.LENGTH_SHORT).show();
            return;
        }
        if (grams <= 0) {
            Toast.makeText(this, R.string.toast_calib_no_weight, Toast.LENGTH_SHORT).show();
            return;
        }
        viewModel.sendCalibrate(grams);
        Toast.makeText(this, R.string.toast_calib_done, Toast.LENGTH_SHORT).show();
    }

    /** @return true if entry was added successfully */
    private boolean applyLogEntry(String food) {
        if (food.isEmpty()) {
            Toast.makeText(this, R.string.toast_no_food, Toast.LENGTH_SHORT).show();
            return false;
        }
        int weight = viewModel.getLastStableWeight();
        if (weight == 0) {
            Toast.makeText(this, R.string.toast_no_stable, Toast.LENGTH_SHORT).show();
            return false;
        }
        viewModel.addLogEntry(food, weight);
        viewModel.sendTare();
        return true;
    }

    @Override
    protected void onDestroy() {
        if (speechRecognition != null) {
            speechRecognition.release();
        }
        super.onDestroy();
    }
}
