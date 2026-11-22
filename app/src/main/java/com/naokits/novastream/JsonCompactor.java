package com.naokits.novastream;

import android.util.JsonReader;
import android.util.JsonToken;
import android.util.JsonWriter;

import java.io.BufferedInputStream;
import java.io.BufferedWriter;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.io.PipedInputStream;
import java.io.PipedOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/**
 * Allège les listes Xtream (souvent des dizaines de Mo) au fil de la lecture : chaque élément ne garde
 * que les champs affichés par l'interface. Rien n'est stocké en entier en mémoire.
 */
final class JsonCompactor {

    private static final Set<String> KEEP = new HashSet<>(Arrays.asList(
            "stream_id", "series_id", "name", "stream_icon", "cover", "category_id", "category_name",
            "rating", "rating_5based", "year", "container_extension", "added", "releaseDate", "release_date",
            "last_modified", "genre"));

    private JsonCompactor() {
    }

    static InputStream compact(final InputStream raw) throws IOException {
        return compact(raw, null);
    }

    /**
     * Comme {@link #compact(InputStream)}, et garde en plus une copie de la liste allégée dans {@code saveTo}
     * (catalogue affiché tout de suite au prochain lancement). La copie n'est gardée que si la liste est complète.
     */
    static InputStream compact(final InputStream raw, final File saveTo) throws IOException {
        final PipedInputStream result = new PipedInputStream(256 * 1024);
        final PipedOutputStream sink = new PipedOutputStream(result);
        Thread worker = new Thread(() -> {
            JsonReader in = null;
            JsonWriter out = null;
            Tee tee = null;
            boolean complete = false;
            int count = 0;
            try {
                in = new JsonReader(new InputStreamReader(new BufferedInputStream(raw, 64 * 1024), StandardCharsets.UTF_8));
                in.setLenient(true);
                tee = new Tee(sink, saveTo);
                out = new JsonWriter(new BufferedWriter(new OutputStreamWriter(tee, StandardCharsets.UTF_8), 64 * 1024));
                out.beginArray();
                if (in.peek() == JsonToken.BEGIN_ARRAY) {
                    in.beginArray();
                    while (in.hasNext()) {
                        if (in.peek() != JsonToken.BEGIN_OBJECT) {
                            in.skipValue();
                            continue;
                        }
                        copyObject(in, out);
                        count++;
                    }
                    in.endArray();
                } else {
                    in.skipValue();
                }
                out.endArray();
                out.flush();
                complete = count > 0;  // une liste vide (compte expiré…) ne remplace pas la copie précédente
            } catch (IOException | RuntimeException ignored) {
                // Flux coupé : l'interface recevra un JSON incomplet et affichera une erreur.
            } finally {
                closeQuietly(out);
                closeQuietly(in);
                closeQuietly(sink);
                if (tee != null) tee.finish(complete);
            }
        }, "ns-json-compact");
        worker.start();
        return result;
    }

    private static void copyObject(JsonReader in, JsonWriter out) throws IOException {
        in.beginObject();
        out.beginObject();
        while (in.hasNext()) {
            String name = in.nextName();
            if (!KEEP.contains(name)) {
                in.skipValue();
                continue;
            }
            switch (in.peek()) {
                case STRING:
                case NUMBER:
                    out.name(name).value(in.nextString());
                    break;
                case BOOLEAN:
                    out.name(name).value(in.nextBoolean());
                    break;
                default:
                    in.skipValue();
            }
        }
        in.endObject();
        out.endObject();
    }

    /** Écrit vers l'interface et, si possible, vers un fichier temporaire renommé à la fin. */
    private static final class Tee extends OutputStream {
        private final OutputStream main;
        private final File target;
        private File tmp;
        private OutputStream copy;

        Tee(OutputStream main, File target) {
            this.main = main;
            this.target = target;
            if (target == null) return;
            try {
                File dir = target.getParentFile();
                if (dir != null && !dir.isDirectory()) dir.mkdirs();
                tmp = File.createTempFile("part", ".tmp", dir);
                copy = new FileOutputStream(tmp);
            } catch (IOException | RuntimeException e) {
                dropCopy();
            }
        }

        @Override
        public void write(int b) throws IOException {
            main.write(b);
            if (copy != null) {
                try {
                    copy.write(b);
                } catch (IOException e) {
                    dropCopy();
                }
            }
        }

        @Override
        public void write(byte[] b, int off, int len) throws IOException {
            main.write(b, off, len);
            if (copy != null) {
                try {
                    copy.write(b, off, len);
                } catch (IOException e) {
                    dropCopy();
                }
            }
        }

        @Override
        public void flush() throws IOException {
            main.flush();
        }

        @Override
        public void close() throws IOException {
            main.close();
        }

        /** Garde la copie si la liste est complète, sinon l'efface. */
        void finish(boolean complete) {
            if (copy == null) return;
            closeQuietly(copy);
            copy = null;
            if (!complete || !tmp.renameTo(target)) tmp.delete();
            tmp = null;
        }

        private void dropCopy() {
            if (copy != null) closeQuietly(copy);
            copy = null;
            if (tmp != null) tmp.delete();
            tmp = null;
        }
    }

    private static void closeQuietly(java.io.Closeable c) {
        if (c == null) return;
        try {
            c.close();
        } catch (IOException ignored) {
            // Déjà fermé.
        }
    }
}
