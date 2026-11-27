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
import java.util.LinkedHashSet;
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
    private static final String KEY_LAST_OTHER_NEWS_POP_MS = "last_other_news_pop_ms";
    public static final long OTHER_NEWS_INTERVAL_MS = 60 * 60 * 1000L; // 1 hour interval for general news

    private static final String[] API_ENDPOINTS = {
            "https://drabyashree-nepse-hub.onrender.com/api/notifications?limit=20",
            "https://nepseapp.onrender.com/api/notifications?limit=20",
            "http://10.0.2.2:5000/api/notifications?limit=20"
    };

    public DravyashreeAlertWorker(@NonNull Context context, @NonNull WorkerParameters workerParams) {
        super(context, workerParams);
    }

    public static String normalizeTextForDedup(String text) {
        if (text == null) return "";
        String lower = text.toLowerCase(java.util.Locale.US)
                .replaceAll("\\(covered by:[^)]+\\)", " ")
                .replaceAll("\\[(?:pro holding|my holding|portfolio|trending)[^\\]]*\\]", " ")
                .replaceAll("[\\p{So}\\p{Cn}]", " ")
                .replaceAll("[^\\p{L}\\p{N}\\s%]", " ")
                .replaceAll("\\s+", " ")
                .trim();
        return lower;
    }

    public static String getCorporateActionKind(String type, String title, String body) {
        String cleanType = type != null ? type.trim().toUpperCase(java.util.Locale.US) : "";
        if ("DIVIDEND_ALERT".equals(cleanType)) return "DIVIDEND";
        if ("RIGHT_SHARE_ALERT".equals(cleanType)) return "RIGHT_SHARE";
        if ("BOOK_CLOSURE_ALERT".equals(cleanType)) return "BOOK_CLOSURE";

        String combined = ((title != null ? title : "") + " " + (body != null ? body : "")).toLowerCase(java.util.Locale.US);
        String[] divKws = {"लाभांश", "बोनस", "dividend", "bonus share", "bonus", "cash dividend"};
        for (String kw : divKws) {
            if (combined.contains(kw)) return "DIVIDEND";
        }
        String[] rightKws = {"हकप्रद", "right share", "right issue", "rights issue", "right offering"};
        for (String kw : rightKws) {
            if (combined.contains(kw)) return "RIGHT_SHARE";
        }
        String[] bookKws = {"बुक क्लोज", "बुकक्लोज", "साधारण सभा", "book closure", "book close", "annual general meeting", "special general meeting", " agm", "agm "};
        for (String kw : bookKws) {
            if (combined.contains(kw)) return "BOOK_CLOSURE";
        }
        return "";
    }

    public static boolean isImmediateCorporateActionOrPro(String type, String channelOrCategory, String title, String body) {
        String cleanType = type != null ? type.trim().toUpperCase(java.util.Locale.US) : "";
        String cleanCat = channelOrCategory != null ? channelOrCategory.trim().toLowerCase(java.util.Locale.US) : "";
        if (cleanCat.contains("pro")) return true;
        if ("DIVIDEND_ALERT".equals(cleanType)
                || "RIGHT_SHARE_ALERT".equals(cleanType)
                || "BOOK_CLOSURE_ALERT".equals(cleanType)
                || "PORTFOLIO_NEWS_ALERT".equals(cleanType)
                || "ADMIN_TEST_ALERT".equals(cleanType)
                || cleanType.contains("BREAKOUT")
                || cleanType.contains("ACCUMULATION")
                || cleanType.contains("ENTRY")
                || cleanType.contains("PROFIT")
                || cleanType.contains("STOP_LOSS")) {
            return true;
        }
        if (!getCorporateActionKind(cleanType, title, body).isEmpty()) return true;
        String combined = ((title != null ? title : "") + " " + (body != null ? body : "")).toLowerCase(java.util.Locale.US);
        return combined.contains("[pro holding")
                || combined.contains("[my holding")
                || combined.contains("[portfolio]");
    }

    public static Set<String> buildDedupKeys(String id, String type, String symbol, String title, String body) {
        Set<String> keys = new LinkedHashSet<>();
        String cleanId = id != null ? id.trim() : "";
        String cleanSym = symbol != null ? symbol.trim().toUpperCase(java.util.Locale.US) : "";
        String cleanType = type != null ? type.trim().toUpperCase(java.util.Locale.US) : "";
        String normTitle = normalizeTextForDedup(title);
        String normBody = normalizeTextForDedup(body);

        if (!cleanId.isEmpty()) {
            keys.add(cleanId);
        }
        if (!normTitle.isEmpty() || !normBody.isEmpty()) {
            keys.add("fp_" + Math.abs((normTitle + "_" + normBody).hashCode()));
        }
        if (normTitle.length() >= 10) {
            keys.add("hl_" + (!cleanSym.isEmpty() ? cleanSym : "GEN") + "_" + Math.abs(normTitle.hashCode()));
        }
        String corpKind = getCorporateActionKind(cleanType, normTitle, normBody);
        if (!corpKind.isEmpty() && !cleanSym.isEmpty() && !"NEPSE".equals(cleanSym)) {
            java.text.SimpleDateFormat sdf = new java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US);
            sdf.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
            keys.add("corp_" + corpKind + "_" + cleanSym + "_" + sdf.format(new java.util.Date()));
        }
        boolean isIpo = cleanType.contains("IPO") || normTitle.contains("ipo");
        if (isIpo && !cleanSym.isEmpty()) {
            keys.add("ipo_seen_" + cleanSym);
        }
        return keys;
    }

    public static synchronized boolean isAlertAlreadySeen(Context context, String id, String type, String symbol, String title, String body) {
        if (context == null) return false;
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        Set<String> stored = prefs.getStringSet(KEY_SEEN_IDS, null);
        if (stored == null || stored.isEmpty()) return false;
        Set<String> seenIds = new HashSet<>(stored);
        for (String key : buildDedupKeys(id, type, symbol, title, body)) {
            if (seenIds.contains(key)) {
                return true;
            }
        }
        return false;
    }

    public static synchronized void markAlertSeen(Context context, String id, String type, String symbol, String title, String body) {
        if (context == null) return;
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        Set<String> existing = prefs.getStringSet(KEY_SEEN_IDS, null);
        Set<String> seenIds = existing != null ? new LinkedHashSet<>(existing) : new LinkedHashSet<>();
        seenIds.addAll(buildDedupKeys(id, type, symbol, title, body));

        if (seenIds.size() > 400) {
            Set<String> trimmed = new LinkedHashSet<>();
            int skip = seenIds.size() - 250;
            int count = 0;
            for (String s : seenIds) {
                if (++count > skip) {
                    trimmed.add(s);
                }
            }
            seenIds = trimmed;
        }
        prefs.edit().putStringSet(KEY_SEEN_IDS, seenIds).commit();
    }

    public static synchronized boolean canPopGeneralNewsNow(Context context) {
        if (context == null) return true;
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        long lastPopMs = prefs.getLong(KEY_LAST_OTHER_NEWS_POP_MS, 0L);
        if (lastPopMs <= 0L) return true;
        long elapsed = System.currentTimeMillis() - lastPopMs;
        return elapsed < 0L || elapsed >= OTHER_NEWS_INTERVAL_MS;
    }

    public static synchronized void markGeneralNewsPoppedNow(Context context) {
        if (context == null) return;
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().putLong(KEY_LAST_OTHER_NEWS_POP_MS, System.currentTimeMillis()).commit();
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
            Log.w(TAG, "Dravyashree endpoints unreachable, timed out, or returned 503/empty. Requesting WorkManager retry with backoff...");
            return Result.retry();
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
            Set<String> storedSeen = prefs.getStringSet(KEY_SEEN_IDS, null);
            Set<String> seenIds = storedSeen != null ? new LinkedHashSet<>(storedSeen) : new LinkedHashSet<>();

            // First run guard: if no seen IDs exist yet, record current IDs so we don't spam historical alerts
            boolean isFirstRun = seenIds.isEmpty();
            if (isFirstRun) {
                for (int i = 0; i < data.length(); i++) {
                    JSONObject item = data.optJSONObject(i);
                    if (item == null) continue;
                    String id = item.optString("id", "").trim();
                    String type = item.optString("type", "").trim();
                    String title = item.optString("title", "").trim();
                    String body = item.optString("body", "").trim();
                    String symbol = item.optString("symbol", "").toUpperCase().trim();
                    seenIds.addAll(buildDedupKeys(id, type, symbol, title, body));
                    if (!symbol.isEmpty() && (type.contains("IPO") || item.optString("category", "").equalsIgnoreCase("ipo"))) {
                        seenIds.add("ipo_seen_" + symbol);
                    }
                }
                prefs.edit().putStringSet(KEY_SEEN_IDS, seenIds).commit();
                Log.i(TAG, "First background run: recorded " + seenIds.size() + " existing alerts to suppress historical status bar spam.");
                return Result.success();
            }

            for (int i = 0; i < data.length(); i++) {
                JSONObject item = data.optJSONObject(i);
                if (item == null) continue;

                // Never alert for internal portfolio holding objects, in-app-only notices, or suppressed Financial Results
                String rawType = item.optString("type", "").trim();
                if (item.optBoolean("isUserHolding", false)
                        || item.optBoolean("inAppOnly", false)
                        || !item.optBoolean("pushStatusBar", true)
                        || "EARNINGS_ALERT".equalsIgnoreCase(rawType)) {
                    continue;
                }

                String id = item.optString("id", "").trim();
                String title = item.optString("title", "").trim();
                String body = item.optString("body", "").trim();
                String symbol = item.optString("symbol", "").toUpperCase().trim();
                String type = item.optString("type", "").trim();
                String category = item.optString("category", "").trim();

                // Reject blank or incomplete notifications
                if (title.isEmpty() || body.isEmpty()) {
                    continue;
                }

                // Shared persistent deduplication across foreground JS bridge & background WorkManager
                if (isAlertAlreadySeen(context, id, type, symbol, title, body)) {
                    continue; // Already posted or suppressed! Never repeat!
                }

                // Verify alert freshness: only post if triggered within the retention window (24 hours)
                if (!isAlertFresh(item)) {
                    markAlertSeen(context, id, type, symbol, title, body);
                    Log.d(TAG, "Suppressed outdated historical alert: " + title);
                    continue;
                }

                // Immediate vs 1-hour interval for general news
                boolean isImmediate = isImmediateCorporateActionOrPro(type, category, title, body)
                        || item.optBoolean("isHoldingHighlight", false)
                        || item.optBoolean("isPortfolioTracked", false);
                if (!isImmediate) {
                    if (!canPopGeneralNewsNow(context)) {
                        markAlertSeen(context, id, type, symbol, title, body);
                        Log.d(TAG, "Suppressed general news within 1h interval: " + title);
                        continue;
                    }
                    markGeneralNewsPoppedNow(context);
                }

                markAlertSeen(context, id, type, symbol, title, body);
                // New alert arrived! Post status bar notification!
                postNativeStatusBarNotification(context, item);
            }

        } catch (Exception e) {
            Log.w(TAG, "Error processing alerts JSON in background worker: " + e.getMessage());
        }

        return Result.success();
    }

    public static final long NOTIFICATION_TTL_MS = 24 * 60 * 60 * 1000L; // 24 hours TTL so full day trading signals are retained

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
            String title = item.optString("title", "").trim();
            String body = item.optString("body", "").trim();
            if (title.isEmpty() || body.isEmpty()) {
                Log.w(TAG, "Suppressed posting native status bar notification with empty title or body");
                return;
            }
            String symbol = item.optString("symbol", "");
            String category = item.optString("category", "pro");
            String type = item.optString("type", "");

            boolean isPro = "pro".equalsIgnoreCase(category) || 
                    item.optBoolean("isHoldingHighlight", false) ||
                    item.optBoolean("isPortfolioTracked", false) ||
                    title.contains("[PRO HOLDING") ||
                    type.contains("DIVIDEND") ||
                    type.contains("RIGHT_SHARE") ||
                    type.contains("BREAKOUT") || 
                    type.contains("ACCUMULATION") || 
                    type.contains("ENTRY") || 
                    type.contains("PROFIT") || 
                    type.contains("STOP_LOSS");

            String channelId = isPro ? CHANNEL_PRO : CHANNEL_GENERAL;

            String action = item.optString("action", "");
            String url = item.optString("url", "");
            boolean isIpoAlert = "IPO_ALERT".equalsIgnoreCase(type)
                    || "ALLOTMENT_ALERT".equalsIgnoreCase(type)
                    || "ipo".equalsIgnoreCase(category)
                    || title.toLowerCase().contains("ipo");
            boolean isProCorporate = "DIVIDEND_ALERT".equalsIgnoreCase(type)
                    || "RIGHT_SHARE_ALERT".equalsIgnoreCase(type);
            if (isProCorporate && (action.isEmpty() || "OPEN_NEWS".equalsIgnoreCase(action))) {
                action = (!symbol.isEmpty() && !"NEPSE".equalsIgnoreCase(symbol)) ? "OPEN_STOCK" : "OPEN_RADAR";
            } else if (action.isEmpty() || (isIpoAlert && "OPEN_NEWS".equalsIgnoreCase(action))) {
                if (isIpoAlert) {
                    action = "OPEN_IPO";
                } else if ("NEWS_ALERT".equalsIgnoreCase(type)
                        || "TRENDING_NEWS_ALERT".equalsIgnoreCase(type)
                        || "BOOK_CLOSURE_ALERT".equalsIgnoreCase(type)
                        || "MERGER_ALERT".equalsIgnoreCase(type)
                        || "SEBON_APPROVAL_ALERT".equalsIgnoreCase(type)
                        || "NEPSE_MACRO".equalsIgnoreCase(type)
                        || "MARKET_MILESTONE_ALERT".equalsIgnoreCase(type)
                        || "PORTFOLIO_NEWS_ALERT".equalsIgnoreCase(type)
                        || "news".equalsIgnoreCase(category)) {
                    action = "OPEN_NEWS";
                } else if (!symbol.isEmpty() && !"NEPSE".equalsIgnoreCase(symbol)) {
                    action = "OPEN_STOCK";
                } else if ("general".equalsIgnoreCase(category)) {
                    action = "OPEN_NEWS";
                } else {
                    action = "OPEN_RADAR";
                }
            }

            // Stable deterministic notification ID: updates existing notification without noisy re-alerting
            String notifKey = !symbol.isEmpty() ? (type + "_" + symbol) : (type + "_" + Math.abs(title.hashCode()));
            int notifId = Math.abs(notifKey.hashCode()) % 1000000;
            if (notifId == 0) notifId = 1001;

            Intent intent = new Intent(context, MainActivity.class);
            intent.setAction("com.smartwealth.nepse.NOTIFICATION_TAP_" + notifId + "_" + System.nanoTime());
            intent.setData(Uri.parse("dravyashree://notification/" + notifId + "/" + System.nanoTime()));
            intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            intent.putExtra("from_notification", true);
            intent.putExtra("alert_id", item.optString("id", ""));
            intent.putExtra("symbol", symbol);
            intent.putExtra("type", type);
            intent.putExtra("category", category);
            intent.putExtra("action", action);
            intent.putExtra("url", url);
            intent.putExtra("source", item.optString("source", ""));
            intent.putExtra("title", title);
            intent.putExtra("body", body);

            PendingIntent pendingIntent = PendingIntent.getActivity(
                    context,
                    notifId,
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
                    .setOnlyAlertOnce(true)
                    .setSound(defaultSoundUri)
                    .setVibrate(new long[]{0, 250, 150, 250})
                    .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                    .setContentIntent(pendingIntent)
                    .setPriority(NotificationCompat.PRIORITY_HIGH);

            if (isPro) {
                builder.setColor(Color.parseColor("#10B981"));
            } else {
                builder.setColor(Color.parseColor("#38BDF8"));
            }

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

            // 2. General News & IPO Channel (High Importance, Sky Blue Accent #38BDF8, Heads-Up Banner)
            NotificationChannel generalChannel = new NotificationChannel(
                    CHANNEL_GENERAL,
                    "NEPSE General News & Corporate Actions",
                    NotificationManager.IMPORTANCE_HIGH
            );
            generalChannel.setDescription("Corporate Actions, Dividends, Right Shares, Financial Reports, High-Importance News & IPOs");
            generalChannel.enableLights(true);
            generalChannel.setLightColor(Color.parseColor("#38BDF8"));
            generalChannel.enableVibration(true);
            generalChannel.setVibrationPattern(new long[]{0, 250, 150, 250});
            generalChannel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
            manager.createNotificationChannel(generalChannel);
        }
    }

    private String fetchUrl(String urlString) throws Exception {
        URL url = new URL(urlString);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("GET");
        conn.setConnectTimeout(35000);
        conn.setReadTimeout(35000);
        conn.setRequestProperty("Accept", "application/json, text/plain, */*");
        conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 14; Pixel 6a) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 DravyashreeApp/1.0.6");

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

    public static boolean postTokenRegistration(String token, String platform, String appVersion) {
        if (token == null || token.trim().isEmpty()) return false;
        String[] endpoints = {
                "https://drabyashree-nepse-hub.onrender.com/api/smart-alerts/register-token",
                "https://nepseapp.onrender.com/api/smart-alerts/register-token",
                "http://10.0.2.2:5000/api/smart-alerts/register-token"
        };
        for (String endpoint : endpoints) {
            HttpURLConnection conn = null;
            try {
                URL url = new URL(endpoint);
                conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setConnectTimeout(35000);
                conn.setReadTimeout(35000);
                conn.setDoOutput(true);
                conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
                conn.setRequestProperty("Accept", "application/json, text/plain, */*");
                conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 14; Pixel 6a) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 DravyashreeApp/1.0.6");

                JSONObject body = new JSONObject();
                body.put("token", token.trim());
                body.put("platform", platform != null ? platform : "android");
                body.put("appVersion", appVersion != null ? appVersion : "1.0.6");

                try (java.io.OutputStream os = conn.getOutputStream()) {
                    byte[] input = body.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8);
                    os.write(input, 0, input.length);
                    os.flush();
                }

                int code = conn.getResponseCode();
                if (code >= 200 && code < 300) {
                    Log.d(TAG, "Background token sync succeeded via WorkManager to " + endpoint);
                    return true;
                }
            } catch (Exception e) {
                Log.d(TAG, "Background token sync notice for " + endpoint + ": " + e.getMessage());
            } finally {
                if (conn != null) conn.disconnect();
            }
        }
        return false;
    }
}
