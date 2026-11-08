package com.smartwealth.nepse;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.widget.Toast;
import android.app.PendingIntent;
import android.media.RingtoneManager;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.view.WindowCompat;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import com.getcapacitor.BridgeActivity;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;

public class MainActivity extends BridgeActivity {
    private static volatile boolean isAppInForeground = false;
    private static volatile String pendingNotificationPayload = null;

    public static boolean isForeground() {
        return isAppInForeground;
    }

    @Override
    public void onResume() {
        super.onResume();
        isAppInForeground = true;
    }

    @Override
    public void onPause() {
        super.onPause();
        isAppInForeground = false;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        isAppInForeground = true;
        try {
            Window window = getWindow();
            window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS);
            window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
            window.setStatusBarColor(Color.parseColor("#080c14"));
            window.setNavigationBarColor(Color.parseColor("#080c14"));
            WindowCompat.setDecorFitsSystemWindows(window, true);
        } catch (Exception ignored) {}

        // Ensure Android Notification Channels exist at OS level
        DravyashreeAlertWorker.ensureNotificationChannels(this);

        // Request POST_NOTIFICATIONS runtime permission on Android 13+ (API 33+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.POST_NOTIFICATIONS}, 101);
            }
        }

        // Schedule Native Android WorkManager to deliver status bar alerts even when app is closed!
        try {
            Constraints constraints = new Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build();

            PeriodicWorkRequest periodicWork = new PeriodicWorkRequest.Builder(
                    DravyashreeAlertWorker.class,
                    15,
                    TimeUnit.MINUTES
            )
            .setConstraints(constraints)
            .build();

            WorkManager.getInstance(this).enqueueUniquePeriodicWork(
                    "dravyashree_closed_app_alerts",
                    ExistingPeriodicWorkPolicy.KEEP,
                    periodicWork
            );
        } catch (Exception e) {
            android.util.Log.w("MainActivity", "WorkManager schedule notice: " + e.getMessage());
        }

        // Invalidate Android WebView disk & memory cache and register native file downloader bridge
        try {
            if (this.bridge != null && this.bridge.getWebView() != null) {
                this.bridge.getWebView().clearCache(true);
                this.bridge.getWebView().addJavascriptInterface(new NepseAndroidDownloader(), "NepseAndroidDownloader");
                this.bridge.getWebView().addJavascriptInterface(new NepseNativeNotifier(), "NepseNativeNotifier");
            }
        } catch (Exception ignored) {}

        handleNotificationDeepLink(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleNotificationDeepLink(intent);
    }

    private void handleNotificationDeepLink(Intent intent) {
        if (intent != null && intent.getBooleanExtra("from_notification", false)) {
            final String symbol = intent.getStringExtra("symbol");
            final String type = intent.getStringExtra("type");
            final String category = intent.getStringExtra("category");
            final String action = intent.getStringExtra("action");
            final String url = intent.getStringExtra("url");
            final String title = intent.getStringExtra("title");
            final String body = intent.getStringExtra("body");

            try {
                org.json.JSONObject payload = new org.json.JSONObject();
                payload.put("symbol", symbol != null ? symbol : "");
                payload.put("type", type != null ? type : "");
                payload.put("category", category != null ? category : "");
                payload.put("action", action != null ? action : "");
                payload.put("url", url != null ? url : "");
                payload.put("title", title != null ? title : "");
                payload.put("body", body != null ? body : "");

                final String payloadStr = payload.toString();
                pendingNotificationPayload = payloadStr;

                if (this.bridge != null && this.bridge.getWebView() != null) {
                    this.bridge.getWebView().postDelayed(() -> {
                        try {
                            String script = "window.dispatchEvent(new CustomEvent('dravyashree_notification_clicked', { detail: " + payloadStr + " }));";
                            bridge.getWebView().evaluateJavascript(script, null);
                        } catch (Exception ignored) {}
                    }, 400);
                }
            } catch (Exception e) {
                android.util.Log.w("MainActivity", "Error handling notification deep link: " + e.getMessage());
            }
        }
    }

    public class NepseAndroidDownloader {
        @JavascriptInterface
        public boolean saveFile(final String content, final String filename, final String mimeType) {
            try {
                final String safeName = (filename != null && !filename.trim().isEmpty())
                        ? filename.trim()
                        : ("NEPSE_Export_" + System.currentTimeMillis() + ".csv");
                final String safeMime = (mimeType != null && !mimeType.trim().isEmpty())
                        ? mimeType.split(";")[0].trim()
                        : "text/csv";
                final byte[] bytes;
                if (content != null && content.startsWith("data:") && content.contains(";base64,")) {
                    String base64Data = content.substring(content.indexOf(";base64,") + 8);
                    bytes = android.util.Base64.decode(base64Data, android.util.Base64.DEFAULT);
                } else if (content != null && content.startsWith("base64,")) {
                    bytes = android.util.Base64.decode(content.substring(7), android.util.Base64.DEFAULT);
                } else {
                    bytes = (content != null ? content : "").getBytes(StandardCharsets.UTF_8);
                }

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.Downloads.DISPLAY_NAME, safeName);
                    values.put(MediaStore.Downloads.MIME_TYPE, safeMime);
                    values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                    ContentResolver resolver = getContentResolver();
                    Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                    if (uri != null) {
                        try (OutputStream os = resolver.openOutputStream(uri)) {
                            if (os != null) {
                                os.write(bytes);
                                os.flush();
                            }
                        }
                    }
                } else {
                    File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                    if (!dir.exists()) {
                        dir.mkdirs();
                    }
                    File outFile = new File(dir, safeName);
                    try (FileOutputStream fos = new FileOutputStream(outFile)) {
                        fos.write(bytes);
                        fos.flush();
                    }
                }

                runOnUiThread(() -> Toast.makeText(
                        MainActivity.this,
                        "Saved to Downloads: " + safeName,
                        Toast.LENGTH_LONG
                ).show());
                return true;
            } catch (final Exception e) {
                runOnUiThread(() -> Toast.makeText(
                        MainActivity.this,
                        "Download error: " + e.getMessage(),
                        Toast.LENGTH_LONG
                ).show());
                return false;
            }
        }
    }

    public class NepseNativeNotifier {
        @JavascriptInterface
        public String getPendingNotification() {
            String pending = pendingNotificationPayload;
            pendingNotificationPayload = null;
            return pending != null ? pending : "";
        }

        @JavascriptInterface
        public boolean hasNotificationPermission() {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    return ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
                }
                return NotificationManagerCompat.from(MainActivity.this).areNotificationsEnabled();
            } catch (Exception e) {
                return true;
            }
        }

        @JavascriptInterface
        public void requestNotificationPermission() {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    runOnUiThread(() -> {
                        ActivityCompat.requestPermissions(MainActivity.this, new String[]{Manifest.permission.POST_NOTIFICATIONS}, 101);
                    });
                }
            } catch (Exception ignored) {}
        }

        @JavascriptInterface
        public void postStatusBarNotification(final String title, final String body, final String channelId, final String symbol, final String type, final String action, final String url) {
            try {
                // Ensure notification channels exist before notifying
                DravyashreeAlertWorker.ensureNotificationChannels(MainActivity.this);

                final String safeTitle = (title != null && !title.trim().isEmpty()) ? title : "🔔 Dravyashree Alert";
                final String safeBody = (body != null) ? body : "";
                final String safeChannel = (channelId != null && !channelId.trim().isEmpty()) ? channelId : DravyashreeAlertWorker.CHANNEL_PRO;

                Intent intent = new Intent(MainActivity.this, MainActivity.class);
                intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                intent.putExtra("from_notification", true);
                intent.putExtra("symbol", symbol != null ? symbol : "");
                intent.putExtra("type", type != null ? type : "");
                intent.putExtra("action", action != null ? action : "");
                intent.putExtra("url", url != null ? url : "");
                intent.putExtra("title", safeTitle);
                intent.putExtra("body", safeBody);

                PendingIntent pendingIntent = PendingIntent.getActivity(
                        MainActivity.this,
                        (int) System.currentTimeMillis(),
                        intent,
                        Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                                ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                                : PendingIntent.FLAG_UPDATE_CURRENT
                );

                Uri defaultSoundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);

                NotificationCompat.Builder builder = new NotificationCompat.Builder(MainActivity.this, safeChannel)
                        .setSmallIcon(R.mipmap.ic_launcher)
                        .setContentTitle(safeTitle)
                        .setContentText(safeBody)
                        .setStyle(new NotificationCompat.BigTextStyle().bigText(safeBody))
                        .setAutoCancel(true)
                        .setSound(defaultSoundUri)
                        .setVibrate(new long[]{0, 250, 150, 250})
                        .setDefaults(NotificationCompat.DEFAULT_ALL)
                        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                        .setContentIntent(pendingIntent)
                        .setPriority(NotificationCompat.PRIORITY_MAX);

                if (safeChannel.contains("pro")) {
                    builder.setColor(Color.parseColor("#10B981"));
                } else {
                    builder.setColor(Color.parseColor("#38BDF8"));
                }

                // Deterministic notification ID: updates existing notification rather than stacking duplicates
                int notifId = Math.abs((safeTitle + "_" + symbol).hashCode()) % 1000000;
                if (notifId == 0) notifId = 1001;
                NotificationManagerCompat.from(MainActivity.this).notify(notifId, builder.build());
                android.util.Log.d("NepseNativeNotifier", "Posted status bar notification from JS: " + safeTitle);
            } catch (final Exception e) {
                android.util.Log.w("NepseNativeNotifier", "Failed posting status bar notification from JS: " + e.getMessage());
            }
        }

        @JavascriptInterface
        public void postStatusBarNotification(final String title, final String body, final String channelId, final String symbol, final String type, final String action, final String url, final String createdAt) {
            if (createdAt != null && !createdAt.trim().isEmpty()) {
                try {
                    long timeMs = 0;
                    if (createdAt.matches("^\\d+$")) {
                        timeMs = Long.parseLong(createdAt);
                        if (createdAt.length() == 10) timeMs *= 1000L;
                    } else {
                        // Resilient ISO string parsing with fallback
                        String clean = createdAt.split("\\.")[0].replace("Z", "");
                        if (clean.contains("+")) clean = clean.split("\\+")[0];
                        java.text.SimpleDateFormat sdf = new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", java.util.Locale.US);
                        sdf.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
                        java.util.Date d = sdf.parse(clean);
                        if (d != null) timeMs = d.getTime();
                    }
                    // Only drop if timestamp is unequivocally older than 1 hour (allows slight clock drift)
                    if (timeMs > 0 && (System.currentTimeMillis() - timeMs > 60 * 60 * 1000L)) {
                        android.util.Log.d("NepseNativeNotifier", "Suppressed stale notification in native bridge: " + title);
                        return;
                    }
                } catch (Exception e) {
                    // If parsing fails, do NOT suppress live notification! Proceed to post with current system time.
                    android.util.Log.d("NepseNativeNotifier", "Timestamp parse notice, proceeding to post: " + e.getMessage());
                }
            }
            postStatusBarNotification(title, body, channelId, symbol, type, action, url);
        }

        @JavascriptInterface
        public void postStatusBarNotification(final String title, final String body, final String channelId, final String symbol, final String type, final String action) {
            postStatusBarNotification(title, body, channelId, symbol, type, action, "");
        }
    }
}

