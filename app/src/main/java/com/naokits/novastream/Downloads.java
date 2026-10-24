package com.naokits.novastream;

import android.app.DownloadManager;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.os.Environment;
import android.os.StatFs;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;

/**
 * Téléchargement des films et épisodes avec le DownloadManager d'Android : il continue appli fermée,
 * reprend après une coupure et affiche sa progression dans les notifications.
 * Les fichiers vont dans le dossier privé de l'appli (aucune autorisation demandée, supprimés avec l'appli).
 */
final class Downloads {

    private Downloads() {}

    /** Lance un téléchargement. Renvoie {"id": "..."} ou {"error": "..."}. */
    static String start(Context ctx, String json) {
        try {
            JSONObject o = new JSONObject(json);
            String url = o.getString("url");
            String title = o.optString("title", "NovaStream");
            String ext = o.optString("ext", "mp4").replaceAll("[^A-Za-z0-9]", "");
            if (ext.isEmpty()) ext = "mp4";
            File dir = ctx.getExternalFilesDir(Environment.DIRECTORY_MOVIES);
            if (dir == null) return error("Aucun stockage disponible sur cet appareil.");
            if (free(dir) < 300L * 1024 * 1024) return error("Espace de stockage insuffisant sur l'appareil.");

            String name = safeName(title) + "-" + System.currentTimeMillis() + "." + ext;
            DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url))
                    .setTitle(title)
                    .setDescription("NovaStream")
                    .addRequestHeader("User-Agent", MainActivity.USER_AGENT)
                    .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                    .setAllowedOverMetered(true)
                    .setAllowedOverRoaming(true)
                    .setDestinationInExternalFilesDir(ctx, Environment.DIRECTORY_MOVIES, name);
            long id = manager(ctx).enqueue(r);
            return new JSONObject().put("id", String.valueOf(id)).toString();
        } catch (JSONException e) {
            return error("Demande de téléchargement invalide.");
        } catch (RuntimeException e) {
            return error("Le gestionnaire de téléchargements d'Android est indisponible.");
        }
    }

    /** État de chaque téléchargement demandé : [{id, status, done, total, file, reason}]. */
    static String status(Context ctx, String idsJson) {
        JSONArray out = new JSONArray();
        try {
            JSONArray ids = new JSONArray(idsJson);
            if (ids.length() == 0) return "[]";
            long[] wanted = new long[ids.length()];
            for (int i = 0; i < wanted.length; i++) wanted[i] = Long.parseLong(ids.getString(i));
            JSONObject found = new JSONObject();
            try (Cursor c = manager(ctx).query(new DownloadManager.Query().setFilterById(wanted))) {
                while (c != null && c.moveToNext()) {
                    long id = c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_ID));
                    int st = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                    int reason = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON));
                    String local = c.getString(c.getColumnIndexOrThrow(DownloadManager.COLUMN_LOCAL_URI));
                    JSONObject d = new JSONObject()
                            .put("id", String.valueOf(id))
                            .put("status", statusName(st))
                            .put("done", c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR)))
                            .put("total", c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES)))
                            .put("file", local == null ? "" : local)
                            .put("reason", reasonText(st, reason));
                    found.put(String.valueOf(id), d);
                }
            }
            for (long id : wanted) {
                JSONObject d = found.optJSONObject(String.valueOf(id));
                if (d == null) {
                    d = new JSONObject().put("id", String.valueOf(id)).put("status", "missing")
                            .put("done", 0).put("total", 0).put("file", "").put("reason", "Fichier supprimé");
                } else if ("done".equals(d.getString("status")) && !exists(d.getString("file"))) {
                    d.put("status", "missing").put("reason", "Fichier supprimé");
                }
                out.put(d);
            }
        } catch (JSONException | NumberFormatException e) {
            return "[]";
        } catch (RuntimeException e) {
            return "[]";
        }
        return out.toString();
    }

    /** Annule le téléchargement s'il est en cours et efface le fichier. */
    static void remove(Context ctx, String id) {
        try {
            manager(ctx).remove(Long.parseLong(id));
        } catch (RuntimeException ignored) {
            // Déjà supprimé.
        }
    }

    /** Espace libre restant, en octets, dans le dossier des téléchargements. */
    static long freeSpace(Context ctx) {
        File dir = ctx.getExternalFilesDir(Environment.DIRECTORY_MOVIES);
        return dir == null ? 0 : free(dir);
    }

    private static DownloadManager manager(Context ctx) {
        DownloadManager dm = (DownloadManager) ctx.getSystemService(Context.DOWNLOAD_SERVICE);
        if (dm == null) throw new IllegalStateException("DownloadManager");
        return dm;
    }

    private static long free(File dir) {
        try {
            StatFs fs = new StatFs(dir.getPath());
            return fs.getAvailableBytes();
        } catch (RuntimeException e) {
            return Long.MAX_VALUE;
        }
    }

    private static boolean exists(String uri) {
        if (uri == null || uri.isEmpty()) return false;
        Uri u = Uri.parse(uri);
        if (!"file".equals(u.getScheme()) || u.getPath() == null) return true;
        return new File(u.getPath()).exists();
    }

    private static String safeName(String title) {
        String s = title.replaceAll("[^\\p{L}\\p{N} ._-]", "").trim().replaceAll("\\s+", "_");
        if (s.length() > 60) s = s.substring(0, 60);
        return s.isEmpty() ? "video" : s;
    }

    private static String statusName(int status) {
        switch (status) {
            case DownloadManager.STATUS_SUCCESSFUL: return "done";
            case DownloadManager.STATUS_RUNNING: return "running";
            case DownloadManager.STATUS_PAUSED: return "paused";
            case DownloadManager.STATUS_FAILED: return "failed";
            default: return "pending";
        }
    }

    private static String reasonText(int status, int reason) {
        if (status == DownloadManager.STATUS_PAUSED) {
            switch (reason) {
                case DownloadManager.PAUSED_WAITING_FOR_NETWORK: return "En attente de connexion";
                case DownloadManager.PAUSED_WAITING_TO_RETRY: return "Nouvel essai bientôt";
                case DownloadManager.PAUSED_QUEUED_FOR_WIFI: return "En attente du Wi-Fi";
                default: return "En pause";
            }
        }
        if (status != DownloadManager.STATUS_FAILED) return "";
        switch (reason) {
            case DownloadManager.ERROR_INSUFFICIENT_SPACE: return "Espace de stockage insuffisant";
            case DownloadManager.ERROR_DEVICE_NOT_FOUND: return "Stockage introuvable";
            case DownloadManager.ERROR_FILE_ERROR: return "Impossible d'écrire le fichier";
            case DownloadManager.ERROR_TOO_MANY_REDIRECTS: return "Trop de redirections";
            case DownloadManager.ERROR_CANNOT_RESUME: return "Coupure, reprise impossible";
            case DownloadManager.ERROR_HTTP_DATA_ERROR: return "Connexion interrompue";
            case DownloadManager.ERROR_UNHANDLED_HTTP_CODE: return "Refusé par le serveur";
            default:
                if (reason >= 400 && reason < 600) return "Refusé par le serveur (HTTP " + reason + ")";
                return "Échec du téléchargement";
        }
    }

    private static String error(String message) {
        try {
            return new JSONObject().put("error", message).toString();
        } catch (JSONException e) {
            return "{\"error\":\"Erreur\"}";
        }
    }
}
