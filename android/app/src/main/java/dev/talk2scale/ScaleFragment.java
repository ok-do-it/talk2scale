package dev.talk2scale;

import android.Manifest;
import android.app.Activity;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.companion.AssociationRequest;
import android.companion.BluetoothLeDeviceFilter;
import android.companion.CompanionDeviceManager;
import android.content.Intent;
import android.content.IntentSender;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.os.ParcelUuid;
import android.util.Log;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.Fragment;
import androidx.lifecycle.ViewModelProvider;
import androidx.navigation.Navigation;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import java.util.ArrayList;
import java.util.List;

public class ScaleFragment extends Fragment {

    private static final String TAG = "ScaleFragment";
    private static final String PREFS_NAME = "talk2scale_prefs";
    private static final String KEY_MAC = "scale_mac";
    public static final String ARG_AUTO_OPEN_CONNECTION = "autoOpenConnection";

    private ScaleViewModel viewModel;
    private AppCompatActivity activity;

    private ActivityResultLauncher<String> micPermLauncher;
    private ActivityResultLauncher<String> bluetoothPermLauncher;
    private ActivityResultLauncher<IntentSenderRequest> cdmLauncher;

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

    private FrameLayout connectionOverlay;
    private TextView connectionStatus;
    private ProgressBar connectionSpinner;
    private Button connectionBtnConnect;
    private Button connectionBtnDisconnect;
    private Button connectionBtnForgetAll;
    private Button connectionBtnClose;
    private boolean autoCloseOnConnected;
    private boolean returnToCallerOnOverlayBack;

    private final List<LogEntry> logEntries = new ArrayList<>();
    private int selectedLogIndex = RecyclerView.NO_POSITION;
    private LogEntry selectedLogEntry;

    public ScaleFragment() {
        super(R.layout.fragment_scale);
    }

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container,
                             @Nullable Bundle savedInstanceState) {
        return inflater.inflate(R.layout.fragment_scale, container, false);
    }

    @Override
    public void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        micPermLauncher = registerForActivityResult(
                new ActivityResultContracts.RequestPermission(),
                this::onMicPermissionResult);
        bluetoothPermLauncher = registerForActivityResult(
                new ActivityResultContracts.RequestPermission(),
                this::onBluetoothPermissionResult);
        cdmLauncher = registerForActivityResult(
                new ActivityResultContracts.StartIntentSenderForResult(),
                result -> onCdmResult(result.getResultCode(), result.getData()));
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        super.onViewCreated(view, savedInstanceState);
        activity = (AppCompatActivity) requireActivity();
        viewModel = new ViewModelProvider(requireActivity()).get(ScaleViewModel.class);
        bind(view);
        registerBackHandler();
        observeViewModel();
        boolean autoOpenConnection = getArguments() != null
                && getArguments().getBoolean(ARG_AUTO_OPEN_CONNECTION, false);
        if (savedInstanceState == null && autoOpenConnection) {
            showConnectionOverlay(true);
        }
    }

    @Override
    public void onDestroyView() {
        if (speechRecognition != null) {
            speechRecognition.release();
            speechRecognition = null;
        }
        activity = null;
        super.onDestroyView();
    }

    private void bind(View scaleRoot) {
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

        calibrationOverlay = scaleRoot.findViewById(R.id.calibrationOverlay);
        editCalibGrams = scaleRoot.findViewById(R.id.editCalibGrams);
        ImageButton btnCloseCalibration = scaleRoot.findViewById(R.id.btnCloseCalibration);
        Button btnSetZero = scaleRoot.findViewById(R.id.btnSetZero);
        Button btnSetCalibWeight = scaleRoot.findViewById(R.id.btnSetCalibWeight);

        connectionOverlay = scaleRoot.findViewById(R.id.connectionOverlay);
        connectionStatus = scaleRoot.findViewById(R.id.connectionStatus);
        connectionSpinner = scaleRoot.findViewById(R.id.connectionSpinner);
        connectionBtnConnect = scaleRoot.findViewById(R.id.connectionBtnConnect);
        connectionBtnDisconnect = scaleRoot.findViewById(R.id.connectionBtnDisconnect);
        connectionBtnForgetAll = scaleRoot.findViewById(R.id.connectionBtnForgetAll);
        connectionBtnClose = scaleRoot.findViewById(R.id.connectionBtnClose);

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
        btnConnectTop.setOnClickListener(v -> showConnectionOverlay(false));
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

        connectionBtnConnect.setOnClickListener(v -> startConnectionFlow());
        connectionBtnDisconnect.setOnClickListener(v -> {
            viewModel.disconnect();
            viewModel.setMockEnabled(true);
            viewModel.hideOverlay();
        });
        connectionBtnForgetAll.setOnClickListener(v -> {
            clearStoredMac();
            Toast.makeText(activity, "Stored device forgotten", Toast.LENGTH_SHORT).show();
        });
        connectionBtnClose.setOnClickListener(v -> {
            handleConnectionOverlayBack();
        });

        Integer state = viewModel.getConnectionState().getValue();
        updateConnectionButtonStates(state == null ? BluetoothProfile.STATE_DISCONNECTED : state);

        logAdapter = new LogAdapter();
        logAdapter.setOnItemClickListener(this::selectLogItemForEditing);
        logRecycler.setLayoutManager(new LinearLayoutManager(activity));
        logRecycler.setAdapter(logAdapter);
    }

    private void observeViewModel() {
        viewModel.getMockEnabled().observe(getViewLifecycleOwner(), enabled ->
                checkMockTop.setChecked(Boolean.TRUE.equals(enabled)));

        viewModel.getWeightData().observe(getViewLifecycleOwner(), data -> {
            if (data == null) return;
            weightDisplay.setText(data.weight + " g");
            weightDisplay.setTextColor(ContextCompat.getColor(activity,
                    data.stable ? R.color.weightStable : R.color.weightUnstable));
        });

        viewModel.getLogEntries().observe(getViewLifecycleOwner(), entries -> {
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

        viewModel.getConnectionState().observe(getViewLifecycleOwner(), state -> {
            if (state == BluetoothProfile.STATE_CONNECTED) {
                setConnectionStatus("Connected", false);
                if (autoCloseOnConnected) {
                    autoCloseOnConnected = false;
                    viewModel.hideOverlay();
                }
            } else if (viewModel.isRealConnectionRequested()) {
                String mac = getStoredMac();
                setConnectionStatus(mac != null ? "Reconnecting..." : "Searching for scale...", true);
            }
            updateConnectionButtonStates(state);
        });
        viewModel.getShowConnectionOverlay().observe(
                getViewLifecycleOwner(),
                show -> setConnectionOverlayVisible(Boolean.TRUE.equals(show))
        );
    }

    private void onMicPermissionResult(boolean granted) {
        if (granted) {
            speechRecognition.startListening();
        } else {
            Toast.makeText(activity, "Microphone permission denied", Toast.LENGTH_SHORT).show();
        }
    }

    private void onMicTap() {
        if (ContextCompat.checkSelfPermission(activity, Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            micPermLauncher.launch(Manifest.permission.RECORD_AUDIO);
            return;
        }
        speechRecognition.startListening();
    }

    private void showConnectionOverlay(boolean returnToCaller) {
        returnToCallerOnOverlayBack = returnToCaller;
        if (viewModel.isConnected()) {
            autoCloseOnConnected = false;
            viewModel.showOverlay();
        } else {
            autoCloseOnConnected = true;
            startConnectionFlow();
        }
    }

    private void startConnectionFlow() {
        autoCloseOnConnected = true;
        viewModel.showOverlay();
        viewModel.prepareForRealConnection();
        if (ContextCompat.checkSelfPermission(activity, Manifest.permission.BLUETOOTH_CONNECT)
                != PackageManager.PERMISSION_GRANTED) {
            bluetoothPermLauncher.launch(Manifest.permission.BLUETOOTH_CONNECT);
            return;
        }
        beginConnection();
    }

    private void onBluetoothPermissionResult(boolean granted) {
        if (granted) {
            beginConnection();
        } else {
            setConnectionStatus("Bluetooth permission denied", false);
        }
    }

    private void onCdmResult(int resultCode, Intent data) {
        if (resultCode != Activity.RESULT_OK || data == null) {
            return;
        }
        android.bluetooth.le.ScanResult scanResult = data.getParcelableExtra(
                CompanionDeviceManager.EXTRA_DEVICE, android.bluetooth.le.ScanResult.class);
        if (scanResult == null) {
            return;
        }
        BluetoothDevice device = scanResult.getDevice();
        viewModel.connectToRealDevice(activity, device, false);
        storeMac(device.getAddress());
    }

    private void setConnectionOverlayVisible(boolean visible) {
        if (connectionOverlay == null) return;
        connectionOverlay.setVisibility(visible ? View.VISIBLE : View.GONE);
        if (!visible) {
            autoCloseOnConnected = false;
            returnToCallerOnOverlayBack = false;
        }
    }

    private void registerBackHandler() {
        requireActivity().getOnBackPressedDispatcher().addCallback(
                getViewLifecycleOwner(),
                new OnBackPressedCallback(true) {
                    @Override
                    public void handleOnBackPressed() {
                        if (connectionOverlay != null
                                && connectionOverlay.getVisibility() == View.VISIBLE) {
                            handleConnectionOverlayBack();
                            return;
                        }
                        setEnabled(false);
                        requireActivity().getOnBackPressedDispatcher().onBackPressed();
                    }
                }
        );
    }

    private void handleConnectionOverlayBack() {
        if (viewModel.isConnectionInProgress()) {
            viewModel.cancelConnection();
        }
        boolean returnToCaller = returnToCallerOnOverlayBack;
        autoCloseOnConnected = false;
        viewModel.hideOverlay();
        if (returnToCaller && isAdded()) {
            Navigation.findNavController(requireView()).popBackStack();
        }
    }

    private void showConnectionSpinner(boolean visible) {
        if (connectionSpinner == null) return;
        connectionSpinner.setVisibility(visible ? View.VISIBLE : View.GONE);
    }

    @SuppressWarnings("MissingPermission")
    private void beginConnection() {
        String mac = getStoredMac();
        if (mac != null) {
            setConnectionStatus("Reconnecting...", true);
            BluetoothManager bm = activity.getSystemService(BluetoothManager.class);
            BluetoothAdapter adapter = bm == null ? null : bm.getAdapter();
            if (adapter != null) {
                BluetoothDevice device = adapter.getRemoteDevice(mac);
                viewModel.connectToRealDevice(activity, device, true);
            }
        } else {
            setConnectionStatus("Searching for scale...", true);
            startAssociation();
        }
    }

    @SuppressWarnings("MissingPermission")
    private void startAssociation() {
        if (ContextCompat.checkSelfPermission(activity, Manifest.permission.BLUETOOTH_CONNECT)
                != PackageManager.PERMISSION_GRANTED) {
            bluetoothPermLauncher.launch(Manifest.permission.BLUETOOTH_CONNECT);
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

        CompanionDeviceManager cdm = activity.getSystemService(CompanionDeviceManager.class);
        if (cdm == null) {
            setConnectionStatus("CompanionDeviceManager unavailable", false);
            return;
        }
        cdm.associate(request, new CompanionDeviceManager.Callback() {
            @Override
            public void onDeviceFound(IntentSender chooserLauncher) {
                cdmLauncher.launch(new IntentSenderRequest.Builder(chooserLauncher).build());
            }

            @Override
            public void onFailure(CharSequence error) {
                Log.e(TAG, "CDM associate failed: " + error);
                activity.runOnUiThread(() -> setConnectionStatus(error, false));
            }
        }, null);
    }

    private String getStoredMac() {
        SharedPreferences prefs =
                activity.getSharedPreferences(PREFS_NAME, AppCompatActivity.MODE_PRIVATE);
        return prefs.getString(KEY_MAC, null);
    }

    private void storeMac(String mac) {
        activity.getSharedPreferences(PREFS_NAME, AppCompatActivity.MODE_PRIVATE)
                .edit()
                .putString(KEY_MAC, mac)
                .apply();
    }

    private void clearStoredMac() {
        activity.getSharedPreferences(PREFS_NAME, AppCompatActivity.MODE_PRIVATE)
                .edit()
                .remove(KEY_MAC)
                .apply();
    }

    private void updateConnectionButtonStates(int bleState) {
        boolean connected = bleState == BluetoothProfile.STATE_CONNECTED;
        boolean inProgress = viewModel.isConnectionInProgress();

        connectionBtnConnect.setEnabled(!connected && !inProgress);
        connectionBtnDisconnect.setEnabled(connected);
        connectionBtnForgetAll.setEnabled(!inProgress);
        updateCloseButtonCaption(inProgress);
    }

    private void updateCloseButtonCaption(boolean connecting) {
        if (connectionBtnClose == null) return;
        connectionBtnClose.setText(connecting ? "Cancel" : "Back");
    }

    private void setConnectionStatus(CharSequence statusText, boolean connecting) {
        if (connectionStatus == null) return;
        connectionStatus.setText(statusText);
        applyConnectionStatusUi(connecting);
    }

    private void applyConnectionStatusUi(boolean connecting) {
        showConnectionSpinner(connecting);
        updateCloseButtonCaption(connecting);
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
