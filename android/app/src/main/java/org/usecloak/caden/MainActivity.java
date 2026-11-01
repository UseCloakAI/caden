package org.usecloak.caden;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Caden for Android: the same web app, bundled in assets/www and served from
 * https://caden.app/ (intercepted, never hits the network) so it gets a secure
 * origin for the camera, mic and WebCrypto. Speech goes through {@link Bridge}
 * because Android's WebView has no Web Speech API.
 */
public class MainActivity extends Activity {
    static final String HOST = "caden.app";
    static final String ORIGIN = "https://" + HOST + "/";
    private static final int REQ = 7;

    private WebView web;
    private Bridge bridge;
    Updater updater;
    private final android.os.Handler ticker = new android.os.Handler(android.os.Looper.getMainLooper());
    private final Runnable recheck = new Runnable() {
        @Override public void run() { updater.check(); ticker.postDelayed(this, 30 * 60 * 1000L); }
    };
    private PermissionRequest pending;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        showOverLock();
        immersive();
        CadenService.channels(this);

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#0A2245")); // under the sky, never white
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setUserAgentString(s.getUserAgentString() + " CadenApp/1");

        bridge = new Bridge(this, web);
        updater = new Updater(this, new Updater.Listener() {
            @Override public void onWebReady(int build) { bridge.notifyUpdate("web", build); }
            @Override public void onNativeAvailable(int build) { bridge.notifyUpdate("native", build); }
        });
        bridge.setUpdater(updater);
        updater.local(); // drops a downloaded copy older than this APK
        web.addJavascriptInterface(bridge, "CadenNative");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (!HOST.equals(u.getHost())) return null;
                return asset(u.getPath());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (HOST.equals(u.getHost())) return false;
                try { startActivity(new android.content.Intent(android.content.Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                if (!ORIGIN.equals(request.getOrigin().toString())) { request.deny(); return; }
                if (hasPerms()) grant(request);
                else { pending = request; askPerms(); }
            }
        });

        askPerms();
        String deep = getIntent() != null && getIntent().getData() != null ? getIntent().getData().getFragment() : null;
        web.loadUrl(ORIGIN + "index.html" + (deep != null ? "#" + deep : ""));
    }

    // Full screen, edge to edge: no status or navigation bar (a swipe from the
    // edge shows them for a moment), drawn into the camera cutout too, so the
    // sky fills the whole glass with no light bands.
    @SuppressWarnings("deprecation")
    void immersive() {
        android.view.Window w = getWindow();
        if (android.os.Build.VERSION.SDK_INT >= 28) {
            WindowManager.LayoutParams lp = w.getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            w.setAttributes(lp);
        }
        if (android.os.Build.VERSION.SDK_INT >= 30) {
            w.setDecorFitsSystemWindows(false);
            android.view.WindowInsetsController c = w.getInsetsController();
            if (c != null) {
                c.hide(android.view.WindowInsets.Type.statusBars() | android.view.WindowInsets.Type.navigationBars());
                c.setSystemBarsBehavior(android.view.WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            w.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean focus) {
        super.onWindowFocusChanged(focus);
        if (focus) immersive(); // bars come back after dialogs and permission prompts
    }

    // Caden can arrive while this phone is locked: show over the lock screen and
    // turn the screen on (manifest flags too, for API 27+).
    @SuppressWarnings("deprecation")
    private void showOverLock() {
        if (android.os.Build.VERSION.SDK_INT >= 27) { setShowWhenLocked(true); setTurnScreenOn(true); }
        else getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
    }

    @Override
    protected void onNewIntent(android.content.Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (intent != null && intent.getBooleanExtra("caden.wake", false)) {
            CadenService.arrived(this);
            web.evaluateJavascript("window.__cadenNative&&window.__cadenNative.onWake&&window.__cadenNative.onWake()", null);
        }
    }

    private boolean hasPerms() {
        return checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
            && checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
    }

    private void askPerms() {
        List<String> need = new ArrayList<>();
        String[] want = android.os.Build.VERSION.SDK_INT >= 33
            ? new String[]{Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO, Manifest.permission.POST_NOTIFICATIONS}
            : new String[]{Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO};
        for (String p : want) {
            if (checkSelfPermission(p) != PackageManager.PERMISSION_GRANTED) need.add(p);
        }
        if (!need.isEmpty()) requestPermissions(need.toArray(new String[0]), REQ);
    }

    private void grant(PermissionRequest r) {
        List<String> ok = new ArrayList<>();
        for (String res : r.getResources()) {
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(res)
                && checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) ok.add(res);
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(res)
                && checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) ok.add(res);
        }
        if (ok.isEmpty()) r.deny(); else r.grant(ok.toArray(new String[0]));
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] results) {
        if (code != REQ) return;
        if (pending != null) { grant(pending); pending = null; }
    }

    private static final Map<String, String> MIME = new HashMap<>();
    static {
        MIME.put("html", "text/html");
        MIME.put("js", "text/javascript");
        MIME.put("css", "text/css");
        MIME.put("json", "application/json");
        MIME.put("webmanifest", "application/manifest+json");
        MIME.put("svg", "image/svg+xml");
        MIME.put("png", "image/png");
        MIME.put("woff2", "font/woff2");
    }

    private WebResourceResponse asset(String path) {
        if (path == null || path.equals("/") || path.isEmpty()) path = "/index.html";
        if (path.contains("..")) return notFound();
        String ext = path.substring(path.lastIndexOf('.') + 1).toLowerCase();
        String mime = MIME.containsKey(ext) ? MIME.get(ext) : "application/octet-stream";
        try {
            // The downloaded web update first (Updater), else the copy bundled in the APK.
            java.io.File live = new java.io.File(updater.liveDir(), path.substring(1));
            InputStream in = live.isFile() ? new java.io.FileInputStream(live) : getAssets().open("www" + path);
            Map<String, String> h = new HashMap<>();
            h.put("Cache-Control", "no-cache");
            h.put("Access-Control-Allow-Origin", "*");
            return new WebResourceResponse(mime, mime.startsWith("text") || mime.contains("json") ? "utf-8" : null, 200, "OK", h, in);
        } catch (IOException e) {
            return notFound();
        }
    }

    private WebResourceResponse notFound() {
        return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", new HashMap<>(), new java.io.ByteArrayInputStream(new byte[0]));
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        CadenService.arrived(this);
        ticker.removeCallbacks(recheck);
        ticker.postDelayed(recheck, 4000); // check soon after coming back, then every 30 min
        immersive();
    }

    @Override
    protected void onPause() {
        bridge.quiet();
        // While Caden can be handed here, keep the page running in the background
        // (CadenService holds the process); otherwise pause it as usual.
        if (!bridge.keepingAlive()) web.onPause();
        super.onPause();
    }

    void reloadApp() { runOnUiThread(() -> web.reload()); }

    @Override
    protected void onDestroy() {
        ticker.removeCallbacks(recheck);
        bridge.shutdown();
        web.destroy();
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else moveTaskToBack(true);
    }
}
