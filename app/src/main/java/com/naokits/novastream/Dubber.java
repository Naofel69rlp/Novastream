package com.naokits.novastream;

import android.content.Context;
import android.content.SharedPreferences;
import android.media.AudioFormat;
import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.view.View;
import android.widget.TextView;

import androidx.media3.exoplayer.ExoPlayer;

import org.json.JSONArray;
import org.json.JSONException;
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
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

/**
 * Voix off française générée par IA, préparée par morceaux de 3 minutes en avance sur la lecture :
 * le son du morceau est extrait du film, transcrit par Whisper, traduit en français, puis lu par la
 * synthèse vocale de l'appareil au bon moment, le son original baissé. Les traductions sont gardées
 * en cache : revoir un film ne coûte rien.
 */
final class Dubber {

    interface Listener {
        /** Message d'état à afficher (null pour l'effacer). */
        void onStatus(String text);
        /** Erreur définitive : la voix française s'arrête. */
        void onFatal(String message);
        /** Information à afficher quelques secondes. */
        void onInfo(String message);
    }

    static final String PREFS = "novastream";
    static final String KEY_OPENAI = "openai";

    private static final long CHUNK_MS = 180_000;
    private static final int RATE = 16_000;
    private static final float DUCKED = 0.03f;
    /** La voix de synthèse met un peu de temps à démarrer : on lance chaque réplique un peu en avance. */
    private static final long LEAD_MS = 400;

    private final Context ctx;
    private final ExoPlayer player;
    private final TextView subtitleView;
    private final Listener listener;
    private final Handler main = new Handler(Looper.getMainLooper());

    private final TreeMap<Long, String[]> lines = new TreeMap<>();  // début (ms) → {fin (ms), texte}
    private final Set<Long> ready = new HashSet<>();
    private TextToSpeech tts;
    private boolean ttsOk;
    private volatile boolean active;
    private volatile long position;
    private volatile long duration;
    private String url;
    private String audioLang;
    private float currentVolume = 1f;
    private long spokenUpTo;
    private long lastTick;
    private boolean waiting;
    private int utterance;
    private Thread worker;
    private volatile String stage = "";

    private final Runnable tick = this::tick;

    Dubber(Context ctx, ExoPlayer player, TextView subtitleView, Listener listener) {
        this.ctx = ctx;
        this.player = player;
        this.subtitleView = subtitleView;
        this.listener = listener;
    }

    static String key(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_OPENAI, "");
    }

    static void saveKey(Context ctx, String key) {
        SharedPreferences.Editor e = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
        if (key == null || key.trim().isEmpty()) e.remove(KEY_OPENAI);
        else e.putString(KEY_OPENAI, key.trim());
        e.apply();
    }

    boolean isActive() {
        return active;
    }

    /** Démarre la voix française pour l'adresse en cours de lecture. */
    void start(String url, String audioLang) {
        stop();
        if (key(ctx).isEmpty()) {
            listener.onFatal("Ajoutez d'abord votre clé OpenAI dans Paramètres › Voix française.");
            return;
        }
        this.url = url;
        this.audioLang = audioLang;
        synchronized (lines) {
            lines.clear();
            ready.clear();
        }
        active = true;
        position = player.getCurrentPosition();
        duration = player.getDuration();
        spokenUpTo = position - 1;
        lastTick = position;
        if (tts == null) {
            tts = new TextToSpeech(ctx, status -> {
                int lang = status == TextToSpeech.SUCCESS ? tts.setLanguage(Locale.FRANCE) : TextToSpeech.ERROR;
                if (lang < TextToSpeech.LANG_AVAILABLE && status == TextToSpeech.SUCCESS) lang = tts.setLanguage(Locale.FRENCH);
                ttsOk = lang >= TextToSpeech.LANG_AVAILABLE;
                if (!ttsOk) {
                    listener.onInfo("Pas de voix française installée sur cet appareil : les répliques s'affichent en sous-titres. "
                            + "Pour la voix : Paramètres Android › Accessibilité › Synthèse vocale › installez le français.");
                }
            });
            tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override public void onStart(String id) {}
                @Override public void onDone(String id) {}
                @Override public void onError(String id) {}
            });
        }
        worker = new Thread(this::work, "voix-francaise");
        worker.start();
        main.post(tick);
    }

    void stop() {
        active = false;
        main.removeCallbacks(tick);
        if (worker != null) worker.interrupt();
        worker = null;
        if (tts != null) tts.stop();
        if (player != null) { player.setVolume(1f); currentVolume = 1f; }
        subtitleView.setVisibility(View.GONE);
        if (waiting && player != null) player.play();
        waiting = false;
        listener.onStatus(null);
    }

    void release() {
        stop();
        if (tts != null) tts.shutdown();
        tts = null;
    }

    // ---------------------------------------------------------------- Lecture des répliques

    private void tick() {
        if (!active) return;
        long pos = player.getCurrentPosition();
        position = pos;
        if (duration <= 0) duration = player.getDuration();
        if (Math.abs(pos - lastTick) > 2500) {  // l'utilisateur a avancé ou reculé
            spokenUpTo = pos - 1;
            if (tts != null) tts.stop();
            { player.setVolume(1f); currentVolume = 1f; }
        }
        lastTick = pos;

        boolean chunkReady;
        synchronized (lines) {
            chunkReady = ready.contains(pos / CHUNK_MS);
        }
        if (!chunkReady) {
            if (player.isPlaying()) {
                player.pause();
                waiting = true;
            }
            listener.onStatus("Préparation de la voix française…" + (stage.isEmpty() ? "" : "\n" + stage));
        } else if (waiting) {
            waiting = false;
            listener.onStatus(null);
            player.play();
        }

        if (player.isPlaying()) {
            Map.Entry<Long, String[]> next;
            synchronized (lines) {
                next = lines.higherEntry(spokenUpTo);
            }
            if (next != null && next.getKey() <= pos + LEAD_MS) {
                spokenUpTo = next.getKey();
                if (pos - next.getKey() < 1500) say(next.getKey(), next.getValue());
            }
        } else if (tts != null && tts.isSpeaking()) {
            tts.stop();
        }
        duck(pos);
        main.postDelayed(tick, 100);
    }

    private void say(long start, String[] line) {
        long end = Long.parseLong(line[0]);
        String text = line[1];
        subtitleView.setText(text);
        subtitleView.setVisibility(View.VISIBLE);
        final int id = ++utterance;
        main.postDelayed(() -> { if (utterance == id) subtitleView.setVisibility(View.GONE); },
                Math.max(1500, end - start + 600));
        if (!ttsOk || tts == null) return;
        double seconds = Math.max(0.8, (end - start) / 1000.0);
        float rate = (float) Math.max(1.0, Math.min(2.0, text.length() / (seconds * 13.0)));
        tts.setSpeechRate(rate);
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, new Bundle(), String.valueOf(id));
    }

    /**
     * Baisse la voix d'origine pendant toute la durée de chaque réplique (et tant que la voix française parle),
     * pas seulement pendant la synthèse : sinon la voix italienne reste audible derrière.
     */
    private void duck(long pos) {
        boolean inLine = false;
        if (player.isPlaying()) {
            synchronized (lines) {
                Map.Entry<Long, String[]> cur = lines.floorEntry(pos + LEAD_MS);
                inLine = cur != null && pos <= Long.parseLong(cur.getValue()[0]) + 300;
            }
            if (!inLine && ttsOk && tts != null && tts.isSpeaking()) inLine = true;
        }
        float volume = inLine ? DUCKED : 1f;
        if (volume != currentVolume) {
            currentVolume = volume;
            player.setVolume(volume);
        }
    }

    // ---------------------------------------------------------------- Préparation des morceaux

    private void work() {
        int failures = 0;
        while (active) {
            long current = position / CHUNK_MS;
            long todo = -1;
            synchronized (lines) {
                for (long c = current; c <= current + 1; c++) {
                    if (!ready.contains(c) && (duration <= 0 || c * CHUNK_MS < duration)) {
                        todo = c;
                        break;
                    }
                }
            }
            if (todo < 0) {
                sleep(1000);
                continue;
            }
            try {
                prepare(todo);
                failures = 0;
            } catch (FatalException e) {
                fail(e.getMessage());
                return;
            } catch (Exception e) {
                if (!active) return;
                stage = "nouvel essai après une erreur : " + e.getMessage();
                if (++failures >= 3) {
                    fail("La voix française a échoué : " + e.getMessage());
                    return;
                }
                sleep(2000);
            }
        }
    }

    private void prepare(long chunk) throws Exception {
        File cache = cacheFile(chunk);
        JSONArray result;
        if (cache.exists()) {
            result = new JSONArray(readText(cache));
        } else {
            stage = "1/3 · lecture du son du film";
            byte[] wav = extractWav(chunk * CHUNK_MS * 1000, (chunk + 1) * CHUNK_MS * 1000);
            stage = "2/3 · transcription";
            JSONObject transcript = wav == null ? null : transcribe(wav);
            stage = "3/3 · traduction";
            result = transcript == null ? new JSONArray() : translate(transcript, chunk * CHUNK_MS);
            stage = "";
            if (result.length() == 0 && transcript != null && "french".equalsIgnoreCase(transcript.optString("language"))) {
                main.post(() -> listener.onInfo("Ce passage est déjà en français."));
            } else if (chunk == position / CHUNK_MS) {
                final int n = result.length();
                main.post(() -> listener.onInfo("Voix française prête (" + n + " répliques pour ces 3 minutes)."));
            }
            writeText(cache, result.toString());
        }
        synchronized (lines) {
            for (int i = 0; i < result.length(); i++) {
                JSONObject o = result.getJSONObject(i);
                lines.put(o.getLong("s"), new String[]{String.valueOf(o.getLong("e")), o.getString("t")});
            }
            ready.add(chunk);
        }
    }

    private void fail(String message) {
        main.post(() -> {
            stop();
            listener.onFatal(message);
        });
    }

    /** Son du morceau [début, fin[ en WAV mono 16 kHz (null après la fin du film). */
    private byte[] extractWav(long startUs, long endUs) throws Exception {
        MediaExtractor ex = new MediaExtractor();
        MediaCodec dec = null;
        try {
            try {
                if (url.startsWith("file:")) {
                    ex.setDataSource(Uri.parse(url).getPath());
                } else {
                    Map<String, String> headers = new HashMap<>();
                    headers.put("User-Agent", UserAgents.current(ctx));
                    ex.setDataSource(url, headers);
                }
            } catch (IOException e) {
                throw new FatalException("Le son du film ne peut pas être lu en parallèle de la vidéo (votre abonnement "
                        + "n'autorise peut-être qu'une connexion). Téléchargez le film, puis activez la voix française.");
            }
            int track = -1;
            for (int i = 0; i < ex.getTrackCount(); i++) {
                MediaFormat f = ex.getTrackFormat(i);
                String mime = f.getString(MediaFormat.KEY_MIME);
                if (mime == null || !mime.startsWith("audio/")) continue;
                if (track < 0) track = i;
                String lang = f.containsKey(MediaFormat.KEY_LANGUAGE) ? f.getString(MediaFormat.KEY_LANGUAGE) : null;
                if (audioLang != null && lang != null && lang.toLowerCase(Locale.ROOT).startsWith(audioLang)) {
                    track = i;
                    break;
                }
            }
            if (track < 0) throw new FatalException("Ce film n'a pas de piste son lisible.");
            ex.selectTrack(track);
            MediaFormat format = ex.getTrackFormat(track);
            // Certains fichiers (MPEG-TS, MP4 avec décalage) ne commencent pas à 0 : le lecteur, lui, part de 0.
            // Sans cette correction toutes les répliques arrivent en retard (ou en avance) du même écart.
            ex.seekTo(0, MediaExtractor.SEEK_TO_PREVIOUS_SYNC);
            long base = Math.max(0, ex.getSampleTime());
            startUs += base;
            endUs += base;
            ex.seekTo(startUs, MediaExtractor.SEEK_TO_PREVIOUS_SYNC);
            try {
                dec = MediaCodec.createDecoderByType(format.getString(MediaFormat.KEY_MIME));
                dec.configure(format, null, null, 0);
            } catch (IOException | RuntimeException e) {
                throw new FatalException("Le format du son de ce film (" + format.getString(MediaFormat.KEY_MIME)
                        + ") n'est pas décodable sur cet appareil.");
            }
            dec.start();

            Downmixer mix = new Downmixer(format.getInteger(MediaFormat.KEY_SAMPLE_RATE),
                    format.getInteger(MediaFormat.KEY_CHANNEL_COUNT));
            MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
            boolean inputDone = false;
            while (active) {
                if (!inputDone) {
                    int in = dec.dequeueInputBuffer(10_000);
                    if (in >= 0) {
                        ByteBuffer buf = dec.getInputBuffer(in);
                        int size = buf == null ? -1 : ex.readSampleData(buf, 0);
                        long t = ex.getSampleTime();
                        if (size < 0 || t > endUs) {
                            dec.queueInputBuffer(in, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM);
                            inputDone = true;
                        } else {
                            dec.queueInputBuffer(in, 0, size, t, 0);
                            ex.advance();
                        }
                    }
                }
                int out = dec.dequeueOutputBuffer(info, 10_000);
                if (out == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                    MediaFormat f = dec.getOutputFormat();
                    boolean isFloat = Build.VERSION.SDK_INT >= 24 && f.containsKey(MediaFormat.KEY_PCM_ENCODING)
                            && f.getInteger(MediaFormat.KEY_PCM_ENCODING) == AudioFormat.ENCODING_PCM_FLOAT;
                    mix.reset(f.getInteger(MediaFormat.KEY_SAMPLE_RATE), f.getInteger(MediaFormat.KEY_CHANNEL_COUNT), isFloat);
                } else if (out >= 0) {
                    ByteBuffer buf = dec.getOutputBuffer(out);
                    if (buf != null && info.size > 0 && info.presentationTimeUs >= startUs && info.presentationTimeUs < endUs) {
                        buf.position(info.offset);
                        buf.limit(info.offset + info.size);
                        mix.add(buf.slice().order(ByteOrder.LITTLE_ENDIAN));
                    }
                    dec.releaseOutputBuffer(out, false);
                    if ((info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) break;
                }
            }
            byte[] pcm = mix.bytes();
            return pcm.length < RATE * 2 ? null : wav(pcm);
        } finally {
            if (dec != null) {
                try {
                    dec.stop();
                } catch (RuntimeException ignored) {
                    // Décodeur jamais démarré.
                }
                dec.release();
            }
            ex.release();
        }
    }

    /** Mélange en mono et ramène à 16 kHz (moyenne des échantillons de chaque intervalle). */
    private static final class Downmixer {
        private final ByteArrayOutputStream out = new ByteArrayOutputStream();
        private int channels;
        private boolean isFloat;
        private double step;
        private double next;
        private double count;
        private double acc;
        private int accN;

        Downmixer(int rate, int channels) {
            reset(rate, channels, false);
        }

        void reset(int rate, int channels, boolean isFloat) {
            this.channels = Math.max(1, channels);
            this.isFloat = isFloat;
            step = rate / (double) RATE;
            next = step;
            count = 0;
        }

        void add(ByteBuffer b) {
            int frameBytes = channels * (isFloat ? 4 : 2);
            while (b.remaining() >= frameBytes) {
                double sum = 0;
                for (int c = 0; c < channels; c++) sum += isFloat ? b.getFloat() * 32767.0 : b.getShort();
                acc += sum / channels;
                accN++;
                count += 1;
                if (count >= next) {
                    int v = (int) Math.max(-32768, Math.min(32767, acc / accN));
                    out.write(v & 0xff);
                    out.write((v >> 8) & 0xff);
                    acc = 0;
                    accN = 0;
                    next += step;
                }
            }
        }

        byte[] bytes() {
            return out.toByteArray();
        }
    }

    private static byte[] wav(byte[] pcm) {
        ByteBuffer h = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN);
        h.put("RIFF".getBytes(StandardCharsets.US_ASCII)).putInt(36 + pcm.length)
                .put("WAVE".getBytes(StandardCharsets.US_ASCII)).put("fmt ".getBytes(StandardCharsets.US_ASCII))
                .putInt(16).putShort((short) 1).putShort((short) 1).putInt(RATE).putInt(RATE * 2)
                .putShort((short) 2).putShort((short) 16)
                .put("data".getBytes(StandardCharsets.US_ASCII)).putInt(pcm.length);
        byte[] out = new byte[44 + pcm.length];
        System.arraycopy(h.array(), 0, out, 0, 44);
        System.arraycopy(pcm, 0, out, 44, pcm.length);
        return out;
    }

    // ---------------------------------------------------------------- OpenAI

    /** Transcription Whisper avec les horaires de chaque phrase. */
    private JSONObject transcribe(byte[] wav) throws Exception {
        String boundary = "----NovaStream" + System.nanoTime();
        ByteArrayOutputStream body = new ByteArrayOutputStream();
        field(body, boundary, "model", "whisper-1");
        field(body, boundary, "response_format", "verbose_json");
        body.write(("--" + boundary + "\r\nContent-Disposition: form-data; name=\"file\"; filename=\"son.wav\"\r\n"
                + "Content-Type: audio/wav\r\n\r\n").getBytes(StandardCharsets.UTF_8));
        body.write(wav);
        body.write(("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));
        return new JSONObject(post("https://api.openai.com/v1/audio/transcriptions",
                "multipart/form-data; boundary=" + boundary, body.toByteArray()));
    }

    private static void field(ByteArrayOutputStream body, String boundary, String name, String value) throws IOException {
        body.write(("--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + name + "\"\r\n\r\n" + value + "\r\n")
                .getBytes(StandardCharsets.UTF_8));
    }

    /** Traduit les phrases en français court, adapté au doublage. Renvoie [{s, e, t}] en ms absolues. */
    private JSONArray translate(JSONObject transcript, long offsetMs) throws Exception {
        JSONArray segments = transcript.optJSONArray("segments");
        JSONArray out = new JSONArray();
        if (segments == null || segments.length() == 0) return out;
        JSONArray kept = new JSONArray();
        JSONArray texts = new JSONArray();
        for (int i = 0; i < segments.length(); i++) {
            JSONObject s = segments.getJSONObject(i);
            String text = s.optString("text", "").trim();
            if (text.isEmpty() || s.optDouble("no_speech_prob", 0) > 0.6) continue;
            kept.put(s);
            texts.put(text);
        }
        // Passage déjà en français : rien à doubler.
        if (kept.length() == 0 || "french".equalsIgnoreCase(transcript.optString("language"))) return out;

        JSONArray french = texts;
        {
            JSONObject request = new JSONObject()
                    .put("model", "gpt-4o-mini")
                    .put("temperature", 0.3)
                    .put("response_format", new JSONObject().put("type", "json_object"))
                    .put("messages", new JSONArray()
                            .put(new JSONObject().put("role", "system").put("content",
                                    "Tu traduis les répliques d'un film en français naturel pour un doublage. "
                                            + "Garde le sens, reste aussi court que l'original, tutoiement/vouvoiement cohérents. "
                                            + "Réponds uniquement en JSON : {\"lines\": [...]} avec exactement autant d'éléments, dans le même ordre."))
                            .put(new JSONObject().put("role", "user").put("content", texts.toString())));
            JSONObject res = new JSONObject(post("https://api.openai.com/v1/chat/completions", "application/json",
                    request.toString().getBytes(StandardCharsets.UTF_8)));
            String content = res.getJSONArray("choices").getJSONObject(0).getJSONObject("message").getString("content");
            JSONArray translated = new JSONObject(content).optJSONArray("lines");
            if (translated != null && translated.length() == texts.length()) french = translated;
        }
        for (int i = 0; i < kept.length(); i++) {
            JSONObject s = kept.getJSONObject(i);
            out.put(new JSONObject()
                    .put("s", offsetMs + Math.round(s.getDouble("start") * 1000))
                    .put("e", offsetMs + Math.round(s.getDouble("end") * 1000))
                    .put("t", french.optString(i, texts.getString(i))));
        }
        return out;
    }

    private String post(String address, String contentType, byte[] body) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(address).openConnection();
        c.setConnectTimeout(20_000);
        c.setReadTimeout(180_000);
        c.setDoOutput(true);
        c.setRequestMethod("POST");
        c.setRequestProperty("Authorization", "Bearer " + key(ctx));
        c.setRequestProperty("Content-Type", contentType);
        c.setFixedLengthStreamingMode(body.length);
        try (OutputStream os = c.getOutputStream()) {
            os.write(body);
        }
        int code = c.getResponseCode();
        InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
        String text = in == null ? "" : readAll(in);
        c.disconnect();
        if (code == 401) throw new FatalException("Clé OpenAI refusée : vérifiez-la dans Paramètres › Voix française.");
        if (code == 429) throw new FatalException("Crédit OpenAI épuisé ou limite atteinte (platform.openai.com › Billing).");
        if (code >= 400) {
            String message = "erreur " + code;
            try {
                message = new JSONObject(text).getJSONObject("error").getString("message");
            } catch (JSONException ignored) {
                // Réponse sans détail.
            }
            throw new IOException(message);
        }
        return text;
    }

    // ---------------------------------------------------------------- Cache

    private File cacheFile(long chunk) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-1");
        byte[] d = md.digest(("v2|" + url + "|" + audioLang).getBytes(StandardCharsets.UTF_8));
        StringBuilder hex = new StringBuilder();
        for (int i = 0; i < 8; i++) hex.append(String.format(Locale.ROOT, "%02x", d[i]));
        File dir = new File(ctx.getCacheDir(), "voix-fr");
        if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("cache");
        return new File(dir, hex + "-" + chunk + ".json");
    }

    private static String readText(File f) throws IOException {
        try (InputStream in = new FileInputStream(f)) {
            return readAll(in);
        }
    }

    private static void writeText(File f, String text) throws IOException {
        try (OutputStream os = new FileOutputStream(f)) {
            os.write(text.getBytes(StandardCharsets.UTF_8));
        }
    }

    private static String readAll(InputStream in) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        in.close();
        return out.toString("UTF-8");
    }

    private static void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException ignored) {
            Thread.currentThread().interrupt();
        }
    }

    /** Erreur qu'un nouvel essai ne corrigera pas (clé, crédit, format…). */
    private static final class FatalException extends Exception {
        FatalException(String message) {
            super(message);
        }
    }
}
