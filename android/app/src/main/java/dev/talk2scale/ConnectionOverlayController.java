package dev.talk2scale;

import androidx.annotation.StringRes;

import android.view.View;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

/** Self-contained controller for the connection overlay. */
public class ConnectionOverlayController {

    public interface Callback {
        void onConnectClicked();
    }

    private final Callback callback;

    private FrameLayout root;
    private TextView statusView;
    private ProgressBar spinner;

    public ConnectionOverlayController(Callback callback) {
        this.callback = callback;
    }

    /** Wire up views after the overlay layout has been inflated (via include). */
    public void bind(View rootView) {
        root = rootView.findViewById(R.id.connectionOverlay);
        statusView = root.findViewById(R.id.connectionStatus);
        spinner = root.findViewById(R.id.connectionSpinner);
        Button connectButton = root.findViewById(R.id.connectionBtnConnect);
        connectButton.setOnClickListener(v -> callback.onConnectClicked());
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
