package dev.talk2scale;

import android.Manifest;
import android.app.Activity;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.companion.AssociationInfo;
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
import android.view.View;
import android.widget.Button;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

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

public class ConnectionFragment extends Fragment {

    private static final String TAG = "ConnectionFragment";
    private static final String PREFS_NAME = "talk2scale_prefs";
    private static final String KEY_MAC = "scale_mac";

    public static final String ARG_CALLER = "caller";
    public static final String ARG_AUTO_START_CONNECT = "autoStartConnect";
    public static final String CALLER_HOME = "home";
    public static final String CALLER_SCALE = "scale";

    private AppCompatActivity activity;
    private ScaleViewModel viewModel;

    private ActivityResultLauncher<String> bluetoothPermLauncher;
    private ActivityResultLauncher<IntentSenderRequest> cdmLauncher;

    private TextView connectionStatus;
    private ProgressBar connectionSpinner;
    private Button connectionBtnConnect;
    private Button connectionBtnDisconnect;
    private Button connectionBtnForgetAll;
    private Button connectionBtnClose;

    private boolean wasConnectedOnEntry;
    private boolean attemptedConnectThisSession;
    private boolean didAutoReturn;

    public ConnectionFragment() {
        super(R.layout.view_connection_overlay);
    }

    @Override
    public void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
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
        wasConnectedOnEntry = viewModel.isConnected();
        bind(view);
        observeViewModel();

        boolean autoStartConnect = getArguments() != null
                && getArguments().getBoolean(ARG_AUTO_START_CONNECT, false);
        if (autoStartConnect && !wasConnectedOnEntry) {
            startConnectionFlow();
        } else if (wasConnectedOnEntry) {
            setConnectionStatus("Connected", false);
        } else {
            String mac = getStoredMac();
            setConnectionStatus(mac != null ? "Reconnecting..." : "Searching for scale...", false);
        }
    }

    private void bind(View root) {
        connectionStatus = root.findViewById(R.id.connectionStatus);
        connectionSpinner = root.findViewById(R.id.connectionSpinner);
        connectionBtnConnect = root.findViewById(R.id.connectionBtnConnect);
        connectionBtnDisconnect = root.findViewById(R.id.connectionBtnDisconnect);
        connectionBtnForgetAll = root.findViewById(R.id.connectionBtnForgetAll);
        connectionBtnClose = root.findViewById(R.id.connectionBtnClose);

        connectionBtnConnect.setOnClickListener(v -> startConnectionFlow());
        connectionBtnDisconnect.setOnClickListener(v -> {
            viewModel.disconnect();
            viewModel.setMockEnabled(true);
        });
        connectionBtnForgetAll.setOnClickListener(v -> {
            clearStoredMac();
            Toast.makeText(activity, "Stored device forgotten", Toast.LENGTH_SHORT).show();
        });
        connectionBtnClose.setOnClickListener(v -> {
            if (viewModel.isConnectionInProgress()) {
                viewModel.cancelConnection();
            }
            Navigation.findNavController(v).popBackStack();
        });

        Integer state = viewModel.getConnectionState().getValue();
        updateConnectionButtonStates(state == null ? BluetoothProfile.STATE_DISCONNECTED : state);
    }

    private void observeViewModel() {
        viewModel.getConnectionState().observe(getViewLifecycleOwner(), state -> {
            if (state == BluetoothProfile.STATE_CONNECTED) {
                setConnectionStatus("Connected", false);
                maybeAutoReturnAfterConnect();
            } else if (viewModel.isRealConnectionRequested()) {
                String mac = getStoredMac();
                setConnectionStatus(mac != null ? "Reconnecting..." : "Searching for scale...", true);
            }
            updateConnectionButtonStates(state);
        });
    }

    private void maybeAutoReturnAfterConnect() {
        if (didAutoReturn || wasConnectedOnEntry || !attemptedConnectThisSession || !isAdded()) {
            return;
        }
        didAutoReturn = true;
        Navigation.findNavController(requireView()).popBackStack();
    }

    private void startConnectionFlow() {
        attemptedConnectThisSession = true;
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
        AssociationInfo associationInfo = data.getParcelableExtra(
                CompanionDeviceManager.EXTRA_ASSOCIATION, AssociationInfo.class);
        if (associationInfo == null || associationInfo.getDeviceMacAddress() == null) {
            return;
        }
        BluetoothManager bm = activity.getSystemService(BluetoothManager.class);
        BluetoothAdapter adapter = bm == null ? null : bm.getAdapter();
        if (adapter == null) {
            return;
        }
        BluetoothDevice device = adapter.getRemoteDevice(
                associationInfo.getDeviceMacAddress().toString());
        viewModel.connectToRealDevice(activity, device, false);
        storeMac(device.getAddress());
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
        cdm.associate(request, activity.getMainExecutor(), new CompanionDeviceManager.Callback() {
            @Override
            public void onAssociationPending(IntentSender chooserLauncher) {
                cdmLauncher.launch(new IntentSenderRequest.Builder(chooserLauncher).build());
            }

            @Override
            public void onFailure(CharSequence error) {
                Log.e(TAG, "CDM associate failed: " + error);
                activity.runOnUiThread(() -> setConnectionStatus(error, false));
            }
        });
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
        connectionSpinner.setVisibility(connecting ? View.VISIBLE : View.GONE);
        updateCloseButtonCaption(connecting);
    }
}
