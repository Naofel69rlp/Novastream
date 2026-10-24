package com.naokits.novastream;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.UiModeManager;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.os.Bundle;
import android.view.KeyEvent;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Écran principal : l'interface NovaStream (HTML/JS dans assets/web) affichée dans une WebView.
 * La WebView reçoit les touches de la télécommande comme des flèches et la touche Entrée.
 */
public class MainActivity extends Activity {

    static final String USER_AGENT = "NovaStream-TV/1.0 (Linux; Android) ExoPlayer";

    private WebView web;
    private final ExecutorService network = Executors.newFixedThreadPool(4);

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        web.setBackgroundColor(0xFF09090B);
        web.setFocusable(true);
        web.setFocusableInTouchMode(true);

        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        web.addJavascriptInterface(new Bridge(), "Android");
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                // L'interface ne quitte jamais ses propres fichiers.
                return !request.getUrl().toString().startsWith("file:///android_asset/");
            }
        });

        setContentView(web);
        web.loadUrl("file:///android_asset/web/index.html");
        web.requestFocus();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) {
            web.requestFocus();
            web.evaluateJavascript("window.NS && NS.focus()", null);
        }
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        // La touche Retour est confiée à l'interface ; si elle n'a rien à fermer, on quitte l'appli.
        if (event.getKeyCode() == KeyEvent.KEYCODE_BACK) {
            if (event.getAction() == KeyEvent.ACTION_UP) {
                web.evaluateJavascript("window.NS ? NS.back() : false", value -> {
                    if (!"true".equals(value)) finish();
                });
            }
            return true;
        }
        return super.dispatchKeyEvent(event);
    }

    @Override
    protected void onDestroy() {
        network.shutdownNow();
        if (web != null) web.destroy();
        super.onDestroy();
    }

    private void deliver(int id, int status, String body) {
        final String js = "window.__nsHttp(" + id + "," + status + "," + JSONObject.quote(body) + ")";
        runOnUiThread(() -> {
            if (!isDestroyed()) web.evaluateJavascript(js, null);
        });
    }

    static String readAll(InputStream in) throws IOException {
        if (in == null) return "";
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[64 * 1024];
        int n;
        while ((n = in.read(buffer)) != -1) out.write(buffer, 0, n);
        in.close();
        return out.toString("UTF-8");
    }

    /** Requête GET qui suit aussi les redirections http ↔ https (que HttpURLConnection ignore). */
    static HttpURLConnection open(String address) throws IOException {
        for (int hops = 0; hops < 5; hops++) {
            HttpURLConnection c = (HttpURLConnection) new URL(address).openConnection();
            c.setConnectTimeout(12000);
            c.setReadTimeout(45000);
            c.setInstanceFollowRedirects(false);
            c.setRequestProperty("User-Agent", USER_AGENT);
            c.setRequestProperty("Accept", "application/json, */*");
            int code = c.getResponseCode();
            if (code >= 300 && code < 400 && c.getHeaderField("Location") != null) {
                address = new URL(new URL(address), c.getHeaderField("Location")).toString();
                c.disconnect();
                continue;
            }
            return c;
        }
        throw new IOException("Trop de redirections.");
    }

    /** Fonctions appelées depuis le JavaScript de l'interface (window.Android). */
    private class Bridge {

        @JavascriptInterface
        public void httpGet(final int id, final String url) {
            network.execute(() -> {
                try {
                    HttpURLConnection c = open(url);
                    int status = c.getResponseCode();
                    String body = readAll(status >= 400 ? c.getErrorStream() : c.getInputStream());
                    c.disconnect();
                    deliver(id, status, body);
                } catch (SocketTimeoutException e) {
                    deliver(id, 0, "Délai de connexion dépassé. Le serveur ne répond pas.");
                } catch (IOException | RuntimeException e) {
                    deliver(id, 0, "Impossible de joindre le serveur. Vérifiez l'URL ou votre connexion.");
                }
            });
        }

        @JavascriptInterface
        public void play(String json) {
            try {
                JSONObject o = new JSONObject(json);
                JSONArray urls = o.getJSONArray("urls");
                JSONArray titles = o.getJSONArray("titles");
                String[] u = new String[urls.length()];
                String[] t = new String[urls.length()];
                for (int i = 0; i < u.length; i++) {
                    u[i] = urls.getString(i);
                    t[i] = titles.optString(i, "");
                }
                Intent intent = new Intent(MainActivity.this, PlayerActivity.class);
                intent.putExtra(PlayerActivity.EXTRA_URLS, u);
                intent.putExtra(PlayerActivity.EXTRA_TITLES, t);
                intent.putExtra(PlayerActivity.EXTRA_INDEX, o.optInt("index", 0));
                intent.putExtra(PlayerActivity.EXTRA_LIVE, o.optBoolean("live", false));
                intent.putExtra(PlayerActivity.EXTRA_SUBTITLE, o.optString("subtitle", ""));
                runOnUiThread(() -> startActivity(intent));
            } catch (JSONException ignored) {
                // Charge utile invalide : rien à lire.
            }
        }

        /** Vrai sur Android TV / Google TV / Fire TV : l'interface passe en mode télécommande. */
        @JavascriptInterface
        public boolean isTv() {
            UiModeManager ui = (UiModeManager) getSystemService(UI_MODE_SERVICE);
            if (ui != null && ui.getCurrentModeType() == Configuration.UI_MODE_TYPE_TELEVISION) return true;
            PackageManager pm = getPackageManager();
            return pm.hasSystemFeature("amazon.hardware.fire_tv")
                    || !pm.hasSystemFeature(PackageManager.FEATURE_TOUCHSCREEN);
        }

        @JavascriptInterface
        public String version() {
            try {
                PackageInfo info = getPackageManager().getPackageInfo(getPackageName(), 0);
                return info.versionName;
            } catch (Exception e) {
                return "1.0";
            }
        }
    }
}
