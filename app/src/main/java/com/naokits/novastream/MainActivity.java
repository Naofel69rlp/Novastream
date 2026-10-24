package com.naokits.novastream;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.UiModeManager;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.net.Uri;
import android.view.ViewGroup;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceResponse;
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

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

/**
 * Écran principal : l'interface NovaStream (HTML/JS dans assets/web) affichée dans une WebView.
 * La WebView reçoit les touches de la télécommande comme des flèches et la touche Entrée.
 */
public class MainActivity extends Activity {

    static final String USER_AGENT = "NovaStream-TV/1.0 (Linux; Android) ExoPlayer";

    /** Adresse interne : l'interface et le relais vers le serveur IPTV sont servis par l'appli elle-même. */
    static final String HOST = "appassets.androidplatform.net";
    static final String START_URL = "https://" + HOST + "/web/index.html";

    private WebView web;

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
                // L'interface ne quitte jamais ses propres pages.
                return !HOST.equals(request.getUrl().getHost());
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (!HOST.equals(url.getHost())) return null;
                String path = url.getPath() == null ? "" : url.getPath();
                if (path.equals("/api")) {
                    return proxy(url.getQueryParameter("u"), "1".equals(url.getQueryParameter("compact")));
                }
                if (path.startsWith("/web/")) return asset(path.substring(1));
                return error(404, "Introuvable");
            }

            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                // Si l'affichage manque de mémoire, on le relance au lieu de fermer l'appli.
                ViewGroup parent = (ViewGroup) view.getParent();
                if (parent != null) parent.removeView(view);
                view.destroy();
                web = null;
                recreate();
                return true;
            }
        });

        setContentView(web);
        web.loadUrl(START_URL);
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
        if (event.getKeyCode() == KeyEvent.KEYCODE_BACK && web != null) {
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
        if (web != null) web.destroy();
        super.onDestroy();
    }

    /**
     * Relais vers le serveur IPTV : la réponse est transmise en flux à la WebView, sans être copiée en mémoire.
     * Pour les grandes listes (films, séries, chaînes), seuls les champs utiles sont gardés (voir JsonCompactor).
     */
    private WebResourceResponse proxy(String target, boolean compact) {
        if (target == null || !(target.startsWith("http://") || target.startsWith("https://"))) {
            return error(400, "Adresse invalide.");
        }
        try {
            HttpURLConnection c = open(target);
            int status = c.getResponseCode();
            if (status < 200 || (status >= 300 && status < 400) || status > 599) {
                return error(502, "Réponse inattendue du serveur (HTTP " + status + ").");
            }
            InputStream in = status >= 400 ? c.getErrorStream() : c.getInputStream();
            if (in == null) in = new ByteArrayInputStream(new byte[0]);
            if (compact && status < 300) in = JsonCompactor.compact(in);
            return new WebResourceResponse("application/json", "utf-8", status, status < 300 ? "OK" : "Error", headers(), in);
        } catch (SocketTimeoutException e) {
            return error(504, "Délai de connexion dépassé. Le serveur ne répond pas.");
        } catch (IOException | RuntimeException e) {
            return error(502, "Impossible de joindre le serveur. Vérifiez l'URL ou votre connexion.");
        }
    }

    private WebResourceResponse asset(String path) {
        String mime = path.endsWith(".js") ? "application/javascript"
                : path.endsWith(".css") ? "text/css"
                : path.endsWith(".png") ? "image/png"
                : path.endsWith(".jpg") ? "image/jpeg"
                : "text/html";
        try {
            return new WebResourceResponse(mime, "utf-8", 200, "OK", headers(), getAssets().open(path));
        } catch (IOException e) {
            return error(404, "Introuvable");
        }
    }

    private static Map<String, String> headers() {
        Map<String, String> h = new HashMap<>();
        h.put("Access-Control-Allow-Origin", "*");
        h.put("Cache-Control", "no-store");
        return h;
    }

    private static WebResourceResponse error(int status, String message) {
        byte[] body = ("{\"error\":" + JSONObject.quote(message) + "}").getBytes(StandardCharsets.UTF_8);
        return new WebResourceResponse("application/json", "utf-8", status, "Error", headers(), new ByteArrayInputStream(body));
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
