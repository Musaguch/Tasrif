package io.github.musaguch.tasrif;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;

import java.util.ArrayList;

public class MainActivity extends Activity {
    static final String URL = BuildConfig.START_URL;
    static final String HOST = "musaguch.github.io";
    static final int REQ_MIC = 7;
    WebView web;
    float top = 0, bottom = 0;
    Boolean pageDark = null;
    SpeechRecognizer recognizer;
    boolean pendingLong = false;
    boolean pendingListen = false;
    PermissionRequest pendingWebPerm = null;
    final StringBuilder longText = new StringBuilder();
    boolean longMode = false, stopRequested = false;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        Window w = getWindow();
        w.setStatusBarColor(Color.TRANSPARENT);
        w.setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= 29) { w.setNavigationBarContrastEnforced(false); w.setStatusBarContrastEnforced(false); }
        if (Build.VERSION.SDK_INT >= 30) {
            w.setDecorFitsSystemWindows(false);
        } else {
            w.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
        }

        web = new WebView(this);
        web.setBackgroundColor(Color.TRANSPARENT);
        web.addJavascriptInterface(new Bridge(), "TasrifApp");
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setTextZoom(100);
        s.setMediaPlaybackRequiresUserGesture(false);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if (HOST.equals(u.getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception e) {}
                return true;
            }
            @Override public void onPageFinished(WebView v, String url) { pushInsets(); }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(PermissionRequest req) {
                runOnUiThread(() -> {
                    boolean wantsMic = false;
                    for (String r : req.getResources()) if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)) wantsMic = true;
                    if (!wantsMic || !HOST.equals(req.getOrigin().getHost())) { req.deny(); return; }
                    if (micGranted()) req.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                    else { pendingWebPerm = req; askMic(); }
                });
            }
        });
        web.setOnApplyWindowInsetsListener((v, ins) -> {
            float d = getResources().getDisplayMetrics().density;
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets i = ins.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                top = i.top / d; bottom = i.bottom / d;
            } else {
                top = ins.getSystemWindowInsetTop() / d; bottom = ins.getSystemWindowInsetBottom() / d;
            }
            pushInsets();
            return v.onApplyWindowInsets(ins);
        });
        setContentView(web);
        applyIconColors();
        if (b != null) web.restoreState(b); else web.loadUrl(URL);
    }

    boolean micGranted() {
        return Build.VERSION.SDK_INT < 23 || checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
    }
    void askMic() {
        if (Build.VERSION.SDK_INT >= 23) requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQ_MIC);
    }
    @Override public void onRequestPermissionsResult(int code, String[] perms, int[] res) {
        if (code != REQ_MIC) return;
        boolean ok = res.length > 0 && res[0] == PackageManager.PERMISSION_GRANTED;
        if (pendingWebPerm != null) {
            if (ok) pendingWebPerm.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE}); else pendingWebPerm.deny();
            pendingWebPerm = null;
        }
        if (pendingListen) {
            pendingListen = false;
            if (ok) startListening(pendingLong); else js("window.__voice&&__voice.onError('perm')");
        }
    }

    void js(String code) { runOnUiThread(() -> { if (web != null) web.evaluateJavascript(code, null); }); }

    void startListening(boolean lng) {
        if (!SpeechRecognizer.isRecognitionAvailable(this)) { js("window.__voice&&__voice.onError('unsupported')"); return; }
        if (!micGranted()) { pendingListen = true; pendingLong = lng; askMic(); return; }
        longMode = lng; stopRequested = false; longText.setLength(0);
        if (recognizer != null) { try { recognizer.destroy(); } catch (Exception e) {} }
        recognizer = SpeechRecognizer.createSpeechRecognizer(this);
        recognizer.setRecognitionListener(new RecognitionListener() {
            public void onReadyForSpeech(Bundle p) {}
            public void onBeginningOfSpeech() {}
            public void onRmsChanged(float v) {}
            public void onBufferReceived(byte[] buf) {}
            public void onEndOfSpeech() {}
            public void onPartialResults(Bundle p) {}
            public void onEvent(int t, Bundle p) {}
            public void onError(int err) {
                if (longMode && !stopRequested && (err == SpeechRecognizer.ERROR_NO_MATCH || err == SpeechRecognizer.ERROR_SPEECH_TIMEOUT)) { restart(); return; }
                if (longMode && longText.length() > 0) { deliver(new ArrayList<String>() {{ add(longText.toString().trim()); }}); return; }
                String code = err == SpeechRecognizer.ERROR_NO_MATCH || err == SpeechRecognizer.ERROR_SPEECH_TIMEOUT ? "no-speech"
                    : err == SpeechRecognizer.ERROR_NETWORK || err == SpeechRecognizer.ERROR_NETWORK_TIMEOUT ? "network"
                    : err == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS ? "perm"
                    : err == SpeechRecognizer.ERROR_RECOGNIZER_BUSY ? "busy" : ("e" + err);
                js("window.__voice&&__voice.onError('" + code + "')");
            }
            public void onResults(Bundle r) {
                ArrayList<String> list = r.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                if (longMode) {
                    if (list != null && !list.isEmpty()) longText.append(' ').append(list.get(0));
                    if (!stopRequested) { restart(); return; }
                    ArrayList<String> one = new ArrayList<>(); one.add(longText.toString().trim()); deliver(one); return;
                }
                deliver(list);
            }
        });
        recognizer.startListening(intent());
    }
    Intent intent() {
        Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ar-SA");
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "ar-SA");
        i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5);
        i.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getPackageName());
        return i;
    }
    void restart() { runOnUiThread(() -> { try { recognizer.startListening(intent()); } catch (Exception e) {} }); }
    void deliver(ArrayList<String> list) {
        JSONArray a = new JSONArray();
        if (list != null) for (String x : list) if (x != null && !x.trim().isEmpty()) a.put(x);
        js("window.__voice&&__voice.onResult(" + a.toString() + ")");
    }
    void stopListening() {
        stopRequested = true;
        if (recognizer == null) return;
        try { recognizer.stopListening(); } catch (Exception e) {}
    }

    void pushInsets() {
        if (web == null) return;
        web.evaluateJavascript("(function(s){s.setProperty('--sat','" + top + "px');s.setProperty('--sab','" + bottom + "px');})(document.documentElement.style)", null);
    }

    void applyIconColors() {
        boolean night = pageDark != null ? pageDark
            : (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        Window w = getWindow();
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = w.getInsetsController();
            if (c != null) {
                int m = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                c.setSystemBarsAppearance(night ? 0 : m, m);
            }
        } else if (Build.VERSION.SDK_INT >= 26) {
            int f = w.getDecorView().getSystemUiVisibility();
            int m = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
            w.getDecorView().setSystemUiVisibility(night ? (f & ~m) : (f | m));
        }
    }

    class Bridge {
        @JavascriptInterface public void setDark(boolean d) { runOnUiThread(() -> { pageDark = d; applyIconColors(); }); }
        @JavascriptInterface public boolean hasSpeech() {
            return micDeclared() && SpeechRecognizer.isRecognitionAvailable(MainActivity.this);
        }
        @JavascriptInterface public void listen(boolean lng) { runOnUiThread(() -> startListening(lng)); }
        @JavascriptInterface public void stopListening() { runOnUiThread(MainActivity.this::stopListening); }
    }
    boolean micDeclared() {
        try {
            String[] p = getPackageManager().getPackageInfo(getPackageName(), PackageManager.GET_PERMISSIONS).requestedPermissions;
            if (p != null) for (String x : p) if (Manifest.permission.RECORD_AUDIO.equals(x)) return true;
        } catch (Exception e) {}
        return false;
    }

    @Override public void onConfigurationChanged(Configuration c) { super.onConfigurationChanged(c); applyIconColors(); }
    @Override protected void onSaveInstanceState(Bundle o) { super.onSaveInstanceState(o); web.saveState(o); }
    @Override protected void onDestroy() { if (recognizer != null) try { recognizer.destroy(); } catch (Exception e) {} super.onDestroy(); }
    @Override public void onBackPressed() { if (web.canGoBack()) web.goBack(); else super.onBackPressed(); }
}
