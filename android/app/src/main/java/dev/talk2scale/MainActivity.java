package dev.talk2scale;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.companion.AssociationRequest;
import android.companion.BluetoothLeDeviceFilter;
import android.companion.CompanionDeviceManager;
import android.content.IntentSender;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.os.ParcelUuid;
import android.util.Log;
import android.view.View;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.ProgressBar;
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

    private static final String TAG = "MainActivity";
    private static final String PREFS_NAME = "talk2scale_prefs";
    private static final String KEY_MAC = "scale_mac";

    private ScaleViewModel viewModel;

    private FrameLayout overlay;
    private TextView overlayStatus;
    private ProgressBar overlaySpinner;
    private FrameLayout calibrationOverlay;
    private EditText editCalibGrams;
    private TextView weightDisplay;
    private LogAdapter logAdapter;
    private CheckBox checkMockTop;
    private ImageButton btnAddWeightTop;

    private SpeechOverlayController speechController;
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
                new ActivityResultContracts.RequestPermission(), granted -> {
                    if (granted) {
                        beginConnection();
                    } else {
                        overlayStatus.setText(R.string.status_permission_denied);
                        overlaySpinner.setVisibility(View.GONE);
                    }
                });

        micPermissionLauncher = registerForActivityResult(
                new ActivityResultContracts.RequestPermission(), granted -> {
                    if (granted) {
                        speechController.startListening();
                    } else {
                        speechController.onPermissionDenied();
                    }
                });

        cdmLauncher = registerForActivityResult(
                new ActivityResultContracts.StartIntentSenderForResult(), result -> {
                    if (result.getResultCode() == RESULT_OK && result.getData() != null) {
                        android.bluetooth.le.ScanResult scanResult = result.getData()
                                .getParcelableExtra(CompanionDeviceManager.EXTRA_DEVICE,
                                        android.bluetooth.le.ScanResult.class);
                        if (scanResult != null) {
                            BluetoothDevice device = scanResult.getDevice();
                            connectToDevice(device, false);
                            storeMac(device.getAddress());
                        }
                    }
                });
    }

    private void bindViews() {
        overlay = findViewById(R.id.overlay);
        overlayStatus = findViewById(R.id.overlayStatus);
        overlaySpinner = findViewById(R.id.overlaySpinner);
        weightDisplay = findViewById(R.id.weightDisplay);

        Button btnConnectOverlay = findViewById(R.id.btnConnectOverlay);
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

        btnConnectOverlay.setOnClickListener(v -> startConnectionFlow());
        checkMockTop.setOnCheckedChangeListener((buttonView, isChecked) ->
                viewModel.setMockEnabled(isChecked));
        btnAddWeightTop.setOnClickListener(v -> viewModel.addMockWeight());
        btnConnectTop.setOnClickListener(v -> startConnectionFlow());
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
        viewModel.getConnectionState().observe(this, state -> {
            if (state != BluetoothProfile.STATE_CONNECTED) {
                overlaySpinner.setVisibility(View.VISIBLE);
                String mac = getStoredMac();
                if (mac != null && viewModel.isRealConnectionRequested()) {
                    overlayStatus.setText(R.string.status_reconnecting);
                } else {
                    overlayStatus.setText(R.string.status_searching);
                }
            }
        });
        viewModel.getShowConnectionOverlay().observe(this,
                show -> overlay.setVisibility(Boolean.TRUE.equals(show) ? View.VISIBLE : View.GONE));
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

    private void startConnectionFlow() {
        viewModel.prepareForRealConnection();
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT)
                != PackageManager.PERMISSION_GRANTED) {
            permissionLauncher.launch(Manifest.permission.BLUETOOTH_CONNECT);
            return;
        }
        beginConnection();
    }

    @SuppressWarnings("MissingPermission")
    private void beginConnection() {
        String mac = getStoredMac();
        if (mac != null) {
            overlayStatus.setText(R.string.status_reconnecting);
            BluetoothManager bm = getSystemService(BluetoothManager.class);
            BluetoothAdapter adapter = bm.getAdapter();
            if (adapter != null) {
                BluetoothDevice device = adapter.getRemoteDevice(mac);
                connectToDevice(device, true);
            }
        } else {
            overlayStatus.setText(R.string.status_searching);
            startAssociation();
        }
    }

    @SuppressWarnings("MissingPermission")
    private void startAssociation() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT)
                != PackageManager.PERMISSION_GRANTED) {
            permissionLauncher.launch(Manifest.permission.BLUETOOTH_CONNECT);
            return;
        }

        BluetoothLeDeviceFilter filter = new BluetoothLeDeviceFilter.Builder()
                .setScanFilter(new android.bluetooth.le.ScanFilter.Builder()
                        .setServiceUuid(new ParcelUuid(ScaleViewModel.SERVICE_UUID))
                        .build())
                .build();

        AssociationRequest request = new AssociationRequest.Builder()
                .addDeviceFilter(filter)
                .setSingleDevice(true)
                .build();

        CompanionDeviceManager cdm = getSystemService(CompanionDeviceManager.class);
        cdm.associate(request, new CompanionDeviceManager.Callback() {
            @Override
            public void onDeviceFound(IntentSender chooserLauncher) {
                cdmLauncher.launch(new IntentSenderRequest.Builder(chooserLauncher).build());
            }

            @Override
            public void onFailure(CharSequence error) {
                Log.e(TAG, "CDM associate failed: " + error);
                runOnUiThread(() -> {
                    overlayStatus.setText(error);
                    overlaySpinner.setVisibility(View.GONE);
                });
            }
        }, null);
    }

    @SuppressWarnings("MissingPermission")
    private void connectToDevice(BluetoothDevice device, boolean autoConnect) {
        viewModel.connectToRealDevice(this, device, autoConnect);
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

    private String getStoredMac() {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        return prefs.getString(KEY_MAC, null);
    }

    @SuppressWarnings("MissingPermission")
    private void storeMac(String mac) {
        getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                .edit().putString(KEY_MAC, mac).apply();
    }
}
