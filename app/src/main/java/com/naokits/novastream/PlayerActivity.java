package com.naokits.novastream;

import android.app.Activity;
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
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.ui.PlayerView;

import java.util.ArrayList;
import java.util.List;

/**
 * Lecteur plein écran (ExoPlayer) : lit HLS, MPEG-TS, MP4 et MKV.
 * Direct : haut/bas ou CH+/CH- changent de chaîne. Films et séries : l'épisode suivant s'enchaîne.
 */
@OptIn(markerClass = UnstableApi.class)
public class PlayerActivity extends Activity {

    static final String EXTRA_URLS = "urls";
    static final String EXTRA_TITLES = "titles";
    static final String EXTRA_INDEX = "index";
    static final String EXTRA_LIVE = "live";
    static final String EXTRA_SUBTITLE = "subtitle";

    private ExoPlayer player;
    private PlayerView playerView;
    private TextView banner;
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

        root.addView(buildErrorPanel(), new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);

        DefaultHttpDataSource.Factory http = new DefaultHttpDataSource.Factory()
                .setUserAgent(MainActivity.USER_AGENT)
                .setAllowCrossProtocolRedirects(true)
                .setConnectTimeoutMs(15000)
                .setReadTimeoutMs(30000);
        player = new ExoPlayer.Builder(this)
                .setMediaSourceFactory(new DefaultMediaSourceFactory(this).setDataSourceFactory(http))
                .setSeekBackIncrementMs(10000)
                .setSeekForwardIncrementMs(30000)
                .build();
        playerView.setPlayer(player);

        List<MediaItem> items = new ArrayList<>();
        for (int i = 0; i < urls.length; i++) {
            items.add(new MediaItem.Builder()
                    .setUri(urls[i])
                    .setMediaId(String.valueOf(i))
                    .setMediaMetadata(new MediaMetadata.Builder().setTitle(titleAt(i)).build())
                    .build());
        }
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
                showError(error);
            }
        });
        player.setMediaItems(items, index, 0);
        player.prepare();
        player.play();
        showBanner();
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
            if (code == KeyEvent.KEYCODE_INFO || code == KeyEvent.KEYCODE_MENU) {
                showBanner();
                return true;
            }
        }
        return super.dispatchKeyEvent(event);
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

    private void showError(PlaybackException error) {
        errorText.setText("Le lecteur a répondu : " + error.getErrorCodeName()
                + "\nEssayez un autre lecteur (VLC, MX Player…) ou, pour le direct, l'autre format dans Paramètres.");
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
