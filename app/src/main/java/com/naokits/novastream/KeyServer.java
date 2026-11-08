package com.naokits.novastream;

import android.content.Context;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Collections;

/**
 * Petite page web, sur le Wi-Fi de la maison, pour coller la clé OpenAI depuis un téléphone au lieu de la taper
 * à la télécommande. Ouverte seulement quand l'écran de la clé est affiché, fermée au bout de 10 minutes.
 */
final class KeyServer {

    static final int PORT = 8899;
    private static ServerSocket server;
    private static long openedAt;

    private KeyServer() {}

    /** Démarre la page et renvoie son adresse (http://192.168.x.x:8899), ou "" sans réseau local. */
    static synchronized String start(Context ctx) {
        String ip = localIp();
        if (ip == null) return "";
        openedAt = System.currentTimeMillis();
        if (server != null && !server.isClosed()) return "http://" + ip + ":" + PORT;
        try {
            server = new ServerSocket(PORT);
        } catch (IOException e) {
            return "";
        }
        final ServerSocket s = server;
        final Context app = ctx.getApplicationContext();
        new Thread(() -> {
            try {
                s.setSoTimeout(30_000);
                while (!s.isClosed() && System.currentTimeMillis() - openedAt < 10 * 60_000) {
                    try (Socket c = s.accept()) {
                        c.setSoTimeout(10_000);
                        handle(app, c);
                    } catch (java.net.SocketTimeoutException ignored) {
                        // Personne pour l'instant.
                    } catch (IOException e) {
                        if (s.isClosed()) break;
                    }
                }
            } catch (IOException ignored) {
                // Fermeture.
            }
            stop();
        }, "page-cle").start();
        return "http://" + ip + ":" + PORT;
    }

    static synchronized void stop() {
        if (server != null) {
            try {
                server.close();
            } catch (IOException ignored) {
                // Déjà fermé.
            }
        }
        server = null;
    }

    private static void handle(Context ctx, Socket c) throws IOException {
        InputStream in = c.getInputStream();
        ByteArrayOutputStream head = new ByteArrayOutputStream();
        int b, state = 0;
        while (state < 4 && (b = in.read()) != -1 && head.size() < 8192) {
            head.write(b);
            state = (b == '\r' || b == '\n') ? state + 1 : 0;
        }
        String request = head.toString("UTF-8");
        String first = request.split("\r\n", 2)[0];
        String message = null;
        if (first.startsWith("POST")) {
            int length = 0;
            for (String line : request.split("\r\n")) {
                if (line.toLowerCase().startsWith("content-length:")) length = Integer.parseInt(line.substring(15).trim());
            }
            byte[] body = new byte[Math.min(length, 4096)];
            int read = 0;
            while (read < body.length) {
                int n = in.read(body, read, body.length - read);
                if (n < 0) break;
                read += n;
            }
            String form = new String(body, 0, read, StandardCharsets.UTF_8);
            String key = "";
            for (String part : form.split("&")) {
                if (part.startsWith("key=")) key = URLDecoder.decode(part.substring(4), "UTF-8").trim();
            }
            if (key.startsWith("sk-")) {
                Dubber.saveKey(ctx, key);
                message = "✅ Clé enregistrée sur la TV. Vous pouvez fermer cette page.";
            } else {
                message = "❌ Ce n'est pas une clé OpenAI (elle commence par « sk- »).";
            }
        }
        String html = "<!doctype html><html lang=fr><head><meta charset=utf-8>"
                + "<meta name=viewport content='width=device-width,initial-scale=1'><title>NovaStream</title>"
                + "<style>body{font-family:system-ui,sans-serif;background:#09090b;color:#fff;padding:24px;max-width:520px;margin:auto}"
                + "input,button{width:100%;box-sizing:border-box;font-size:17px;padding:14px;border-radius:12px;border:1px solid #333;margin-top:12px}"
                + "input{background:#16161f;color:#fff}button{background:#3b82f6;color:#fff;border:0;font-weight:700}"
                + "p{color:#a1a1aa;line-height:1.5}.m{color:#fff;font-weight:700}</style></head><body>"
                + "<h2>NovaStream · Voix française</h2>"
                + (message != null ? "<p class=m>" + message + "</p>" : "")
                + "<p>Collez votre clé OpenAI (elle commence par « sk- »). Elle est envoyée directement à la TV, sur votre Wi-Fi.</p>"
                + "<form method=post><input name=key placeholder='sk-…' autocomplete=off autocapitalize=off>"
                + "<button>Envoyer à la TV</button></form></body></html>";
        byte[] bytes = html.getBytes(StandardCharsets.UTF_8);
        OutputStream out = c.getOutputStream();
        out.write(("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: " + bytes.length
                + "\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.UTF_8));
        out.write(bytes);
        out.flush();
    }

    private static String localIp() {
        try {
            for (NetworkInterface n : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!n.isUp() || n.isLoopback()) continue;
                for (InetAddress a : Collections.list(n.getInetAddresses())) {
                    if (a instanceof Inet4Address && a.isSiteLocalAddress()) return a.getHostAddress();
                }
            }
        } catch (Exception ignored) {
            // Pas de réseau.
        }
        return null;
    }
}
