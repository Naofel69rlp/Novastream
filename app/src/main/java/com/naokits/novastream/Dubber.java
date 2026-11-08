package com.naokits.novastream;

import android.content.Context;
import android.content.SharedPreferences;
import android.media.AudioFormat;
import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
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
 * Sous-titres français générés par IA pour les films et séries sans VF. Tout le film est préparé en continu,
 * morceau de 3 minutes par morceau de 3 minutes, à partir de l'endroit regardé jusqu'à la fin puis le début :
 * le son est extrait, transcrit par Whisper et traduit en français. Chaque réplique s'affiche pendant qu'elle est
 * dite. Les traductions sont gardées en cache : revoir un film ne coûte rien.
 */
final class Dubber {

    interface Listener {
        /**
         * Avancement de la préparation. film = pourcentage du film prêt (-1 : rien à afficher).
         * passage = pourcentage du passage en cours quand la lecture attend (-1 : la lecture n'attend pas).
         */
        void onProgress(int film, int passage);
        /** Erreur définitive : les sous-titres s'arrêtent. */
        void onFatal(String message);
        /** Information à afficher quelques secondes. */
        void onInfo(String message);
    }

    static final String PREFS = "novastream";
    static final String KEY_OPENAI = "openai";

    private static final long CHUNK_MS = 180_000;
    private static final int RATE = 16_000;

    private final Context ctx;
    private final ExoPlayer player;
    private final TextView subtitleView;
    private final Listener listener;
    private final Handler main = new Handler(Looper.getMainLooper());

    private final TreeMap<Long, String[]> lines = new TreeMap<>();  // début (ms) → {fin (ms), texte}
    private final Set<Long> ready = new HashSet<>();
    private volatile boolean active;
    private volatile long position;
    private volatile long duration;
    private String url;
    private String audioLang;
    private boolean waiting;
    private boolean announcedAll;
    private Thread worker;
    /** Morceau en préparation et son avancement (0 à 1). */
    private volatile long working = -1;
    private volatile double workProgress;

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

    /** Démarre les sous-titres français pour l'adresse en cours de lecture. */
    void start(String url, String audioLang) {
        stop();
        if (key(ctx).isEmpty()) {
            listener.onFatal("Ajoutez d'abord votre clé OpenAI dans Paramètres › Sous-titres français (IA).");
            return;
        }
        this.url = url;
        this.audioLang = audioLang;
        synchronized (lines) {
            lines.clear();
            ready.clear();
        }
        active = true;
        announcedAll = false;
        working = -1;
        workProgress = 0;
        position = player.getCurrentPosition();
        duration = player.getDuration();
        worker = new Thread(this::work, "sous-titres-fr");
        worker.start();
        main.post(tick);
    }

    void stop() {
        active = false;
        main.removeCallbacks(tick);
        if (worker != null) worker.interrupt();
        worker = null;
        subtitleView.setVisibility(View.GONE);
        if (waiting && player != null) player.play();
        waiting = false;
        listener.onProgress(-1, -1);
    }

    void release() {
        stop();
    }

    // ---------------------------------------------------------------- Affichage

    private long chunkCount() {
        return duration > 0 ? (duration + CHUNK_MS - 1) / CHUNK_MS : 0;
    }

    private void tick() {
        if (!active) return;
        long pos = player.getCurrentPosition();
        position = pos;
        if (duration <= 0) duration = player.getDuration();

        long chunk = pos / CHUNK_MS;
        boolean chunkReady;
        int readyCount;
        synchronized (lines) {
            chunkReady = ready.contains(chunk);
            readyCount = ready.size();
        }
        long total = chunkCount();
        double done = readyCount + (working >= 0 ? workProgress : 0);
        int film = total > 0 ? (int) Math.min(100, Math.floor(done * 100 / total)) : -1;
        if (total > 0 && readyCount >= total) {
            film = -1;
            if (!announcedAll) {
                announcedAll = true;
                listener.onInfo("Sous-titres français prêts pour tout le film.");
            }
        }

        if (!chunkReady) {
            if (player.isPlaying()) {
                player.pause();
                waiting = true;
            }
            int passage = working == chunk ? (int) Math.floor(workProgress * 100) : 0;
            listener.onProgress(Math.max(film, 0), passage);
        } else {
            if (waiting) {
                waiting = false;
                player.play();
            }
            listener.onProgress(film, -1);
        }
        showLine(pos);
        main.postDelayed(tick, 200);
    }

    /** Affiche la réplique traduite exactement pendant qu'elle est prononcée dans le film. */
    private void showLine(long pos) {
        String text = null;
        synchronized (lines) {
            Map.Entry<Long, String[]> cur = lines.floorEntry(pos);
            if (cur != null && pos <= Long.parseLong(cur.getValue()[0]) + 400) text = cur.getValue()[1];
        }
        if (text == null) {
            if (subtitleView.getVisibility() != View.GONE) subtitleView.setVisibility(View.GONE);
            return;
        }
        if (!text.contentEquals(subtitleView.getText())) subtitleView.setText(text);
        if (subtitleView.getVisibility() != View.VISIBLE) subtitleView.setVisibility(View.VISIBLE);
    }

    // ---------------------------------------------------------------- Préparation de tout le film

    /** Prochain morceau à préparer : celui regardé, puis les suivants jusqu'à la fin, puis ceux d'avant. */
    private long nextChunk() {
        long total = chunkCount();
        long current = position / CHUNK_MS;
        synchronized (lines) {
            if (total <= 0) return ready.contains(current) ? -1 : current;
            for (long i = 0; i < total; i++) {
                long c = (current + i) % total;
                if (!ready.contains(c)) return c;
            }
        }
        return -1;
    }

    private void work() {
        // Morceaux déjà traduits lors d'une séance précédente.
        long known = 0;
        while (active && duration <= 0 && known++ < 50) sleep(200);
        for (long c = 0; active && c < Math.max(chunkCount(), 1); c++) {
            try {
                File cache = cacheFile(c);
                if (cache.exists()) load(c, new JSONArray(readText(cache)));
            } catch (Exception ignored) {
                // Cache illisible : le morceau sera refait.
            }
        }
        int failures = 0;
        while (active) {
            long todo = nextChunk();
            if (todo < 0) {
                sleep(1000);
                continue;
            }
            try {
                working = todo;
                workProgress = 0;
                prepare(todo);
                failures = 0;
            } catch (FatalException e) {
                fail(e.getMessage());
                return;
            } catch (SwitchException e) {
                // L'utilisateur a sauté ailleurs dans le film : on prépare d'abord ce passage-là.
            } catch (Exception e) {
                if (!active) return;
                if (++failures >= 4) {
                    fail("La préparation a échoué : " + e.getMessage());
                    return;
                }
                sleep(3000);
            } finally {
                working = -1;
            }
        }
    }

    private void prepare(long chunk) throws Exception {
        File cache = cacheFile(chunk);
        JSONArray result;
        if (cache.exists()) {
            result = new JSONArray(readText(cache));
        } else {
            byte[] wav = extractWav(chunk * CHUNK_MS * 1000, (chunk + 1) * CHUNK_MS * 1000);
            workProgress = 0.6;
            JSONObject transcript = wav == null ? null : transcribe(wav);
            workProgress = 0.85;
            result = transcript == null ? new JSONArray() : translate(transcript, chunk * CHUNK_MS);
            workProgress = 1;
            writeText(cache, result.toString());
        }
        load(chunk, result);
    }

    private void load(long chunk, JSONArray result) throws JSONException {
        synchronized (lines) {
            for (int i = 0; i < result.length(); i++) {
                JSONObject o = result.getJSONObject(i);
                lines.put(o.getLong("s"), new String[]{String.valueOf(o.getLong("e")), o.getString("t")});
            }
            ready.add(chunk);
        }
    }

    /** Vrai quand la lecture attend un autre passage que celui en préparation. */
    private boolean needsOtherChunk() {
        long wanted = position / CHUNK_MS;
        if (wanted == working) return false;
        synchronized (lines) {
            return !ready.contains(wanted);
        }
    }

    private static final class SwitchException extends Exception {
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
                        + "n'autorise peut-être qu'une connexion). Téléchargez le film, puis activez les sous-titres français.");
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
                    if (needsOtherChunk()) {
                        dec.releaseOutputBuffer(out, false);
                        throw new SwitchException();
                    }
                    if (info.presentationTimeUs > startUs) {
                        workProgress = Math.min(0.6, 0.6 * (info.presentationTimeUs - startUs) / (double) (endUs - startUs));
                    }
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

    /** Traduit les phrases en sous-titres français. Renvoie [{s, e, t}] en ms absolues. */
    private JSONArray translate(JSONObject transcript, long offsetMs) throws Exception {
        JSONArray segments = transcript.optJSONArray("segments");
        JSONArray out = new JSONArray();
        if (segments == null || segments.length() == 0) return out;
        java.util.List<JSONObject> kept = new java.util.ArrayList<>();
        for (int i = 0; i < segments.length(); i++) {
            JSONObject s = segments.getJSONObject(i);
            String text = s.optString("text", "").trim();
            // Même règle que Whisper : on n'écarte que le silence certain, pas les répliques peu audibles.
            boolean silence = s.optDouble("no_speech_prob", 0) > 0.6 && s.optDouble("avg_logprob", 0) < -1;
            if (text.isEmpty() || silence) continue;
            kept.add(s);
        }
        if (kept.isEmpty()) return out;
        boolean french = "french".equalsIgnoreCase(transcript.optString("language"));
        String[] fr = new String[kept.size()];
        if (!french) {
            for (int from = 0; from < kept.size(); from += 40) {
                int to = Math.min(kept.size(), from + 40);
                translateBatch(kept, fr, from, to);
                // Deuxième essai pour les répliques oubliées par la traduction.
                for (int i = from; i < to; i++) {
                    if (fr[i] == null) {
                        translateBatch(kept, fr, from, to);
                        break;
                    }
                }
            }
        }
        for (int i = 0; i < kept.size(); i++) {
            JSONObject s = kept.get(i);
            out.put(new JSONObject()
                    .put("s", offsetMs + Math.round(s.getDouble("start") * 1000))
                    .put("e", offsetMs + Math.round(s.getDouble("end") * 1000))
                    .put("t", fr[i] != null ? fr[i] : s.optString("text", "").trim()));
        }
        return out;
    }

    private void translateBatch(java.util.List<JSONObject> kept, String[] fr, int from, int to) throws Exception {
        JSONArray input = new JSONArray();
        for (int i = from; i < to; i++) {
            if (fr[i] == null) input.put(new JSONObject().put("i", i).put("t", kept.get(i).optString("text", "").trim()));
        }
        if (input.length() == 0) return;
        JSONObject request = new JSONObject()
                .put("model", "gpt-4o-mini")
                .put("temperature", 0.2)
                .put("response_format", new JSONObject().put("type", "json_object"))
                .put("messages", new JSONArray()
                        .put(new JSONObject().put("role", "system").put("content",
                                "Tu es sous-titreur professionnel. Traduis chaque réplique de film en français naturel et concis, "
                                        + "en gardant le sens et le ton, tutoiement/vouvoiement cohérents. Les répliques se suivent : "
                                        + "sers-toi du contexte. Réponds uniquement en JSON : {\"lines\": [{\"i\": numéro, \"t\": \"traduction\"}]} "
                                        + "avec une entrée pour chaque numéro reçu."))
                        .put(new JSONObject().put("role", "user").put("content", input.toString())));
        JSONObject res = new JSONObject(post("https://api.openai.com/v1/chat/completions", "application/json",
                request.toString().getBytes(StandardCharsets.UTF_8)));
        String content = res.getJSONArray("choices").getJSONObject(0).getJSONObject("message").getString("content");
        JSONArray lines = new JSONObject(content).optJSONArray("lines");
        if (lines == null) return;
        for (int k = 0; k < lines.length(); k++) {
            JSONObject o = lines.optJSONObject(k);
            if (o == null) continue;
            int i = o.optInt("i", -1);
            String t = o.optString("t", "").trim();
            if (i >= from && i < to && !t.isEmpty()) fr[i] = t;
        }
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
        if (code == 401) throw new FatalException("Clé OpenAI refusée : vérifiez-la dans Paramètres › Sous-titres français (IA).");
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
        byte[] d = md.digest(("v3|" + url + "|" + audioLang).getBytes(StandardCharsets.UTF_8));
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
