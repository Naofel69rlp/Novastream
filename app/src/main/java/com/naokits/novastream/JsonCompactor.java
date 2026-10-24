package com.naokits.novastream;

import android.util.JsonReader;
import android.util.JsonToken;
import android.util.JsonWriter;

import java.io.BufferedInputStream;
import java.io.BufferedWriter;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
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
        final PipedInputStream result = new PipedInputStream(256 * 1024);
        final PipedOutputStream sink = new PipedOutputStream(result);
        Thread worker = new Thread(() -> {
            JsonReader in = null;
            JsonWriter out = null;
            try {
                in = new JsonReader(new InputStreamReader(new BufferedInputStream(raw, 64 * 1024), StandardCharsets.UTF_8));
                in.setLenient(true);
                out = new JsonWriter(new BufferedWriter(new OutputStreamWriter(sink, StandardCharsets.UTF_8), 64 * 1024));
                out.beginArray();
                if (in.peek() == JsonToken.BEGIN_ARRAY) {
                    in.beginArray();
                    while (in.hasNext()) {
                        if (in.peek() != JsonToken.BEGIN_OBJECT) {
                            in.skipValue();
                            continue;
                        }
                        copyObject(in, out);
                    }
                    in.endArray();
                } else {
                    in.skipValue();
                }
                out.endArray();
            } catch (IOException | RuntimeException ignored) {
                // Flux coupé : l'interface recevra un JSON incomplet et affichera une erreur.
            } finally {
                closeQuietly(out);
                closeQuietly(in);
                closeQuietly(sink);
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

    private static void closeQuietly(java.io.Closeable c) {
        if (c == null) return;
        try {
            c.close();
        } catch (IOException ignored) {
            // Déjà fermé.
        }
    }
}
