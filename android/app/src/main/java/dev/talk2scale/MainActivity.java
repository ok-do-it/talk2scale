package dev.talk2scale;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Bundle;
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

public class MainActivity extends AppCompatActivity {

    private ScaleViewModel viewModel;

    private FrameLayout calibrationOverlay;
    private EditText editCalibGrams;
    private TextView weightDisplay;
    private LogAdapter logAdapter;
    private CheckBox checkMockTop;
    private ImageButton btnAddWeightTop;

    private SpeechOverlayController speechController;
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
                        speechController.startListening();
                    } else {
                        speechController.onPermissionDenied();
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
        Button btnMic = findViewById(R.id.btnMic);
        RecyclerView logRecycler = findViewById(R.id.logRecycler);

        calibrationOverlay = findViewById(R.id.calibrationOverlay);
        editCalibGrams = findViewById(R.id.editCalibGrams);
        ImageButton btnCloseCalibration = findViewById(R.id.btnCloseCalibration);
        Button btnSetZero = findViewById(R.id.btnSetZero);
        Button btnSetCalibWeight = findViewById(R.id.btnSetCalibWeight);

        speechController = new SpeechOverlayController(this, new SpeechOverlayController.Callback() {
            @Override
            public void onApply(String foodText) {
                if (applyLogEntry(foodText)) {
                    speechController.close();
                }
            }

            @Override
            public void onCancel() { }
        });
        speechController.bind(findViewById(R.id.main));

        connectionOverlay = new ConnectionOverlayController(
                this, viewModel, permissionLauncher, cdmLauncher);
        connectionOverlay.bind(findViewById(R.id.main));
        checkMockTop.setOnCheckedChangeListener((buttonView, isChecked) ->
                viewModel.setMockEnabled(isChecked));
        btnAddWeightTop.setOnClickListener(v -> viewModel.addMockWeight());
        btnConnectTop.setOnClickListener(v -> connectionOverlay.startConnectionFlow());
        btnCalibrateTop.setOnClickListener(v -> showCalibrationOverlay());
        btnTare.setOnClickListener(v -> viewModel.sendTare());
        btnMic.setOnClickListener(v -> openSpeechOverlay());

        btnCloseCalibration.setOnClickListener(v ->
                calibrationOverlay.setVisibility(View.GONE));
        btnSetZero.setOnClickListener(v -> handleSetZero());
        btnSetCalibWeight.setOnClickListener(v -> handleSetCalibWeight());

        logAdapter = new LogAdapter();
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

        viewModel.getLogEntries().observe(this, entries -> logAdapter.setItems(entries));
    }

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

    private void openSpeechOverlay() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            speechController.openWithoutListening();
            micPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO);
            return;
        }
        speechController.open();
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

}
