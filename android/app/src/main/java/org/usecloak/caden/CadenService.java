package org.usecloak.caden;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

/**
 * Keeps this screen part of the home while it's asleep or in the background,
 * so Caden can still be handed to it: a quiet foreground notification plus a
 * partial wake lock keep the WebView's mesh connection (and its JS) running.
 * When Caden flies here, {@link #wake} turns the screen on and brings the app
 * to the front over the lock screen, so the arrival plays in full.
 *
 * Started by JS (CadenNative.keepAlive(true)) once the device is in a home.
 */
public class CadenService extends Service {
    static final String CH_QUIET = "caden.present";
    static final String CH_WAKE = "caden.wake";
    static final int ID_QUIET = 1, ID_WAKE = 2;
    private PowerManager.WakeLock cpu;

    static void start(Context c) {
        Intent i = new Intent(c, CadenService.class);
        try {
            if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i);
        } catch (Exception ignored) { /* background start not allowed right now; JS retries on resume */ }
    }

    static void stop(Context c) { c.stopService(new Intent(c, CadenService.class)); }

    static void channels(Context c) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null || Build.VERSION.SDK_INT < 26) return;
        NotificationChannel q = new NotificationChannel(CH_QUIET, "Caden in this room", NotificationManager.IMPORTANCE_MIN);
        q.setDescription("Keeps this screen ready for Caden to come over.");
        q.setShowBadge(false);
        nm.createNotificationChannel(q);
        NotificationChannel w = new NotificationChannel(CH_WAKE, "Caden arriving", NotificationManager.IMPORTANCE_HIGH);
        w.setDescription("Wakes this screen when Caden moves here.");
        w.setSound(null, null);
        w.enableVibration(false);
        w.setShowBadge(false);
        w.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(w);
    }

    static PendingIntent open(Context c, int req) {
        Intent i = new Intent(c, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .putExtra("caden.wake", true);
        return PendingIntent.getActivity(c, req, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /**
     * Caden is flying here: screen on, app to the front, over the lock screen.
     * Three routes, because Android limits starting activities from the
     * background: a direct start (allowed with "Display over other apps", or
     * while visible), a full-screen-intent notification (allowed for this when
     * the user grants it; it's what wakes a locked phone), and a bright wake lock.
     */
    static void wake(Context c) {
        PowerManager pm = c.getSystemService(PowerManager.class);
        if (pm != null) {
            @SuppressWarnings("deprecation")
            PowerManager.WakeLock screen = pm.newWakeLock(PowerManager.SCREEN_BRIGHT_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP | PowerManager.ON_AFTER_RELEASE, "caden:arrive");
            screen.acquire(8000);
        }
        try { open(c, 2).send(); } catch (Exception ignored) { }
        channels(c);
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null) return;
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, CH_WAKE) : new Notification.Builder(c);
        b.setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("Caden is here")
            .setContentText("Caden just moved to this screen.")
            .setCategory(Notification.CATEGORY_CALL)
            .setPriority(Notification.PRIORITY_MAX)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setTimeoutAfter(10000)
            .setContentIntent(open(c, 3))
            .setFullScreenIntent(open(c, 4), true);
        try { nm.notify(ID_WAKE, b.build()); } catch (SecurityException ignored) { /* notifications off */ }
    }

    static void arrived(Context c) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm != null) nm.cancel(ID_WAKE);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        channels(this);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CH_QUIET) : new Notification.Builder(this);
        Notification n = b.setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("Caden")
            .setContentText("Ready for Caden to come to this room.")
            .setOngoing(true)
            .setContentIntent(open(this, 1))
            .build();
        if (Build.VERSION.SDK_INT >= 34) startForeground(ID_QUIET, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        else startForeground(ID_QUIET, n);
        PowerManager pm = getSystemService(PowerManager.class);
        if (pm != null) {
            cpu = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "caden:present");
            cpu.setReferenceCounted(false);
            cpu.acquire();
        }
    }

    @Override public int onStartCommand(Intent i, int flags, int id) { return START_STICKY; }

    @Override
    public void onDestroy() {
        if (cpu != null && cpu.isHeld()) cpu.release();
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent i) { return null; }
}
