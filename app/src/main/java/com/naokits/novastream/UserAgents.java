package com.naokits.novastream;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * Identifiant (User-Agent) envoyé au serveur IPTV. Beaucoup de serveurs Xtream refusent (HTTP 403) les lecteurs
 * qu'ils ne connaissent pas : on se présente comme VLC, ce que fait la version Windows, et si le serveur refuse
 * encore, le lecteur essaie les identifiants suivants puis retient celui qui fonctionne.
 */
final class UserAgents {

    static final String[] ALL = {
            "VLC/3.0.20 LibVLC/3.0.20",
            "IPTVSmartersPlayer",
            "okhttp/4.12.0",
            "Lavf/60.16.100",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    };

    private UserAgents() {}

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences("novastream", Context.MODE_PRIVATE);
    }

    static int index(Context ctx) {
        int i = prefs(ctx).getInt("ua", 0);
        return i >= 0 && i < ALL.length ? i : 0;
    }

    /** Identifiant à utiliser : le dernier qui a fonctionné, VLC par défaut. */
    static String current(Context ctx) {
        return ALL[index(ctx)];
    }

    static void remember(Context ctx, int i) {
        if (i != index(ctx)) prefs(ctx).edit().putInt("ua", i).apply();
    }
}
