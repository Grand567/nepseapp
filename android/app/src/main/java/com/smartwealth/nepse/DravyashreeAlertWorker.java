package com.smartwealth.nepse;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashSet;
import java.util.Set;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DRAVYASHREE NATIVE ANDROID BACKGROUND ALERT WORKER
 * ───────────────────────────────────────────────────────────────────────────
 * Purpose:
 * Guarantees that Android STATUS BAR notifications pop up on the user's
 * phone EVEN WHEN THE APP IS COMPLETELY CLOSED OR KILLED.
 *
 * Runs via Android OS WorkManager in the background.
 * Fetches latest NEPSE alerts, evaluates seen state via SharedPreferences,
 * and posts high-priority NotificationCompat alerts directly to the system
 * status bar tray with sound, vibration, and deep-link click action.
 * ═══════════════════════════════════════════════════════════════════════════
 */
public class DravyashreeAlertWorker extends Worker {

    private static final String TAG = "DravyashreeWorker";
    public static final String CHANNEL_PRO = "dravyashree-pro-signals";
    public static final String CHANNEL_GENERAL = "nepse-general-news";
    private static final String PREFS_NAME = "dravyashree_native_alerts";
    private static final String KEY_SEEN_IDS = "seen_alert_ids";

    private static final String[] API_ENDPOINTS = {
            "https://nepseapp.onrender.com/api/notifications?limit=20",
            "http://10.0.2.2:5000/api/notifications?limit=20"
    };

    public DravyashreeAlertWorker(@NonNull Context context, @NonNull WorkerParameters workerParams) {
        super(context, workerParams);
    }

    @NonNull
    @Override
    public Result doWork() {
        Log.d(TAG, "Dravyashree background worker executing check for live alerts...");

        // If app is currently open and in foreground, in-app notification center handles it
        if (MainActivity.isForeground()) {
            Log.d(TAG, "Dravyashree is currently in foreground; in-app UI handles alerts.");
            return Result.success();
        }

        Context context = getApplicationContext();
        ensureNotificationChannels(context);

        String jsonResponse = null;
        for (String endpoint : API_ENDPOINTS) {
            try {
                jsonResponse = fetchUrl(endpoint);
                if (jsonResponse != null && !jsonResponse.trim().isEmpty()) {
                    break;
                }
            } catch (Exception e) {
                Log.d(TAG, "Endpoint " + endpoint + " notice: " + e.getMessage());
            }
        }

        if (jsonResponse == null || jsonResponse.trim().isEmpty()) {
            return Result.success();
        }

        try {
            JSONObject root = new JSONObject(jsonResponse);
            if (!root.optBoolean("success", false)) {
                return Result.success();
            }

            JSONArray data = root.optJSONArray("data");
            if (data == null || data.length() == 0) {
                return Result.success();
            }

            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            Set<String> seenIds = new HashSet<>(prefs.getStringSet(KEY_SEEN_IDS, new HashSet<>()));

            // First run guard: if no seen IDs exist yet, record current IDs so we don't spam historical alerts
            boolean isFirstRun = seenIds.isEmpty();

            for (int i = 0; i < data.length(); i++) {
                JSONObject item = data.optJSONObject(i);
                if (item == null) continue;

                String id = item.optString("id", "").trim();
                String title = item.optString("title", "").trim();
                String body = item.optString("body", "").trim();
                String contentFingerprint = "fp_" + Math.abs((title + "_" + body).toLowerCase().hashCode());

                if (id.isEmpty()) id = contentFingerprint;

                // Strict deduplication: check both ID and content fingerprint
                if (seenIds.contains(id) || seenIds.contains(contentFingerprint)) {
                    continue; // Already posted to status bar!
                }

                seenIds.add(id);
                seenIds.add(contentFingerprint);

                // Verify alert freshness: only post if triggered within the retention window (6 hours)
                if (!isAlertFresh(item)) {
                    Log.d(TAG, "Suppressed outdated historical alert: " + title);
                    continue;
                }

                // New alert arrived! Post status bar notification!
                postNativeStatusBarNotification(context, item);
            }

            // Cap seen set at 300 IDs
            if (seenIds.size() > 300) {
                Set<String> trimmed = new HashSet<>();
                int keep = 0;
                for (String s : seenIds) {
                    trimmed.add(s);
                    if (++keep >= 200) break;
                }
                seenIds = trimmed;
            }

            prefs.edit().putStringSet(KEY_SEEN_IDS, seenIds).apply();

        } catch (Exception e) {
            Log.w(TAG, "Error processing alerts JSON in background worker: " + e.getMessage());
        }

        return Result.success();
    }

    public static final long NOTIFICATION_TTL_MS = 6 * 60 * 60 * 1000L; // 6 hours TTL so Android Doze doesn't drop news alerts

    private boolean isAlertFresh(JSONObject item) {
        if (item == null) return false;
        long timeMs = 0;
        String createdAt = item.optString("created_at", "");
        if (createdAt.isEmpty()) createdAt = item.optString("created_at_ms", "");
        if (createdAt.isEmpty()) createdAt = item.optString("triggeredAt", "");
        if (createdAt.isEmpty()) createdAt = item.optString("timestamp", "");

        if (!createdAt.isEmpty()) {
            try {
                if (createdAt.matches("^\\d+$")) {
                    timeMs = Long.parseLong(createdAt);
                    if (createdAt.length() == 10) timeMs *= 1000L;
                } else {
                    String cleanIso = createdAt.split("\\.")[0].replace("Z", "");
                    if (cleanIso.contains("+")) cleanIso = cleanIso.split("\\+")[0];
                    java.text.SimpleDateFormat sdf = new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", java.util.Locale.US);
                    sdf.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
                    java.util.Date d = sdf.parse(cleanIso);
                    if (d != null) timeMs = d.getTime();
                }
            } catch (Exception ignored) {}
        }

        // 1. Explicit Payload Timestamp Verification: Reject if timestamp missing or unparseable
        if (timeMs <= 0) {
            Log.w(TAG, "Suppressed notification with missing explicit creation timestamp: " + item.optString("title", ""));
            return false;
        }

        long now = System.currentTimeMillis();
        long ageMs = now - timeMs;

        // 2. TTL Expiration Rule: Automatically discard if older than 30 minutes
        if (ageMs > NOTIFICATION_TTL_MS) {
            Log.d(TAG, "Suppressed stale broadcast alert (age: " + (ageMs / 60000) + "m > TTL 30m): " + item.optString("title", ""));
            return false;
        }

        // Clock skew protection: reject if more than 5 minutes in future
        if (ageMs < -5 * 60 * 1000L) {
            Log.w(TAG, "Suppressed alert with future anomaly timestamp: " + item.optString("title", ""));
            return false;
        }

        return true;
    }

    private void postNativeStatusBarNotification(Context context, JSONObject item) {
        try {
            String title = item.optString("title", "🔔 Dravyashree Alert");
            String body = item.optString("body", "");
            String symbol = item.optString("symbol", "");
            String category = item.optString("category", "pro");
            String type = item.optString("type", "");

            boolean isPro = "pro".equalsIgnoreCase(category) || 
                    type.contains("BREAKOUT") || 
                    type.contains("ACCUMULATION") || 
                    type.contains("ENTRY") || 
                    type.contains("PROFIT") || 
                    type.contains("STOP_LOSS");

            String channelId = isPro ? CHANNEL_PRO : CHANNEL_GENERAL;

            String action = item.optString("action", "");
            String url = item.optString("url", "");
            if (action.isEmpty()) {
                if ("NEWS_ALERT".equalsIgnoreCase(type) || "general".equalsIgnoreCase(category) || "news".equalsIgnoreCase(category)) {
                    action = "OPEN_NEWS";
                } else if ("IPO_ALERT".equalsIgnoreCase(type) || "ipo".equalsIgnoreCase(category)) {
                    action = "OPEN_IPO";
                } else if (!symbol.isEmpty()) {
                    action = "OPEN_STOCK";
                } else {
                    action = "OPEN_NEWS";
                }
            }

            Intent intent = new Intent(context, MainActivity.class);
            intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            intent.putExtra("from_notification", true);
            intent.putExtra("alert_id", item.optString("id", ""));
            intent.putExtra("symbol", symbol);
            intent.putExtra("type", type);
            intent.putExtra("category", category);
            intent.putExtra("action", action);
            intent.putExtra("url", url);
            intent.putExtra("title", title);
            intent.putExtra("body", body);

            PendingIntent pendingIntent = PendingIntent.getActivity(
                    context,
                    (int) System.currentTimeMillis(),
                    intent,
                    Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                            ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                            : PendingIntent.FLAG_UPDATE_CURRENT
            );

            Uri defaultSoundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);

            NotificationCompat.Builder builder = new NotificationCompat.Builder(context, channelId)
                    .setSmallIcon(R.drawable.ic_stat_notification)
                    .setContentTitle(title)
                    .setContentText(body)
                    .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                    .setAutoCancel(true)
                    .setSound(defaultSoundUri)
                    .setVibrate(new long[]{0, 250, 150, 250})
                    .setContentIntent(pendingIntent)
                    .setPriority(isPro ? NotificationCompat.PRIORITY_MAX : NotificationCompat.PRIORITY_DEFAULT);

            if (isPro) {
                builder.setColor(Color.parseColor("#10B981"));
            } else {
                builder.setColor(Color.parseColor("#38BDF8"));
            }

            // Deterministic notification ID: updates existing notification rather than spamming multiple entries
            int notifId = Math.abs((title + "_" + symbol).hashCode()) % 1000000;
            if (notifId == 0) notifId = 1001;
            NotificationManagerCompat notificationManager = NotificationManagerCompat.from(context);
            notificationManager.notify(notifId, builder.build());

            Log.i(TAG, "✅ Native Status Bar Notification posted for: " + title);

        } catch (Exception e) {
            Log.e(TAG, "Failed posting native status bar notification: " + e.getMessage(), e);
        }
    }

    public static void ensureNotificationChannels(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = context.getSystemService(NotificationManager.class);
            if (manager == null) return;

            // 1. Pro Signals Channel (High priority heads-up status bar notification)
            NotificationChannel proChannel = new NotificationChannel(
                    CHANNEL_PRO,
                    "Dravyashree PRO Signals",
                    NotificationManager.IMPORTANCE_HIGH
            );
            proChannel.setDescription("High-Probability Breakouts, Institutional Accumulation, Stop-Loss & Profit-Booking Alerts");
            proChannel.enableLights(true);
            proChannel.setLightColor(Color.parseColor("#10B981"));
            proChannel.enableVibration(true);
            proChannel.setVibrationPattern(new long[]{0, 250, 150, 250});
            manager.createNotificationChannel(proChannel);

            // 2. General News & IPO Channel
            NotificationChannel generalChannel = new NotificationChannel(
                    CHANNEL_GENERAL,
                    "NEPSE News & IPO Pipeline",
                    NotificationManager.IMPORTANCE_HIGH
            );
            generalChannel.setDescription("Corporate Announcements, Dividends, IPO Deadlines & Results");
            generalChannel.enableLights(true);
            generalChannel.setLightColor(Color.parseColor("#38BDF8"));
            generalChannel.enableVibration(true);
            manager.createNotificationChannel(generalChannel);
        }
    }

    private String fetchUrl(String urlString) throws Exception {
        URL url = new URL(urlString);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("GET");
        conn.setConnectTimeout(25000);
        conn.setReadTimeout(25000);
        conn.setRequestProperty("Accept", "application/json");
        conn.setRequestProperty("User-Agent", "DravyashreeAndroidApp/1.0.6");

        int responseCode = conn.getResponseCode();
        if (responseCode == HttpURLConnection.HTTP_OK) {
            InputStream in = conn.getInputStream();
            BufferedReader reader = new BufferedReader(new InputStreamReader(in));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line);
            }
            reader.close();
            return sb.toString();
        }
        return null;
    }
}
