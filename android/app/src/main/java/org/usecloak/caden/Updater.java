package org.usecloak.caden;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Iterator;

/**
 * Keeps the app current without a reinstall.
 *
 * Web layer (most changes): the live site publishes version.json (build number,
 * every file with its SHA-256). When it's newer than what we're serving, every
 * file is downloaded into files/www-new, checked against its hash, and only
 * then swapped in as files/www. MainActivity serves files/www first and falls
 * back to the APK's bundled copy, so the origin (and localStorage) never change.
 *
 * Native layer (Java changes): version.json also carries a hash of the Android
 * sources. If it differs from ours, and both builds are signed with the stable
 * release key, the new APK is downloaded, hash-checked and handed to Android's
 * PackageInstaller, which asks the person to confirm.
 */
public class Updater {
    static final String SITE = "https://usecloakai.github.io/caden/";

    interface Listener { void onWebReady(int build); void onNativeAvailable(int build); }

    private final Activity act;
    private final Listener listener;
    private volatile boolean busy;
    private volatile JSONObject remote;

    Updater(Activity act, Listener listener) { this.act = act; this.listener = listener; }

    File liveDir() { return new File(act.getFilesDir(), "www"); }

    /** What we're running: the newer of the bundled assets and the downloaded web copy. */
    JSONObject local() {
        JSONObject bundled = readJson(() -> act.getAssets().open("www/app.json"));
        JSONObject live = readJson(() -> new FileInputStream(new File(liveDir(), "app.json")));
        if (live != null && bundled != null && live.optInt("build") <= bundled.optInt("build")) {
            deleteTree(liveDir()); // the APK itself is newer: drop the old download
            live = null;
        }
        JSONObject out = new JSONObject();
        try {
            out.put("build", Math.max(bundled == null ? 0 : bundled.optInt("build"), live == null ? 0 : live.optInt("build")));
            out.put("web", live != null ? "downloaded" : "bundled");
            out.put("native", bundled == null ? "" : bundled.optString("native"));
            out.put("stable", bundled != null && bundled.optBoolean("stable"));
            JSONObject r = remote;
            if (r != null) {
                out.put("remoteBuild", r.optInt("build"));
                boolean changed = nativeChanged(bundled, r);
                out.put("nativeUpdate", changed && canSelfUpdate(bundled, r));
                // Native code changed but signatures can't match: point people at caden.apk instead.
                out.put("nativeReinstall", changed && !canSelfUpdate(bundled, r));
            }
        } catch (Exception ignored) { }
        return out;
    }

    private boolean nativeChanged(JSONObject bundled, JSONObject r) {
        return bundled != null && !r.optString("native").isEmpty()
            && !r.optString("native").equals(bundled.optString("native"))
            && r.optInt("build") > bundled.optInt("build");
    }

    // Android only installs an update signed with the same key, so self-update
    // needs both builds signed with the stable release key (CI secrets).
    private boolean canSelfUpdate(JSONObject bundled, JSONObject r) {
        return bundled != null && bundled.optBoolean("stable") && r.optBoolean("stable");
    }

    /** Check the live site; download a newer web build in the background. */
    void check() {
        if (busy) return;
        busy = true;
        new Thread(() -> {
            try {
                JSONObject r = new JSONObject(new String(get(SITE + "version.json?t=" + System.currentTimeMillis()), "UTF-8"));
                remote = r;
                JSONObject bundled = readJson(() -> act.getAssets().open("www/app.json"));
                int have = local().optInt("build");
                if (r.optInt("build") > have) downloadWeb(r);
                if (nativeChanged(bundled, r)) listener.onNativeAvailable(r.optInt("build"));
            } catch (Exception ignored) {
                // offline or the site is down: keep what we have
            } finally {
                busy = false;
            }
        }).start();
    }

    private void downloadWeb(JSONObject r) throws Exception {
        File tmp = new File(act.getFilesDir(), "www-new");
        deleteTree(tmp);
        JSONObject files = r.getJSONObject("files");
        for (Iterator<String> it = files.keys(); it.hasNext(); ) {
            String path = it.next();
            if (path.contains("..") || path.startsWith("/")) throw new IOException("bad path " + path);
            byte[] body = get(SITE + path + "?b=" + r.optInt("build"));
            if (!sha256(body).equals(files.getString(path))) throw new IOException("hash mismatch " + path);
            File f = new File(tmp, path);
            f.getParentFile().mkdirs();
            try (OutputStream o = new FileOutputStream(f)) { o.write(body); }
        }
        JSONObject meta = new JSONObject();
        meta.put("build", r.optInt("build"));
        meta.put("native", r.optString("native"));
        try (OutputStream o = new FileOutputStream(new File(tmp, "app.json"))) { o.write(meta.toString().getBytes("UTF-8")); }
        // Swap only once everything is downloaded and verified.
        File live = liveDir(), old = new File(act.getFilesDir(), "www-old");
        deleteTree(old);
        if (live.exists() && !live.renameTo(old)) throw new IOException("swap failed");
        if (!tmp.renameTo(live)) { old.renameTo(live); throw new IOException("swap failed"); }
        deleteTree(old);
        listener.onWebReady(r.optInt("build"));
    }

    /** Download the new APK, check it, and ask Android to install it. */
    void installNative() {
        new Thread(() -> {
            try {
                JSONObject r = remote;
                JSONObject bundled = readJson(() -> act.getAssets().open("www/app.json"));
                if (r == null || !nativeChanged(bundled, r) || !canSelfUpdate(bundled, r)) return;
                if (Build.VERSION.SDK_INT >= 26 && !act.getPackageManager().canRequestPackageInstalls()) {
                    act.runOnUiThread(() -> act.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + act.getPackageName()))));
                    return;
                }
                byte[] apk = get(SITE + "caden.apk?b=" + r.optInt("build"));
                if (!sha256(apk).equals(r.optString("apkSha256"))) throw new IOException("apk hash mismatch");
                PackageInstaller pi = act.getPackageManager().getPackageInstaller();
                PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
                int id = pi.createSession(params);
                try (PackageInstaller.Session s = pi.openSession(id)) {
                    try (OutputStream o = s.openWrite("caden", 0, apk.length)) { o.write(apk); s.fsync(o); }
                    Intent done = new Intent(act, InstallReceiver.class);
                    int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
                    s.commit(PendingIntent.getBroadcast(act, id, done, flags).getIntentSender());
                }
            } catch (Exception e) {
                android.util.Log.w("Caden", "native update failed", e);
            }
        }).start();
    }

    // ── helpers ─────────────────────────────────────────────────────────────
    interface Opener { InputStream open() throws IOException; }

    private static JSONObject readJson(Opener o) {
        try (InputStream in = o.open()) { return new JSONObject(new String(readAll(in), "UTF-8")); } catch (Exception e) { return null; }
    }

    static byte[] get(String url) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(8000);
        c.setReadTimeout(30000);
        c.setUseCaches(false);
        try {
            if (c.getResponseCode() != 200) throw new IOException(url + " → " + c.getResponseCode());
            try (InputStream in = c.getInputStream()) { return readAll(in); }
        } finally { c.disconnect(); }
    }

    static byte[] readAll(InputStream in) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
        return out.toByteArray();
    }

    static String sha256(byte[] b) throws Exception {
        StringBuilder sb = new StringBuilder();
        for (byte x : MessageDigest.getInstance("SHA-256").digest(b)) sb.append(String.format("%02x", x));
        return sb.toString();
    }

    static void deleteTree(File f) {
        if (f == null || !f.exists()) return;
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) deleteTree(k);
        f.delete();
    }
}
