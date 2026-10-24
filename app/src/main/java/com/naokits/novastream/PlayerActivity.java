package com.naokits.novastream;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.OptIn;
import androidx.media3.common.C;
import androidx.media3.common.Format;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.TrackSelectionOverride;
import androidx.media3.common.TrackSelectionParameters;
import androidx.media3.common.Tracks;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.datasource.DefaultDataSource;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.datasource.HttpDataSource;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.ui.AspectRatioFrameLayout;
import androidx.media3.ui.PlayerView;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Lecteur plein écran (ExoPlayer) : lit HLS, MPEG-TS, MP4 et MKV, en ligne ou téléchargés.
 * Direct : haut/bas ou CH+/CH- changent de chaîne. Films et séries : l'épisode suivant s'enchaîne.
 */
@OptIn(markerClass = UnstableApi.class)
public class PlayerActivity extends Activity {

    static final String EXTRA_URLS = "urls";
    static final String EXTRA_TITLES = "titles";
    static final String EXTRA_INDEX = "index";
    static final String EXTRA_LIVE = "live";
    static final String EXTRA_SUBTITLE = "subtitle";
    static final String EXTRA_AUDIO_LANG = "audioLang";
    static final String EXTRA_SUB_LANG = "subLang";
    static final String EXTRA_RESIZE = "resize";
    static final String EXTRA_ALTS = "alts";

    private static final String[] RESIZE_KEYS = {"fit", "zoom", "fill"};
    private static final String[] RESIZE_LABELS = {"Adapté à l'écran", "Plein écran (zoom)", "Étiré"};
    private static final int[] RESIZE_MODES = {
            AspectRatioFrameLayout.RESIZE_MODE_FIT, AspectRatioFrameLayout.RESIZE_MODE_ZOOM, AspectRatioFrameLayout.RESIZE_MODE_FILL};

    private ExoPlayer player;
    private PlayerView playerView;
    private TextView banner;
    private TextView optionsButton;
    private int resizeIndex;
    private DefaultHttpDataSource.Factory http;
    private int uaIndex;
    private int uaTries;
    private String[] primaryUrls;
    private String[][] alts;
    private int[] altUsed;
    private LinearLayout errorPanel;
    private TextView errorText;
    private String[] urls;
    private String[] titles;
    private boolean live;
    private String subtitle;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable hideBanner = () -> banner.animate().alpha(0f).setDuration(300);

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        Intent intent = getIntent();
        urls = intent.getStringArrayExtra(EXTRA_URLS);
        titles = intent.getStringArrayExtra(EXTRA_TITLES);
        live = intent.getBooleanExtra(EXTRA_LIVE, false);
        subtitle = intent.getStringExtra(EXTRA_SUBTITLE);
        if (urls == null || urls.length == 0) {
            finish();
            return;
        }
        if (titles == null || titles.length != urls.length) titles = new String[urls.length];
        primaryUrls = urls.clone();
        alts = parseAlts(intent.getStringExtra(EXTRA_ALTS), urls.length);
        altUsed = new int[urls.length];
        int index = Math.max(0, Math.min(intent.getIntExtra(EXTRA_INDEX, 0), urls.length - 1));

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);

        playerView = new PlayerView(this);
        playerView.setKeepScreenOn(true);
        playerView.setControllerShowTimeoutMs(3500);
        playerView.setShowShuffleButton(false);
        playerView.setShowSubtitleButton(true);
        root.addView(playerView, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        banner = new TextView(this);
        banner.setTextColor(Color.WHITE);
        banner.setTextSize(TypedValue.COMPLEX_UNIT_SP, 22);
        banner.setTypeface(Typeface.DEFAULT_BOLD);
        banner.setPadding(dp(24), dp(14), dp(24), dp(14));
        banner.setBackground(rounded(0xCC111116, 14));
        FrameLayout.LayoutParams bannerParams = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        bannerParams.gravity = Gravity.TOP | Gravity.START;
        bannerParams.setMargins(dp(40), dp(32), dp(40), 0);
        root.addView(banner, bannerParams);

        // Bouton « Langue · Sous-titres · Format », visible avec les commandes du lecteur.
        optionsButton = new TextView(this);
        optionsButton.setText("Langue · Sous-titres · Format");
        optionsButton.setTextColor(Color.WHITE);
        optionsButton.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        optionsButton.setTypeface(Typeface.DEFAULT_BOLD);
        optionsButton.setPadding(dp(20), dp(12), dp(20), dp(12));
        optionsButton.setBackground(rounded(0xCC262638, 12));
        optionsButton.setFocusable(true);
        optionsButton.setClickable(true);
        optionsButton.setVisibility(View.GONE);
        optionsButton.setOnClickListener(v -> showOptions());
        optionsButton.setOnFocusChangeListener((v, hasFocus) ->
                v.setBackground(rounded(hasFocus ? 0xFF3B82F6 : 0xCC262638, 12)));
        FrameLayout.LayoutParams optionsParams = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        optionsParams.gravity = Gravity.TOP | Gravity.END;
        optionsParams.setMargins(dp(40), dp(32), dp(40), 0);
        root.addView(optionsButton, optionsParams);
        playerView.setControllerVisibilityListener(new PlayerView.ControllerVisibilityListener() {
            @Override
            public void onVisibilityChanged(int visibility) {
                boolean hadFocus = optionsButton.hasFocus();
                optionsButton.setVisibility(visibility == View.VISIBLE ? View.VISIBLE : View.GONE);
                if (hadFocus && visibility != View.VISIBLE) playerView.requestFocus();
            }
        });

        root.addView(buildErrorPanel(), new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);

        uaIndex = UserAgents.index(this);
        http = new DefaultHttpDataSource.Factory()
                .setUserAgent(UserAgents.ALL[uaIndex])
                .setAllowCrossProtocolRedirects(true)
                .setConnectTimeoutMs(15000)
                .setReadTimeoutMs(30000);
        player = new ExoPlayer.Builder(this)
                .setMediaSourceFactory(new DefaultMediaSourceFactory(this).setDataSourceFactory(new DefaultDataSource.Factory(this, http)))
                .setSeekBackIncrementMs(10000)
                .setSeekForwardIncrementMs(30000)
                .build();
        playerView.setPlayer(player);

        // Préférences choisies dans Paramètres.
        resizeIndex = Math.max(0, java.util.Arrays.asList(RESIZE_KEYS).indexOf(intent.getStringExtra(EXTRA_RESIZE)));
        playerView.setResizeMode(RESIZE_MODES[resizeIndex]);
        String audioLang = intent.getStringExtra(EXTRA_AUDIO_LANG);
        String subLang = intent.getStringExtra(EXTRA_SUB_LANG);
        boolean subsOff = subLang == null || subLang.isEmpty() || "off".equals(subLang);
        player.setTrackSelectionParameters(player.getTrackSelectionParameters().buildUpon()
                .setPreferredAudioLanguage(audioLang == null || audioLang.isEmpty() ? null : audioLang)
                .setPreferredTextLanguage(subsOff ? null : subLang)
                .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, subsOff)
                .build());

        List<MediaItem> items = new ArrayList<>();
        for (int i = 0; i < urls.length; i++) items.add(mediaItem(i));
        player.addListener(new Player.Listener() {
            @Override
            public void onMediaItemTransition(MediaItem mediaItem, int reason) {
                hideError();
                showBanner();
            }

            @Override
            public void onPlayerError(PlaybackException error) {
                if (error.errorCode == PlaybackException.ERROR_CODE_BEHIND_LIVE_WINDOW) {
                    player.seekToDefaultPosition();
                    player.prepare();
                    return;
                }
                // Accès refusé : le serveur n'accepte peut-être pas cet identifiant de lecteur, on essaie le suivant.
                int code = httpCode(error);
                boolean refused = code == 401 || code == 403 || code == 406;
                if (refused && uaTries < UserAgents.ALL.length - 1) {
                    uaTries++;
                    uaIndex = (uaIndex + 1) % UserAgents.ALL.length;
                    http.setUserAgent(UserAgents.ALL[uaIndex]);
                    player.prepare();
                    player.play();
                    return;
                }
                // Puis les adresses de secours (chemin /movie/, autre conteneur, source directe).
                int i = player.getCurrentMediaItemIndex();
                if ((refused || code == 404) && i < alts.length && altUsed[i] < alts[i].length) {
                    urls[i] = alts[i][altUsed[i]++];
                    uaTries = UserAgents.ALL.length;
                    uaIndex = UserAgents.index(PlayerActivity.this);
                    http.setUserAgent(UserAgents.ALL[uaIndex]);
                    player.replaceMediaItem(i, mediaItem(i));
                    player.prepare();
                    player.play();
                    return;
                }
                showError(error, code);
            }

            @Override
            public void onPlaybackStateChanged(int state) {
                if (state == Player.STATE_READY) {
                    UserAgents.remember(PlayerActivity.this, uaIndex);
                    uaTries = 0;
                }
            }
        });
        player.setMediaItems(items, index, 0);
        player.prepare();
        player.play();
        showBanner();
    }

    private MediaItem mediaItem(int i) {
        return new MediaItem.Builder()
                .setUri(urls[i])
                .setMediaId(String.valueOf(i))
                .setMediaMetadata(new MediaMetadata.Builder().setTitle(titleAt(i)).build())
                .build();
    }

    private static String[][] parseAlts(String json, int count) {
        String[][] out = new String[count][];
        for (int i = 0; i < count; i++) out[i] = new String[0];
        if (json == null) return out;
        try {
            org.json.JSONArray all = new org.json.JSONArray(json);
            for (int i = 0; i < count && i < all.length(); i++) {
                org.json.JSONArray a = all.optJSONArray(i);
                if (a == null) continue;
                out[i] = new String[a.length()];
                for (int j = 0; j < a.length(); j++) out[i][j] = a.optString(j, "");
            }
        } catch (org.json.JSONException ignored) {
            // Pas d'adresses de secours.
        }
        return out;
    }

    private String titleAt(int i) {
        String t = titles[i];
        return t == null || t.isEmpty() ? "NovaStream" : t;
    }

    private void showBanner() {
        int i = player == null ? 0 : player.getCurrentMediaItemIndex();
        String text = titleAt(i);
        if (live && urls.length > 1) text = (i + 1) + "  ·  " + text;
        else if (subtitle != null && !subtitle.isEmpty() && !live) text = text + "\n" + subtitle;
        banner.setText(live ? "● DIRECT   " + text : text);
        banner.setAlpha(1f);
        handler.removeCallbacks(hideBanner);
        handler.postDelayed(hideBanner, 4000);
    }

    private void zap(int delta) {
        if (urls.length < 2) return;
        int next = (player.getCurrentMediaItemIndex() + delta + urls.length) % urls.length;
        player.seekToDefaultPosition(next);
        player.prepare();
        player.play();
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (event.getAction() == KeyEvent.ACTION_DOWN && errorPanel.getVisibility() != View.VISIBLE) {
            int code = event.getKeyCode();
            boolean controllerVisible = playerView.isControllerFullyVisible();
            if (live && (code == KeyEvent.KEYCODE_CHANNEL_UP || (code == KeyEvent.KEYCODE_DPAD_UP && !controllerVisible))) {
                zap(-1);
                return true;
            }
            if (live && (code == KeyEvent.KEYCODE_CHANNEL_DOWN || (code == KeyEvent.KEYCODE_DPAD_DOWN && !controllerVisible))) {
                zap(1);
                return true;
            }
            if (code == KeyEvent.KEYCODE_INFO) {
                showBanner();
                return true;
            }
            if (code == KeyEvent.KEYCODE_MENU || code == KeyEvent.KEYCODE_CAPTIONS
                    || code == KeyEvent.KEYCODE_MEDIA_AUDIO_TRACK || code == KeyEvent.KEYCODE_SETTINGS) {
                showOptions();
                return true;
            }
        }
        return super.dispatchKeyEvent(event);
    }

    // ---------------------------------------------------------------- Langue, sous-titres, format

    /** Menu des options de la vidéo en cours : langue audio, sous-titres, format de l'image. */
    private void showOptions() {
        String[] rows = {
                "Langue audio : " + selectedLabel(C.TRACK_TYPE_AUDIO, "Automatique"),
                "Sous-titres : " + selectedLabel(C.TRACK_TYPE_TEXT, "Désactivés"),
                "Format de l'image : " + RESIZE_LABELS[resizeIndex]
        };
        new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                .setTitle("Options de lecture")
                .setItems(rows, (d, which) -> {
                    if (which == 0) chooseTrack(C.TRACK_TYPE_AUDIO);
                    else if (which == 1) chooseTrack(C.TRACK_TYPE_TEXT);
                    else chooseResize();
                })
                .show();
    }

    private void chooseResize() {
        new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                .setTitle("Format de l'image")
                .setSingleChoiceItems(RESIZE_LABELS, resizeIndex, (d, which) -> {
                    resizeIndex = which;
                    playerView.setResizeMode(RESIZE_MODES[which]);
                    d.dismiss();
                })
                .show();
    }

    /** Liste les pistes audio (ou de sous-titres) du flux et applique celle choisie. */
    private void chooseTrack(int type) {
        List<Tracks.Group> groups = new ArrayList<>();
        List<Integer> indexes = new ArrayList<>();
        List<String> labels = new ArrayList<>();
        int checked = -1;
        if (type == C.TRACK_TYPE_TEXT) {
            labels.add("Désactivés");
            groups.add(null);
            indexes.add(-1);
            if (player.getTrackSelectionParameters().disabledTrackTypes.contains(C.TRACK_TYPE_TEXT)) checked = 0;
        }
        for (Tracks.Group g : player.getCurrentTracks().getGroups()) {
            if (g.getType() != type) continue;
            for (int i = 0; i < g.length; i++) {
                if (!g.isTrackSupported(i)) continue;
                if (g.isTrackSelected(i) && checked < 0) checked = labels.size();
                groups.add(g);
                indexes.add(i);
                labels.add(trackLabel(g.getTrackFormat(i), labels.size() + (type == C.TRACK_TYPE_TEXT ? 0 : 1)));
            }
        }
        if (checked < 0 && type == C.TRACK_TYPE_TEXT) checked = 0;
        boolean none = type == C.TRACK_TYPE_AUDIO ? groups.isEmpty() : groups.size() <= 1;
        if (none) {
            Toast.makeText(this, type == C.TRACK_TYPE_AUDIO ? "Cette vidéo n'a qu'une seule langue."
                    : "Aucun sous-titre dans cette vidéo.", Toast.LENGTH_LONG).show();
            return;
        }
        new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                .setTitle(type == C.TRACK_TYPE_AUDIO ? "Langue audio" : "Sous-titres")
                .setSingleChoiceItems(labels.toArray(new String[0]), checked, (d, which) -> {
                    TrackSelectionParameters.Builder b = player.getTrackSelectionParameters().buildUpon();
                    Tracks.Group g = groups.get(which);
                    if (g == null) {
                        b.setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true);
                    } else {
                        b.setTrackTypeDisabled(type, false)
                                .setOverrideForType(new TrackSelectionOverride(g.getMediaTrackGroup(), indexes.get(which)));
                    }
                    player.setTrackSelectionParameters(b.build());
                    d.dismiss();
                })
                .show();
    }

    private String selectedLabel(int type, String fallback) {
        if (player == null) return fallback;
        if (type == C.TRACK_TYPE_TEXT && player.getTrackSelectionParameters().disabledTrackTypes.contains(C.TRACK_TYPE_TEXT)) {
            return fallback;
        }
        for (Tracks.Group g : player.getCurrentTracks().getGroups()) {
            if (g.getType() != type) continue;
            for (int i = 0; i < g.length; i++) {
                if (g.isTrackSelected(i)) return trackLabel(g.getTrackFormat(i), 0);
            }
        }
        return fallback;
    }

    /** « Français (5.1) », « Anglais », ou « Piste 2 » si le flux ne précise pas la langue. */
    private static String trackLabel(Format f, int number) {
        String name = null;
        if (f.language != null && !f.language.isEmpty() && !"und".equals(f.language)) {
            String display = new Locale(f.language).getDisplayLanguage(Locale.FRENCH);
            if (display != null && !display.isEmpty() && !display.equalsIgnoreCase(f.language)) {
                name = display.substring(0, 1).toUpperCase(Locale.FRENCH) + display.substring(1);
            } else {
                name = f.language.toUpperCase(Locale.ROOT);
            }
        }
        if (f.label != null && !f.label.isEmpty()) name = name == null ? f.label : name + " · " + f.label;
        if (name == null) name = number > 0 ? "Piste " + number : "Piste";
        if (f.channelCount >= 6) name += " (5.1)";
        return name;
    }

    // ---------------------------------------------------------------- Erreurs de lecture

    private View buildErrorPanel() {
        errorPanel = new LinearLayout(this);
        errorPanel.setOrientation(LinearLayout.VERTICAL);
        errorPanel.setGravity(Gravity.CENTER);
        errorPanel.setBackgroundColor(0xE609090B);
        errorPanel.setVisibility(View.GONE);

        TextView title = new TextView(this);
        title.setText("Ce flux ne peut pas être lu");
        title.setTextColor(Color.WHITE);
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 26);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setGravity(Gravity.CENTER);
        errorPanel.addView(title);

        errorText = new TextView(this);
        errorText.setTextColor(0xFFA1A1AA);
        errorText.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        errorText.setGravity(Gravity.CENTER);
        errorText.setPadding(dp(40), dp(10), dp(40), dp(24));
        errorPanel.addView(errorText);

        LinearLayout buttons = new LinearLayout(this);
        buttons.setOrientation(LinearLayout.HORIZONTAL);
        buttons.setGravity(Gravity.CENTER);
        Button retry = button("Réessayer", v -> {
            hideError();
            player.prepare();
            player.play();
        });
        Button external = button("Ouvrir avec un autre lecteur", v -> openExternal());
        Button close = button("Fermer", v -> finish());
        buttons.addView(retry);
        buttons.addView(external);
        if (!live) buttons.addView(button("Diagnostic", v -> runDiagnostic()));
        if (live && urls.length > 1) buttons.addView(button("Chaîne suivante", v -> { hideError(); zap(1); }));
        buttons.addView(close);
        errorPanel.addView(buttons);
        return errorPanel;
    }

    private Button button(String label, View.OnClickListener onClick) {
        Button b = new Button(this);
        b.setText(label);
        b.setAllCaps(false);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        b.setTextColor(Color.WHITE);
        b.setFocusable(true);
        b.setOnClickListener(onClick);
        b.setPadding(dp(22), dp(10), dp(22), dp(10));
        b.setBackground(rounded(0xFF262638, 10));
        b.setOnFocusChangeListener((v, hasFocus) -> {
            v.setBackground(rounded(hasFocus ? 0xFF3B82F6 : 0xFF262638, 10));
            v.animate().scaleX(hasFocus ? 1.06f : 1f).scaleY(hasFocus ? 1.06f : 1f).setDuration(120);
        });
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.setMargins(dp(8), 0, dp(8), 0);
        b.setLayoutParams(lp);
        return b;
    }

    /** Code HTTP renvoyé par le serveur, ou 0 si l'erreur ne vient pas d'une réponse HTTP. */
    private static int httpCode(PlaybackException error) {
        for (Throwable t = error.getCause(); t != null; t = t.getCause()) {
            if (t instanceof HttpDataSource.InvalidResponseCodeException) {
                return ((HttpDataSource.InvalidResponseCodeException) t).responseCode;
            }
        }
        return 0;
    }

    private void showError(PlaybackException error, int code) {
        String why;
        if (code == 401 || code == 403) {
            why = "Le serveur refuse l'accès (HTTP " + code + "). Le plus souvent, le nombre de connexions de l'abonnement "
                    + "est atteint : fermez l'appli sur vos autres appareils, attendez une minute, puis réessayez.";
        } else if (code == 404) {
            why = "Cette vidéo n'existe plus sur le serveur (HTTP 404).";
        } else if (code >= 500) {
            why = "Le serveur IPTV est en difficulté (HTTP " + code + "). Réessayez dans quelques minutes.";
        } else if (code > 0) {
            why = "Le serveur a répondu HTTP " + code + ".";
        } else {
            why = "Le lecteur a répondu : " + error.getErrorCodeName() + ".";
        }
        errorText.setText(why + "\nVous pouvez aussi essayer un autre lecteur (VLC, MX Player…)"
                + (live ? " ou l'autre format du flux dans Paramètres." : "."));
        errorPanel.setVisibility(View.VISIBLE);
        playerView.hideController();
        View first = ((ViewGroup) errorPanel.getChildAt(2)).getChildAt(0);
        first.requestFocus();
    }

    private void hideError() {
        if (errorPanel.getVisibility() == View.VISIBLE) {
            errorPanel.setVisibility(View.GONE);
            playerView.requestFocus();
        }
    }

    private void openExternal() {
        String url = urls[player.getCurrentMediaItemIndex()];
        Intent view = new Intent(Intent.ACTION_VIEW);
        view.setDataAndType(Uri.parse(url), "video/*");
        view.putExtra("title", titleAt(player.getCurrentMediaItemIndex()));
        try {
            startActivity(Intent.createChooser(view, "Ouvrir avec"));
            player.pause();
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, "Aucun autre lecteur installé. Installez VLC depuis le magasin d'applis.", Toast.LENGTH_LONG).show();
        }
    }

    // ---------------------------------------------------------------- Diagnostic

    /**
     * Interroge le serveur avec chaque adresse et plusieurs identifiants de lecteur, et affiche ses réponses
     * exactes (code HTTP, redirection, message) pour comprendre un refus. Identifiants masqués.
     */
    private void runDiagnostic() {
        int i = player.getCurrentMediaItemIndex();
        List<String> candidates = new ArrayList<>();
        candidates.add(primaryUrls[i]);
        if (i < alts.length) for (String a : alts[i]) if (!candidates.contains(a)) candidates.add(a);
        errorText.setText("Diagnostic en cours…");
        new Thread(() -> {
            StringBuilder out = new StringBuilder();
            for (int c = 0; c < candidates.size(); c++) {
                String url = candidates.get(c);
                String[] agents = c == 0 ? new String[]{UserAgents.ALL[0], UserAgents.ALL[1], null} : new String[]{UserAgents.ALL[0]};
                for (String ua : agents) {
                    out.append(shortUrl(url)).append("  [").append(ua == null ? "sans identifiant" : ua.split("[ /]")[0])
                            .append("] → ").append(probe(url, ua)).append('\n');
                }
            }
            runOnUiThread(() -> errorText.setText(out.toString().trim()));
        }).start();
    }

    private String probe(String address, String ua) {
        try {
            StringBuilder hops = new StringBuilder();
            for (int hop = 0; hop < 5; hop++) {
                java.net.HttpURLConnection c = (java.net.HttpURLConnection) new java.net.URL(address).openConnection();
                c.setConnectTimeout(8000);
                c.setReadTimeout(8000);
                c.setInstanceFollowRedirects(false);
                if (ua != null) c.setRequestProperty("User-Agent", ua);
                c.setRequestProperty("Range", "bytes=0-1");
                int code = c.getResponseCode();
                String location = c.getHeaderField("Location");
                if (code >= 300 && code < 400 && location != null) {
                    address = new java.net.URL(new java.net.URL(address), location).toString();
                    hops.append(code).append(" vers ").append(Uri.parse(address).getHost()).append(", ");
                    c.disconnect();
                    continue;
                }
                String body = "";
                if (code >= 400) {
                    java.io.InputStream in = c.getErrorStream();
                    if (in != null) {
                        byte[] buf = new byte[300];
                        int n = in.read(buf);
                        if (n > 0) body = new String(buf, 0, n, "UTF-8").replaceAll("<[^>]*>", " ").replaceAll("\\s+", " ").trim();
                        in.close();
                    }
                }
                c.disconnect();
                String result = hops + "HTTP " + code + (code == 200 || code == 206 ? " OK" : "");
                if (!body.isEmpty()) result += " « " + (body.length() > 90 ? body.substring(0, 90) + "…" : body) + " »";
                return result;
            }
            return hops + "trop de redirections";
        } catch (java.io.IOException e) {
            return "erreur réseau (" + e.getClass().getSimpleName() + ")";
        }
    }

    /** « /series/…/12345.mkv » sans l'hôte ni les identifiants. */
    private static String shortUrl(String url) {
        Uri u = Uri.parse(url);
        List<String> seg = u.getPathSegments();
        if (seg.size() >= 4) return "/" + seg.get(0) + "/…/" + seg.get(seg.size() - 1);
        return u.getHost() == null ? "?" : u.getHost();
    }

    // ---------------------------------------------------------------- Cycle de vie

    @Override
    protected void onStop() {
        super.onStop();
        if (player != null) player.pause();
    }

    @Override
    protected void onStart() {
        super.onStart();
        if (player != null && errorPanel.getVisibility() != View.VISIBLE) player.play();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (player != null) {
            player.release();
            player = null;
        }
        super.onDestroy();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private static GradientDrawable rounded(int color, int radiusDp) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(color);
        d.setCornerRadius(radiusDp * 3f);
        return d;
    }
}
