package dev.talk2scale;

import android.Manifest;
import android.content.pm.PackageManager;
import android.view.View;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import androidx.lifecycle.LifecycleOwner;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import java.util.ArrayList;
import java.util.List;

/** Self-contained controller for the scale screen. */
public class ScaleScreenController {

    private final AppCompatActivity activity;
    private final ScaleViewModel viewModel;
    private final ActivityResultLauncher<String> micPermLauncher;

    private FrameLayout calibrationOverlay;
    private EditText editCalibGrams;
    private TextView weightDisplay;
    private LogAdapter logAdapter;
    private CheckBox checkMockTop;

    private EditText editFoodName;
    private Button btnMic;
    private ImageButton btnClearFood;
    private ImageButton btnApplyInline;
    private TextView textListeningOverlay;
    private SpeechRecognition speechRecognition;

    private final List<LogEntry> logEntries = new ArrayList<>();
    private int selectedLogIndex = RecyclerView.NO_POSITION;
    private LogEntry selectedLogEntry;

    public ScaleScreenController(
            AppCompatActivity activity,
            ScaleViewModel viewModel,
            ActivityResultLauncher<String> micPermLauncher) {
        this.activity = activity;
        this.viewModel = viewModel;
        this.micPermLauncher = micPermLauncher;
    }

    public void bind(View scaleRoot, Runnable onConnectTap) {
        weightDisplay = scaleRoot.findViewById(R.id.weightDisplay);
        checkMockTop = scaleRoot.findViewById(R.id.checkMockTop);
        ImageButton btnConnectTop = scaleRoot.findViewById(R.id.btnConnectTop);
        ImageButton btnCalibrateTop = scaleRoot.findViewById(R.id.btnCalibrateTop);
        Button btnTare = scaleRoot.findViewById(R.id.btnTare);
        btnMic = scaleRoot.findViewById(R.id.btnMic);
        editFoodName = scaleRoot.findViewById(R.id.editFoodName);
        btnClearFood = scaleRoot.findViewById(R.id.btnClearFood);
        btnApplyInline = scaleRoot.findViewById(R.id.btnApplyInline);
        textListeningOverlay = scaleRoot.findViewById(R.id.textListeningOverlay);
        RecyclerView logRecycler = scaleRoot.findViewById(R.id.logRecycler);

        calibrationOverlay = scaleRoot.getRootView().findViewById(R.id.calibrationOverlay);
        editCalibGrams = scaleRoot.getRootView().findViewById(R.id.editCalibGrams);
        ImageButton btnCloseCalibration = scaleRoot.getRootView().findViewById(R.id.btnCloseCalibration);
        Button btnSetZero = scaleRoot.getRootView().findViewById(R.id.btnSetZero);
        Button btnSetCalibWeight = scaleRoot.getRootView().findViewById(R.id.btnSetCalibWeight);

        speechRecognition = new SpeechRecognition(activity, new SpeechRecognition.Callback() {
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
                Toast.makeText(activity, "Could not recognise speech - try again",
                        Toast.LENGTH_SHORT).show();
            }

            @Override
            public void onUnavailable() {
                Toast.makeText(activity, "Speech recognition not available on this device",
                        Toast.LENGTH_SHORT).show();
            }
        });

        checkMockTop.setOnCheckedChangeListener((buttonView, isChecked) ->
                viewModel.setMockEnabled(isChecked));
        weightDisplay.setOnClickListener(v -> viewModel.addMockWeight());
        btnConnectTop.setOnClickListener(v -> onConnectTap.run());
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

        editFoodName.addTextChangedListener(new android.text.TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) { }
            @Override public void onTextChanged(CharSequence s, int start, int before, int count) {
                refreshApplyButtonState();
            }
            @Override public void afterTextChanged(android.text.Editable s) { }
        });
        refreshApplyButtonState();

        btnCloseCalibration.setOnClickListener(v ->
                calibrationOverlay.setVisibility(View.GONE));
        btnSetZero.setOnClickListener(v -> handleSetZero());
        btnSetCalibWeight.setOnClickListener(v -> handleSetCalibWeight());

        logAdapter = new LogAdapter();
        logAdapter.setOnItemClickListener(this::selectLogItemForEditing);
        logRecycler.setLayoutManager(new LinearLayoutManager(activity));
        logRecycler.setAdapter(logAdapter);
    }

    public void observeViewModel(LifecycleOwner owner) {
        viewModel.getMockEnabled().observe(owner, enabled ->
                checkMockTop.setChecked(Boolean.TRUE.equals(enabled)));

        viewModel.getWeightData().observe(owner, data -> {
            if (data == null) return;
            weightDisplay.setText(data.weight + " g");
            weightDisplay.setTextColor(ContextCompat.getColor(activity,
                    data.stable ? R.color.weightStable : R.color.weightUnstable));
        });

        viewModel.getLogEntries().observe(owner, entries -> {
            logEntries.clear();
            if (entries != null) {
                logEntries.addAll(entries);
            }
            logAdapter.setItems(logEntries);

            if (!isEditingLogEntry()) return;

            if (selectedLogIndex >= logEntries.size()) {
                clearLogItemEditing(false);
                return;
            }

            if (logEntries.get(selectedLogIndex) != selectedLogEntry) {
                clearLogItemEditing(true);
                return;
            }

            logAdapter.setSelectedPosition(selectedLogIndex);
        });
    }

    public void onMicPermissionResult(boolean granted) {
        if (granted) {
            speechRecognition.startListening();
        } else {
            Toast.makeText(activity, "Microphone permission denied", Toast.LENGTH_SHORT).show();
        }
    }

    public void release() {
        if (speechRecognition != null) {
            speechRecognition.release();
        }
    }

    // --- Speech recognition ---

    private void onMicTap() {
        if (ContextCompat.checkSelfPermission(activity, Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            micPermLauncher.launch(Manifest.permission.RECORD_AUDIO);
            return;
        }
        speechRecognition.startListening();
    }

    private void setListeningState() {
        btnMic.setText("CANCEL");
        refreshApplyButtonState();
    }

    private void setIdleState() {
        btnMic.setText("Voice Input");
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

    // --- Log editing ---

    private boolean isEditingLogEntry() {
        return selectedLogIndex != RecyclerView.NO_POSITION;
    }

    private void selectLogItemForEditing(int position) {
        if (position < 0 || position >= logEntries.size()) return;
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
            Toast.makeText(activity, "Enter a food name first", Toast.LENGTH_SHORT).show();
            return false;
        }
        if (!isEditingLogEntry()) return false;
        boolean renamed = viewModel.renameLogEntry(selectedLogIndex, food);
        if (renamed) clearLogItemEditing(false);
        return renamed;
    }

    // --- Calibration ---

    private void showCalibrationOverlay() {
        if (!viewModel.isConnected()) {
            Toast.makeText(activity, "Scale not connected", Toast.LENGTH_SHORT).show();
            return;
        }
        calibrationOverlay.setVisibility(View.VISIBLE);
    }

    private void handleSetZero() {
        if (!viewModel.isConnected()) {
            Toast.makeText(activity, "Scale not connected", Toast.LENGTH_SHORT).show();
            return;
        }
        viewModel.sendTare();
        Toast.makeText(activity, "Zero set", Toast.LENGTH_SHORT).show();
    }

    private void handleSetCalibWeight() {
        if (!viewModel.isConnected()) {
            Toast.makeText(activity, "Scale not connected", Toast.LENGTH_SHORT).show();
            return;
        }
        String text = editCalibGrams.getText().toString().trim();
        if (text.isEmpty()) {
            Toast.makeText(activity, "Enter a weight in grams", Toast.LENGTH_SHORT).show();
            return;
        }
        int grams;
        try {
            grams = Integer.parseInt(text);
        } catch (NumberFormatException e) {
            Toast.makeText(activity, "Enter a weight in grams", Toast.LENGTH_SHORT).show();
            return;
        }
        if (grams <= 0) {
            Toast.makeText(activity, "Enter a weight in grams", Toast.LENGTH_SHORT).show();
            return;
        }
        viewModel.sendCalibrate(grams);
        Toast.makeText(activity, "Calibration sent", Toast.LENGTH_SHORT).show();
    }

    private boolean applyLogEntry(String food) {
        if (food.isEmpty()) {
            Toast.makeText(activity, "Enter a food name first", Toast.LENGTH_SHORT).show();
            return false;
        }
        int weight = viewModel.getLastStableWeight();
        if (weight == 0) {
            Toast.makeText(activity, "No stable weight reading yet", Toast.LENGTH_SHORT).show();
            return false;
        }
        viewModel.addLogEntry(food, weight);
        viewModel.sendTare();
        return true;
    }
}
