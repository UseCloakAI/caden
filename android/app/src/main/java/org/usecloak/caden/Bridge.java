package org.usecloak.caden;

import android.content.Context;
import android.content.Intent;
import android.media.AudioManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Locale;

/**
 * window.CadenNative — native ears and mouth for the web app (voice.js).
 *   startListening(lang) / stopListening()   one recognition session; JS loops it
 *   speak(text, id, rate) / stopSpeaking()
 * Results come back as window.__cadenNative.onSpeech(kind, text) with kind
 * partial | final | level | end | error, and onSpeakDone(id).
 */
public class Bridge {
    private final Context ctx;
    private final WebView web;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final AudioManager audio;
    private SpeechRecognizer rec;
    private TextToSpeech tts;
    private boolean ttsReady;
    private boolean muted;
    private long lastLevel;
    private Updater updater;

    void setUpdater(Updater u) { updater = u; }

    void notifyUpdate(String kind, int build) {
        js("onUpdate", kind, String.valueOf(build));
    }

    // ── updates (Updater.java) ──────────────────────────────────────────────
    /** {build, web: bundled|downloaded, native, stable, remoteBuild?, nativeUpdate?, nativeReinstall?} */
    @JavascriptInterface
    public String updateInfo() { return updater == null ? "{}" : updater.local().toString(); }

    @JavascriptInterface
    public void checkUpdate() { if (updater != null) updater.check(); }

    /** Switch to the downloaded web build (JS calls this when Caden is idle). */
    @JavascriptInterface
    public void applyUpdate() { if (ctx instanceof MainActivity) ((MainActivity) ctx).reloadApp(); }

    @JavascriptInterface
    public void installUpdate() { if (updater != null) updater.installNative(); }

    // ── waking for Caden (CadenService.java) ────────────────────────────────
    private boolean alive;

    /** Stay connected to the home while asleep / in the background. */
    @JavascriptInterface
    public void keepAlive(boolean on) {
        alive = on;
        main.post(() -> { if (on) CadenService.start(ctx); else CadenService.stop(ctx); });
    }
    boolean keepingAlive() { return alive; }

    /** Screen brightness for this window: 0..1, or below 0 for the system's own (dim / lock). */
    @JavascriptInterface
    public void setBrightness(float level) {
        main.post(() -> {
            if (!(ctx instanceof android.app.Activity)) return;
            android.view.Window w = ((android.app.Activity) ctx).getWindow();
            android.view.WindowManager.LayoutParams lp = w.getAttributes();
            lp.screenBrightness = level < 0 ? android.view.WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE : Math.max(0.01f, Math.min(1f, level));
            w.setAttributes(lp);
        });
    }

    /** Caden is flying here: screen on, app to the front, over the lock screen. */
    @JavascriptInterface
    public void wake() { main.post(() -> CadenService.wake(ctx)); }

    /** {overlay, fullScreen, notifications}: what this phone allows for waking. */
    @JavascriptInterface
    public String wakeStatus() {
        try {
            JSONObject o = new JSONObject();
            o.put("overlay", android.os.Build.VERSION.SDK_INT < 23 || android.provider.Settings.canDrawOverlays(ctx));
            android.app.NotificationManager nm = ctx.getSystemService(android.app.NotificationManager.class);
            o.put("fullScreen", android.os.Build.VERSION.SDK_INT < 34 || (nm != null && nm.canUseFullScreenIntent()));
            o.put("notifications", nm == null || nm.areNotificationsEnabled());
            return o.toString();
        } catch (Exception e) { return "{}"; }
    }

    /** Open the system page that grants what's missing (which: overlay | fullScreen | notifications). */
    @JavascriptInterface
    public void openWakeSettings(String which) {
        main.post(() -> {
            String pkg = "package:" + ctx.getPackageName();
            Intent i;
            if ("overlay".equals(which)) i = new Intent(android.provider.Settings.ACTION_MANAGE_OVERLAY_PERMISSION, android.net.Uri.parse(pkg));
            else if ("fullScreen".equals(which) && android.os.Build.VERSION.SDK_INT >= 34) i = new Intent(android.provider.Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, android.net.Uri.parse(pkg));
            else i = new Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, ctx.getPackageName());
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try { ctx.startActivity(i); } catch (Exception e) {
                try { ctx.startActivity(new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, android.net.Uri.parse(pkg)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); } catch (Exception ignored) { }
            }
        });
    }

    Bridge(Context ctx, WebView web) {
        this.ctx = ctx;
        this.web = web;
        this.audio = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
        tts = new TextToSpeech(ctx, status -> {
            ttsReady = status == TextToSpeech.SUCCESS;
            if (ttsReady) {
                tts.setLanguage(Locale.getDefault());
                tts.setPitch(1.05f);
            }
        });
        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override public void onStart(String id) { }
            @Override public void onDone(String id) { js("onSpeakDone", null, id); }
            @Override public void onError(String id) { js("onSpeakDone", null, id); }
            @Override public void onStop(String id, boolean interrupted) { js("onSpeakDone", null, id); }
        });
    }

    private void js(String fn, String kind, String text) {
        String args = (kind != null ? JSONObject.quote(kind) + "," : "") + JSONObject.quote(text == null ? "" : text);
        String code = "window.__cadenNative&&window.__cadenNative." + fn + "&&window.__cadenNative." + fn + "(" + args + ")";
        main.post(() -> web.evaluateJavascript(code, null));
    }

    // The recognizer chimes on every session start; a wake-word loop restarts
    // it constantly, so the chime streams stay muted while Caden is listening.
    private void mute(boolean on) {
        if (muted == on) return;
        muted = on;
        int dir = on ? AudioManager.ADJUST_MUTE : AudioManager.ADJUST_UNMUTE;
        for (int s : new int[]{AudioManager.STREAM_NOTIFICATION, AudioManager.STREAM_SYSTEM}) {
            try { audio.adjustStreamVolume(s, dir, 0); } catch (Exception ignored) { }
        }
    }

    @JavascriptInterface
    public void startListening(String lang) {
        main.post(() -> {
            if (!SpeechRecognizer.isRecognitionAvailable(ctx)) { js("onSpeech", "error", "unavailable"); return; }
            if (rec == null) {
                rec = SpeechRecognizer.createSpeechRecognizer(ctx);
                rec.setRecognitionListener(listener);
            }
            mute(true);
            Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            i.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
            i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
            i.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, ctx.getPackageName());
            if (lang != null && !lang.isEmpty()) i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang);
            i.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 1200L);
            try { rec.startListening(i); } catch (Exception e) { js("onSpeech", "error", String.valueOf(e.getMessage())); }
        });
    }

    @JavascriptInterface
    public void stopListening() {
        main.post(() -> {
            if (rec != null) { try { rec.cancel(); } catch (Exception ignored) { } }
            mute(false);
        });
    }

    @JavascriptInterface
    public void speak(String text, String id, float rate) {
        main.post(() -> {
            if (!ttsReady) { js("onSpeakDone", null, id); return; }
            tts.setSpeechRate(rate > 0 ? rate : 1f);
            Bundle p = new Bundle();
            p.putInt(TextToSpeech.Engine.KEY_PARAM_STREAM, AudioManager.STREAM_MUSIC);
            tts.speak(text, TextToSpeech.QUEUE_ADD, p, id);
        });
    }

    @JavascriptInterface
    public void stopSpeaking() { main.post(() -> { if (tts != null) tts.stop(); }); }

    void quiet() {
        main.post(() -> {
            if (rec != null) { try { rec.cancel(); } catch (Exception ignored) { } }
            if (tts != null) tts.stop();
            mute(false);
        });
    }

    void shutdown() {
        mute(false);
        if (rec != null) rec.destroy();
        if (tts != null) tts.shutdown();
    }

    private final RecognitionListener listener = new RecognitionListener() {
        @Override public void onReadyForSpeech(Bundle b) { }
        @Override public void onBeginningOfSpeech() { }
        @Override public void onBufferReceived(byte[] b) { }
        @Override public void onEndOfSpeech() { }
        @Override public void onEvent(int t, Bundle b) { }

        @Override public void onRmsChanged(float db) {
            long now = System.currentTimeMillis();
            if (now - lastLevel < 90) return;
            lastLevel = now;
            float v = Math.max(0f, Math.min(1f, (db + 2f) / 12f));
            js("onSpeech", "level", String.valueOf(v));
            js("onSpeech", "rms", String.valueOf(db)); // raw, for voice location (js/locate.js)
        }

        @Override public void onPartialResults(Bundle b) {
            String t = first(b);
            if (t != null && !t.isEmpty()) js("onSpeech", "partial", t);
        }

        @Override public void onResults(Bundle b) {
            String t = first(b);
            if (t != null && !t.isEmpty()) js("onSpeech", "final", t);
            js("onSpeech", "end", "");
        }

        @Override public void onError(int code) {
            boolean quietMiss = code == SpeechRecognizer.ERROR_NO_MATCH || code == SpeechRecognizer.ERROR_SPEECH_TIMEOUT;
            js("onSpeech", quietMiss ? "end" : "error", String.valueOf(code));
            if (code == SpeechRecognizer.ERROR_RECOGNIZER_BUSY || code == SpeechRecognizer.ERROR_CLIENT) {
                main.post(() -> { if (rec != null) { rec.destroy(); rec = null; } });
            }
        }
    };

    private static String first(Bundle b) {
        ArrayList<String> r = b == null ? null : b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        return r == null || r.isEmpty() ? null : r.get(0);
    }
}
