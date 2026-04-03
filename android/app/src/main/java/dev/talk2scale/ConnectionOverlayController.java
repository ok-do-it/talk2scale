package dev.talk2scale;

import androidx.annotation.StringRes;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import androidx.lifecycle.LifecycleOwner;

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
import android.os.ParcelUuid;
import android.util.Log;
import android.view.View;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

/** Self-contained controller for the connection overlay. */
public class ConnectionOverlayController {
    private static final String TAG = "ConnectionOverlay";
    private static final String PREFS_NAME = "talk2scale_prefs";
    private static final String KEY_MAC = "scale_mac";

    private final AppCompatActivity activity;
    private final ScaleViewModel viewModel;
    private final ActivityResultLauncher<String> permissionLauncher;
    private final ActivityResultLauncher<IntentSenderRequest> cdmLauncher;

    private FrameLayout root;
    private TextView statusView;
    private ProgressBar spinner;

    public ConnectionOverlayController(
            AppCompatActivity activity,
            ScaleViewModel viewModel,
            ActivityResultLauncher<String> permissionLauncher,
            ActivityResultLauncher<IntentSenderRequest> cdmLauncher
    ) {
        this.activity = activity;
        this.viewModel = viewModel;
        this.permissionLauncher = permissionLauncher;
        this.cdmLauncher = cdmLauncher;
    }

    /** Wire up views after the overlay layout has been inflated (via include). */
    public void bind(View rootView) {
        root = rootView.findViewById(R.id.connectionOverlay);
        statusView = root.findViewById(R.id.connectionStatus);
        spinner = root.findViewById(R.id.connectionSpinner);
        Button connectButton = root.findViewById(R.id.connectionBtnConnect);
        connectButton.setOnClickListener(v -> startConnectionFlow());
    }

    public void observeViewModel(LifecycleOwner owner) {
        viewModel.getConnectionState().observe(owner, state -> {
            if (state != BluetoothProfile.STATE_CONNECTED) {
                String mac = getStoredMac();
                if (mac != null && viewModel.isRealConnectionRequested()) {
                    setStatus(R.string.status_reconnecting);
                } else {
                    setStatus(R.string.status_searching);
                }
            }
        });
        viewModel.getShowConnectionOverlay().observe(owner,
                show -> setVisible(Boolean.TRUE.equals(show)));
    }

    public void startConnectionFlow() {
        viewModel.prepareForRealConnection();
        if (ContextCompat.checkSelfPermission(activity, Manifest.permission.BLUETOOTH_CONNECT)
                != PackageManager.PERMISSION_GRANTED) {
            permissionLauncher.launch(Manifest.permission.BLUETOOTH_CONNECT);
            return;
        }
        beginConnection();
    }

    public void onBluetoothPermissionResult(boolean granted) {
        if (granted) {
            beginConnection();
        } else {
            setStatus(R.string.status_permission_denied);
        }
    }

    public void onCdmResult(int resultCode, Intent data) {
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

    public void setVisible(boolean visible) {
        if (root == null) return;
        root.setVisibility(visible ? View.VISIBLE : View.GONE);
    }

    public void setStatus(int resId) {
        if (statusView == null) return;
        statusView.setText(resId);
        updateSpinnerForStatusRes(resId);
    }

    public void setStatus(CharSequence statusText) {
        if (statusView == null) return;
        statusView.setText(statusText);
        updateSpinnerForStatusText(statusText);
    }

    public void showSpinner(boolean visible) {
        if (spinner == null) return;
        spinner.setVisibility(visible ? View.VISIBLE : View.GONE);
    }

    @SuppressWarnings("MissingPermission")
    private void beginConnection() {
        String mac = getStoredMac();
        if (mac != null) {
            setStatus(R.string.status_reconnecting);
            BluetoothManager bm = activity.getSystemService(BluetoothManager.class);
            BluetoothAdapter adapter = bm == null ? null : bm.getAdapter();
            if (adapter != null) {
                BluetoothDevice device = adapter.getRemoteDevice(mac);
                viewModel.connectToRealDevice(activity, device, true);
            }
        } else {
            setStatus(R.string.status_searching);
            startAssociation();
        }
    }

    @SuppressWarnings("MissingPermission")
    private void startAssociation() {
        if (ContextCompat.checkSelfPermission(activity, Manifest.permission.BLUETOOTH_CONNECT)
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

        CompanionDeviceManager cdm = activity.getSystemService(CompanionDeviceManager.class);
        if (cdm == null) {
            setStatus("CompanionDeviceManager unavailable");
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
                activity.runOnUiThread(() -> setStatus(error));
            }
        }, null);
    }

    private String getStoredMac() {
        SharedPreferences prefs = activity.getSharedPreferences(PREFS_NAME, AppCompatActivity.MODE_PRIVATE);
        return prefs.getString(KEY_MAC, null);
    }

    @SuppressWarnings("MissingPermission")
    private void storeMac(String mac) {
        activity.getSharedPreferences(PREFS_NAME, AppCompatActivity.MODE_PRIVATE)
                .edit().putString(KEY_MAC, mac).apply();
    }

    private void updateSpinnerForStatusRes(@StringRes int statusResId) {
        boolean showSpinner = statusResId == R.string.status_searching
                || statusResId == R.string.status_reconnecting;
        showSpinner(showSpinner);
    }

    private void updateSpinnerForStatusText(CharSequence statusText) {
        if (statusText == null) {
            showSpinner(false);
            return;
        }
        CharSequence searching = statusView.getContext().getText(R.string.status_searching);
        CharSequence reconnecting = statusView.getContext().getText(R.string.status_reconnecting);
        boolean showSpinner = statusText.toString().contentEquals(searching)
                || statusText.toString().contentEquals(reconnecting);
        showSpinner(showSpinner);
    }
}
