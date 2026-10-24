/* NovaStream TV : interface à la télécommande pour l'API Xtream Codes.
   Dans l'appli Android, `window.Android` fournit les requêtes HTTP (sans CORS) et le lecteur ExoPlayer.
   Dans un navigateur, l'interface se rabat sur XMLHttpRequest et une balise <video>. */
(function () {
  "use strict";

  // ---------------------------------------------------------------- Appareil

  // TV : navigation à la télécommande. Téléphone/tablette : interface tactile.
  var IS_TV = (window.Android && window.Android.isTv) ? window.Android.isTv()
    : !(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
  document.documentElement.classList.add(IS_TV ? "tv" : "touch");

  // ---------------------------------------------------------------- Utilitaires

  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === "class") el.className = v;
        else if (k === "text") el.textContent = v;
        else if (k === "html") el.innerHTML = v;
        else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? "" : v);
      });
    }
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }

  function append(el, child) {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) child.forEach(function (c) { append(el, c); });
    else el.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  }

  var ICONS = {
    home: '<path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z"/>',
    live: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="m8 2 4 4 4-4"/>',
    movies: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4"/>',
    series: '<rect x="3" y="5" width="15" height="13" rx="2"/><path d="M21 8v13H8M9 9l4 2.5L9 14z"/>',
    heart: '<path d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-5-5"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
    play: '<path d="M7 4v16l13-8z" fill="currentColor"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="m5 12 5 5 9-10"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/>'
  };

  function icon(name) {
    var span = document.createElement("span");
    span.style.display = "contents";
    span.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round">' + ICONS[name] + "</svg>";
    return span.firstChild;
  }

  var GRADIENTS = [["#7f1d1d", "#3b0a0a"], ["#15803d", "#134e4a"], ["#4d7c0f", "#14532d"], ["#3b0764", "#1e1b4b"],
    ["#9a3412", "#451a03"], ["#9f1239", "#4c0519"], ["#155e75", "#1e1b4b"]];

  function gradient(seed) {
    var hash = 5381;
    for (var i = 0; i < seed.length; i++) hash = ((hash * 33) + seed.charCodeAt(i)) >>> 0;
    var g = GRADIENTS[hash % GRADIENTS.length];
    return "linear-gradient(180deg," + g[0] + "," + g[1] + ")";
  }

  function initials(name) {
    var clean = name.replace(/^[A-Za-z]{2,4}\s*[|:\-]\s*/, "");
    return clean.split(/\s+/).filter(function (w) { return /^[0-9A-Za-zÀ-ÿ]/.test(w); }).slice(0, 2)
      .map(function (w) { return w[0]; }).join("").toUpperCase();
  }

  // Les affiches ne sont décodées que près de l'écran, puis libérées quand on s'en éloigne :
  // une TV a peu de mémoire et des centaines d'affiches suffiraient à faire fermer l'appli.
  var imageWatcher = ("IntersectionObserver" in window) ? new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      var el = e.target;
      if (e.isIntersecting) {
        if (!el.getAttribute("src")) el.setAttribute("src", el.getAttribute("data-src"));
      } else if (el.getAttribute("src")) {
        el.removeAttribute("src");
      }
    });
  }, { rootMargin: "900px 900px" }) : null;

  function img(src, onFail) {
    if (!src || !/^https?:/.test(src)) return null;
    var el = h("img", { alt: "", decoding: "async", onerror: function () {
      if (!this.getAttribute("src")) return;
      if (imageWatcher) imageWatcher.unobserve(this);
      this.remove();
      if (onFail) onFail();
    } });
    if (imageWatcher) {
      el.setAttribute("data-src", src);
      imageWatcher.observe(el);
    } else {
      el.setAttribute("src", src);
      el.setAttribute("loading", "lazy");
    }
    return el;
  }

  function str(v) {
    if (v === null || v === undefined) return "";
    return String(v).trim();
  }

  function num(v) {
    var n = parseFloat(str(v).replace(",", "."));
    return isNaN(n) ? 0 : n;
  }

  function toast(text) {
    var t = document.getElementById("toast");
    t.textContent = text;
    t.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { t.classList.remove("show"); }, 2600);
  }

  var store = {
    get: function (key, fallback) {
      try { var v = localStorage.getItem("ns." + key); return v === null ? fallback : JSON.parse(v); }
      catch (e) { return fallback; }
    },
    set: function (key, value) {
      try { localStorage.setItem("ns." + key, JSON.stringify(value)); } catch (e) { /* stockage indisponible */ }
    },
    remove: function (key) {
      try { localStorage.removeItem("ns." + key); } catch (e) { /* stockage indisponible */ }
    }
  };

  // ---------------------------------------------------------------- Sons (ceux de la version Windows)

  // Musique d'ambiance douce en boucle pendant la navigation, clic à la validation, transition entre écrans
  // et petit tic à chaque déplacement de la sélection. Coupé pendant la lecture d'une vidéo.
  var Sound = (function () {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    var ctx = null, buffers = {}, music = null, musicGain = null, pendingClick = null, lastTick = 0;
    var visible = true, playing = false;
    var MUSIC_VOLUME = 0.12;

    function init() {
      if (ctx || !Ctx) return;
      try { ctx = new Ctx(); } catch (e) { ctx = null; return; }
      musicGain = ctx.createGain();
      musicGain.gain.value = 0;
      musicGain.connect(ctx.destination);
      ["click", "transition", "ambient"].forEach(function (name) {
        fetch("audio/" + name + ".ogg").then(function (r) { return r.arrayBuffer(); }).then(function (data) {
          return new Promise(function (resolve, reject) { ctx.decodeAudioData(data, resolve, reject); });
        }).then(function (buffer) {
          buffers[name] = buffer;
          if (name === "ambient") update();
        }).catch(function () { /* son indisponible : on continue sans */ });
      });
    }

    function wake() {
      if (ctx && ctx.state === "suspended" && visible) ctx.resume();
    }

    function effect(name, volume, rate) {
      if (!store.get("sfx", true) || !ctx || !buffers[name] || !visible) return;
      wake();
      var src = ctx.createBufferSource();
      src.buffer = buffers[name];
      if (rate) src.playbackRate.value = rate;
      var gain = ctx.createGain();
      gain.gain.value = volume;
      src.connect(gain);
      gain.connect(ctx.destination);
      src.start(0);
    }

    function update() {
      if (!ctx) return;
      var want = store.get("music", true) && visible && !playing;
      if (want && !music && buffers.ambient) {
        music = ctx.createBufferSource();
        music.buffer = buffers.ambient;
        music.loop = true;
        music.connect(musicGain);
        music.start(0);
      }
      var t = ctx.currentTime;
      musicGain.gain.cancelScheduledValues(t);
      musicGain.gain.setValueAtTime(musicGain.gain.value, t);
      musicGain.gain.linearRampToValueAtTime(want ? MUSIC_VOLUME : 0, t + (want ? 1.5 : 0.35));
      if (want) wake();
    }

    // Le navigateur peut exiger une première action avant de jouer un son.
    ["keydown", "touchstart", "mousedown"].forEach(function (type) {
      document.addEventListener(type, function () { init(); wake(); update(); }, { capture: true, passive: true });
    });
    init();

    return {
      click: function () {
        clearTimeout(pendingClick);
        pendingClick = setTimeout(function () { effect("click", 0.2); }, 0);
      },
      transition: function () {
        clearTimeout(pendingClick);  // un écran qui change remplace le clic par la transition
        effect("transition", 0.18);
      },
      tick: function () {
        var now = Date.now();
        if (now - lastTick < 60) return;
        lastTick = now;
        effect("click", 0.06, 1.3);
      },
      playing: function (on) { playing = on; update(); },
      visible: function (on) {
        visible = on;
        if (!ctx) return;
        if (on) { playing = false; musicGain.gain.setValueAtTime(0, ctx.currentTime); ctx.resume(); update(); }
        else ctx.suspend();
      },
      update: update
    };
  })();

  // ---------------------------------------------------------------- Réseau

  // Dans l'appli Android, les requêtes passent par le relais interne /api (pas de CORS, réponse en flux,
  // listes allégées). Dans un navigateur, on interroge directement le serveur.
  var VIA_APP = !!window.Android && location.pathname.indexOf("/web/") === 0;

  function httpGet(url, compact) {
    if (VIA_APP) {
      return fetch("/api?u=" + encodeURIComponent(url) + (compact ? "&compact=1" : ""), { cache: "no-store" })
        .catch(function () { throw new Error("Impossible de joindre le serveur. Vérifiez l'URL ou votre connexion."); })
        .then(function (r) {
          return r.text().then(function (text) {
            if (r.ok) return text;
            var message = null;
            try { message = JSON.parse(text).error; } catch (e) { /* pas de détail */ }
            throw new Error(message || "Erreur HTTP " + r.status + " du serveur.");
          });
        });
    }
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open("GET", url);
      xhr.timeout = 30000;
      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.responseText);
        else reject(new Error("Erreur HTTP " + xhr.status + " du serveur."));
      };
      xhr.onerror = function () { reject(new Error("Impossible de joindre le serveur. Vérifiez l'URL ou votre connexion.")); };
      xhr.ontimeout = function () { reject(new Error("Délai de connexion dépassé. Le serveur ne répond pas.")); };
      xhr.send();
    });
  }

  function normalizeServer(url) {
    url = str(url);
    if (!/^https?:\/\//i.test(url)) url = "http://" + url;
    return url.replace(/\/+$/, "");
  }

  // Équivalent de api/xtream_client.py
  var Xtream = {
    creds: null,

    api: function (action, params, compact) {
      var c = Xtream.creds;
      var q = "username=" + encodeURIComponent(c.username) + "&password=" + encodeURIComponent(c.password);
      if (action) q += "&action=" + action;
      Object.keys(params || {}).forEach(function (k) { q += "&" + k + "=" + encodeURIComponent(params[k]); });
      return httpGet(c.server + "/player_api.php?" + q, compact).then(function (text) {
        try { return JSON.parse(text); }
        catch (e) { throw new Error("Réponse inattendue du serveur (pas du JSON valide)."); }
      });
    },

    login: function (creds) {
      Xtream.creds = creds;
      return Xtream.api(null).then(function (data) {
        var u = (data && data.user_info) || {};
        if (str(u.auth) !== "1" && u.auth !== true) {
          var status = str(u.status).toLowerCase();
          if (status === "expired") throw new Error("Votre abonnement IPTV a expiré.");
          if (status === "disabled" || status === "banned") throw new Error("Votre compte a été désactivé par le fournisseur.");
          throw new Error("Nom d'utilisateur ou mot de passe incorrect.");
        }
        var exp = num(u.exp_date);
        return {
          username: str(u.username) || creds.username,
          status: str(u.status) || "Active",
          expires: exp > 0 ? new Date(exp * 1000).toLocaleDateString("fr-FR") : "Illimité",
          connections: str(u.active_cons || "0") + " / " + str(u.max_connections || "1")
        };
      });
    },

    list: function (action) {
      return Xtream.api(action, null, true).then(function (d) { return Array.isArray(d) ? d : []; });
    },

    streamUrl: function (kind, id, ext) {
      var c = Xtream.creds;
      ext = str(ext).replace(/^\./, "") || "mp4";
      return c.server + "/" + kind + "/" + encodeURIComponent(c.username) + "/" + encodeURIComponent(c.password) + "/" + id + "." + ext;
    }
  };

  function rating(o) {
    var r = num(o.rating);
    if (r > 0) return Math.min(r, 10);
    r = num(o.rating_5based);
    return r > 0 ? Math.min(r * 2, 10) : 0;
  }

  function category(o) {
    return { id: str(o.category_id), name: str(o.category_name) || "Sans catégorie" };
  }

  function liveItem(o) {
    return { kind: "live", id: str(o.stream_id), name: str(o.name) || "Chaîne inconnue", image: str(o.stream_icon),
      cat: str(o.category_id), added: num(o.added) };
  }

  function movieItem(o) {
    return { kind: "movie", id: str(o.stream_id), name: str(o.name) || "Film sans titre", image: str(o.stream_icon),
      cat: str(o.category_id), rating: rating(o), year: str(o.year), ext: str(o.container_extension) || "mp4", added: num(o.added) };
  }

  function seriesItem(o) {
    var release = str(o.releaseDate || o.release_date);
    return { kind: "series", id: str(o.series_id), name: str(o.name) || "Série sans titre", image: str(o.cover),
      cat: str(o.category_id), rating: rating(o), year: release.slice(0, 4), added: num(o.last_modified),
      plot: str(o.plot), genre: str(o.genre) };
  }

  function firstString(v) {
    if (Array.isArray(v)) return str(v.find(function (x) { return str(x); }));
    return str(v);
  }

  function episodesBySeason(raw) {
    var seasons = {};
    function add(list, key) {
      (Array.isArray(list) ? list : []).forEach(function (e) {
        if (!e || e.id === undefined) return;
        var info = e.info || {};
        var s = parseInt(e.season, 10) || parseInt(key, 10) || 1;
        (seasons[s] = seasons[s] || []).push({
          id: str(e.id), num: parseInt(e.episode_num, 10) || 0, title: str(e.title), ext: str(e.container_extension) || "mp4",
          duration: str(info.duration), plot: str(info.plot), image: str(info.movie_image)
        });
      });
    }
    if (Array.isArray(raw)) raw.forEach(function (list, i) { add(list, i + 1); });
    else if (raw && typeof raw === "object") Object.keys(raw).forEach(function (k) { add(raw[k], k); });
    Object.keys(seasons).forEach(function (k) { seasons[k].sort(function (a, b) { return a.num - b.num; }); });
    return seasons;
  }

  function minutes(duration) {
    var p = str(duration).split(":").map(Number);
    if (p.length !== 3 || p.some(isNaN)) return str(duration);
    if (p[0] > 0) return p[0] + " h " + String(p[1]).padStart(2, "0");
    return p[1] > 0 ? p[1] + " min" : "";
  }

  // ---------------------------------------------------------------- Données démo

  var DEMO_URL = "https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_16x9/bipbop_16x9_variant.m3u8";

  var Demo = {
    user: { username: "demo", status: "Active", expires: "01/01/2030", connections: "0 / 1" },
    live: function () {
      var themes = [["Sport", "2"], ["Ciné", "1"], ["Kids", "4"], ["Doc", "1"], ["Info", "3"]];
      var items = [];
      for (var n = 1; n <= 40; n++) {
        var t = themes[(n - 1) % themes.length];
        items.push({ kind: "live", id: String(n), name: "Nova " + t[0] + " " + n + (n % 3 === 0 ? " FHD" : " HD"), cat: t[1], image: "" });
      }
      return { cats: [{ id: "1", name: "FR | Généralistes" }, { id: "2", name: "Sport" }, { id: "3", name: "Info" }, { id: "4", name: "Jeunesse" }], items: items };
    },
    movies: function () {
      var items = [];
      for (var n = 0; n < 30; n++) {
        items.push({ kind: "movie", id: "m" + n, name: "Nova " + n, cat: ["10", "11", "12"][n % 3], image: "",
          rating: n % 4 === 0 ? 0 : (50 + (n * 7) % 40) / 10, year: String(2010 + n % 14), ext: "m3u8", added: 1000 - n });
      }
      return { cats: [{ id: "10", name: "Science-fiction" }, { id: "11", name: "Aventure" }, { id: "12", name: "Drame" }], items: items };
    },
    series: function () {
      var items = [];
      for (var n = 0; n < 16; n++) {
        items.push({ kind: "series", id: "s" + n, name: "Série Nébuleuse atlas " + (50 + n), cat: n % 2 ? "21" : "20", image: "",
          rating: 8.2, year: "2012", added: 1000 - n, genre: "Science-fiction",
          plot: "Dans un futur proche, une équipe d'explorateurs découvre un signal venu des confins du système solaire." });
      }
      return { cats: [{ id: "20", name: "Science-fiction" }, { id: "21", name: "Policier" }], items: items };
    },
    seriesInfo: function (item) {
      var seasons = {};
      for (var s = 1; s <= 3; s++) {
        seasons[s] = [];
        for (var e = 1; e <= 8; e++) {
          seasons[s].push({ id: item.id + "-" + s + "-" + e, num: e, title: "Chapitre " + e, ext: "m3u8", duration: "00:42:00",
            plot: "Les explorateurs approchent du signal.", image: "" });
        }
      }
      return { plot: item.plot + " Chaque épisode révèle un peu plus du mystère.", genre: item.genre, year: item.year,
        rating: item.rating, director: "Showrunner Fictif", cast: "Distribution Fictive", seasons: seasons };
    }
  };

  // ---------------------------------------------------------------- État

  var S = {
    user: null,
    demo: false,
    catalogs: {},  // live / movies / series → { cats, items } ou une promesse en cours
    favorites: store.get("favorites", []),
    liveFormat: store.get("liveFormat", "ts"),
    stack: [],     // pile de navigation : { name, params, focus, el (écran gardé) }
    root: "home",
    version: 0     // change quand Ma liste change : les écrans gardés sont alors reconstruits
  };

  function catalog(section) {
    var c = S.catalogs[section];
    if (c && c.items) return Promise.resolve(c);
    if (c && c.then) return c;
    var p;
    if (S.demo) {
      p = Promise.resolve(Demo[section]());
    } else if (section === "live") {
      p = Promise.all([Xtream.list("get_live_categories"), Xtream.list("get_live_streams")]).then(function (r) {
        return { cats: r[0].map(category), items: r[1].map(liveItem).filter(function (i) { return i.id; }) };
      });
    } else if (section === "movies") {
      p = Promise.all([Xtream.list("get_vod_categories"), Xtream.list("get_vod_streams")]).then(function (r) {
        return { cats: r[0].map(category), items: r[1].map(movieItem).filter(function (i) { return i.id; }) };
      });
    } else {
      p = Promise.all([Xtream.list("get_series_categories"), Xtream.list("get_series")]).then(function (r) {
        return { cats: r[0].map(category), items: r[1].map(seriesItem).filter(function (i) { return i.id; }) };
      });
    }
    S.catalogs[section] = p.then(function (data) { S.catalogs[section] = data; return data; },
      function (err) { delete S.catalogs[section]; throw err; });
    return S.catalogs[section];
  }

  function isFavorite(item) {
    return S.favorites.some(function (f) { return f.kind === item.kind && f.id === item.id; });
  }

  function toggleFavorite(item) {
    if (isFavorite(item)) {
      S.favorites = S.favorites.filter(function (f) { return !(f.kind === item.kind && f.id === item.id); });
      toast("Retiré de Ma liste");
    } else {
      S.favorites.unshift(item);
      toast("Ajouté à Ma liste");
    }
    store.set("favorites", S.favorites);
    S.version++;
  }

  // ---------------------------------------------------------------- Lecture

  function liveUrl(ch) {
    return S.demo ? DEMO_URL : Xtream.streamUrl("live", ch.id, S.liveFormat);
  }

  // Préférences du lecteur (Paramètres) : langue audio, sous-titres et format de l'image selon le type.
  var LANGS = [["", "Automatique"], ["fr", "Français"], ["en", "Anglais"], ["ar", "Arabe"], ["es", "Espagnol"],
    ["it", "Italien"], ["de", "Allemand"], ["pt", "Portugais"], ["tr", "Turc"], ["nl", "Néerlandais"]];
  var SUBS = [["off", "Désactivés"]].concat(LANGS.slice(1));
  var RESIZE = [["fit", "Adapté à l'écran"], ["zoom", "Plein écran (zoom)"], ["fill", "Étiré"]];

  function play(payload) {
    var kind = payload.kind || (payload.live ? "live" : "movie");
    payload.audioLang = store.get("audioLang", "");
    payload.subLang = store.get("subLang", "off");
    payload.resize = store.get("resize." + kind, "fit");
    Sound.playing(true);
    if (window.Android && window.Android.play) {
      window.Android.play(JSON.stringify(payload));
      return;
    }
    // Lecteur de secours pour un navigateur.
    var video = h("video", { src: payload.urls[payload.index], autoplay: true, controls: true });
    var overlay = h("div", { class: "web-player" }, video, h("div", { class: "title", text: payload.titles[payload.index] }));
    document.body.appendChild(overlay);
    webPlayer = overlay;
  }

  var webPlayer = null;

  function playLive(channels, index) {
    play({ live: true, kind: "live", index: index, titles: channels.map(function (c) { return c.name; }),
      urls: channels.map(liveUrl), subtitle: "En direct" });
  }

  function playMovie(item) {
    play({ live: false, kind: "movie", index: 0, titles: [item.name], subtitle: item.year || "",
      urls: [DL.localFile("movie-" + item.id) || (S.demo ? DEMO_URL : Xtream.streamUrl("movie", item.id, item.ext))] });
  }

  function playEpisodes(show, season, episodes, index) {
    play({ live: false, kind: "series", index: index, subtitle: show.name,
      titles: episodes.map(function (e) { return "S" + season + " É" + e.num + " · " + (e.title || "Épisode " + e.num); }),
      urls: episodes.map(function (e) {
        return DL.localFile("ep-" + e.id) || (S.demo ? DEMO_URL : Xtream.streamUrl("series", e.id, e.ext));
      }) });
  }

  // ---------------------------------------------------------------- Téléchargements

  // Le fichier est récupéré par le gestionnaire de téléchargements d'Android (il continue appli fermée).
  // Un seul téléchargement à la fois : la plupart des abonnements n'autorisent qu'une connexion.
  var DEMO_FILE = "https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4";
  var ACTIVE = { pending: 1, running: 1, paused: 1 };

  var DL = {
    available: !!(window.Android && window.Android.download),
    list: store.get("downloads", []),  // { key, id, kind, title, subtitle, image, url, ext, added }
    status: {},                         // id Android → { status, done, total, file, reason }

    find: function (key) { return DL.list.find(function (d) { return d.key === key; }) || null; },

    state: function (d) {
      if (!d) return { status: "none" };
      if (!d.id) return { status: "queued", done: 0, total: 0 };
      return DL.status[d.id] || { status: "pending", done: 0, total: 0 };
    },

    localFile: function (key) {
      var st = DL.state(DL.find(key));
      return st.status === "done" && st.file ? st.file : null;
    },

    save: function () { store.set("downloads", DL.list); },

    // Plus récents d'abord ; les épisodes d'une même saison restent dans l'ordre.
    sorted: function () {
      return DL.list.slice().sort(function (a, b) { return (b.added - a.added) || ((a.order || 0) - (b.order || 0)); });
    },

    add: function (entry) {
      if (!DL.available) { toast("Le téléchargement est disponible dans l'appli Android (TV ou téléphone)."); return false; }
      var old = DL.find(entry.key);
      if (old && DL.state(old).status !== "failed" && DL.state(old).status !== "missing") return false;
      if (old) DL.forget(old);
      entry.added = entry.added || Date.now();
      entry.order = entry.order || 0;
      entry.id = null;
      DL.list.unshift(entry);
      DL.save();
      DL.pump();
      return true;
    },

    forget: function (d) {
      if (d.id && window.Android) window.Android.removeDownload(d.id);
      if (d.id) delete DL.status[d.id];
      DL.list = DL.list.filter(function (x) { return x !== d; });
      DL.save();
    },

    refresh: function () {
      if (!DL.available) return;
      var ids = DL.list.filter(function (d) { return d.id; }).map(function (d) { return d.id; });
      if (!ids.length) return;
      try {
        JSON.parse(window.Android.downloads(JSON.stringify(ids))).forEach(function (st) { DL.status[st.id] = st; });
      } catch (e) { /* état indisponible */ }
    },

    // Lance le plus ancien téléchargement en attente quand aucun n'est en cours.
    pump: function () {
      DL.refresh();
      var busy = DL.list.some(function (d) { return d.id && ACTIVE[DL.state(d).status]; });
      if (busy) return;
      var next = DL.list.slice().sort(function (a, b) { return (a.added - b.added) || ((a.order || 0) - (b.order || 0)); })
        .find(function (d) { return !d.id; });
      if (!next) return;
      var res = {};
      try {
        res = JSON.parse(window.Android.download(JSON.stringify({ url: next.url, title: next.title, ext: next.ext })));
      } catch (e) { res = { error: "Téléchargement impossible." }; }
      if (res.error) {
        toast(res.error);
        DL.list = DL.list.filter(function (x) { return x !== next; });
      } else {
        next.id = res.id;
        DL.status[res.id] = { status: "pending", done: 0, total: 0 };
      }
      DL.save();
    },

    // Les boutons et lignes de téléchargement visibles se mettent à jour tout seuls.
    watch: function (el, paint) {
      el.__paint = paint;
      el.classList.add("dlw");
      paint();
      return el;
    },

    repaint: function (root) {
      Array.prototype.forEach.call((root || document).querySelectorAll(".dlw"), function (el) { el.__paint(); });
    },

    tick: function () {
      if (!DL.available || !DL.list.length) return;
      var visible = document.querySelectorAll(".dlw");
      var active = DL.list.some(function (d) { return !d.id || ACTIVE[DL.state(d).status]; });
      if (!active && !visible.length) return;
      DL.pump();
      DL.repaint();
    }
  };

  setInterval(function () { if (!document.hidden) DL.tick(); }, 1500);

  function bytes(n) {
    if (!n || n < 0) return "";
    if (n >= 1e9) return (n / 1e9).toFixed(1).replace(".", ",") + " Go";
    return Math.round(n / 1e6) + " Mo";
  }

  // Texte court décrivant l'état d'un téléchargement.
  function dlLabel(d) {
    var st = DL.state(d);
    switch (st.status) {
      case "done": return "Téléchargé" + (st.total > 0 ? " · " + bytes(st.total) : "");
      case "queued": return "En file d'attente";
      case "pending": return "Démarrage…";
      case "running":
        return st.total > 0 ? Math.floor(st.done * 100 / st.total) + " % · " + bytes(st.done) + " sur " + bytes(st.total)
          : "En cours · " + bytes(st.done);
      case "paused": return st.reason || "En pause";
      case "failed": return "Échec : " + (st.reason || "téléchargement interrompu");
      case "missing": return "Fichier supprimé";
      default: return "";
    }
  }

  function dlProgress(d) {
    var st = DL.state(d);
    if (st.status === "done") return 1;
    return st.total > 0 ? st.done / st.total : 0;
  }

  function movieDownload(item) {
    return { key: "movie-" + item.id, kind: "movie", title: item.name, subtitle: item.year || "Film", image: item.image,
      url: S.demo ? DEMO_FILE : Xtream.streamUrl("movie", item.id, item.ext), ext: S.demo ? "mp4" : (item.ext || "mp4") };
  }

  function episodeDownload(show, season, e) {
    return { key: "ep-" + e.id, kind: "episode", title: show.name + " · S" + season + " É" + e.num,
      subtitle: e.title || "Épisode " + e.num, image: e.image || show.image,
      url: S.demo ? DEMO_FILE : Xtream.streamUrl("series", e.id, e.ext), ext: S.demo ? "mp4" : (e.ext || "mp4") };
  }

  // Bouton « Télécharger » d'une fiche film : affiche la progression puis « Téléchargé ».
  function downloadButton(entry) {
    var btn = h("button", { class: "btn secondary f", "data-key": "dl" });
    function paint() {
      var d = DL.find(entry().key), st = DL.state(d).status;
      btn.innerHTML = "";
      if (st === "done") append(btn, [icon("check"), "Téléchargé"]);
      else if (st === "none" || st === "failed" || st === "missing") append(btn, [icon("download"), st === "none" ? "Télécharger" : "Réessayer le téléchargement"]);
      else append(btn, [icon("download"), st === "running" ? Math.floor(dlProgress(d) * 100) + " %" : "En attente…"]);
    }
    btn.addEventListener("click", function () {
      var e = entry(), d = DL.find(e.key), st = DL.state(d).status;
      if (st === "none" || st === "failed" || st === "missing") {
        if (DL.add(e)) toast("Téléchargement lancé : " + e.title);
      } else {
        go("downloads");
        return;
      }
      paint();
    });
    if (!DL.available) return null;
    return DL.watch(btn, paint);
  }

  // Petit bouton rond à côté d'un épisode.
  function episodeDownloadButton(entry) {
    var btn = h("button", { class: "fav-btn dl-mini f", "data-key": "epdl-" + entry.key, title: "Télécharger" });
    function paint() {
      var d = DL.find(entry.key), st = DL.state(d).status;
      btn.innerHTML = "";
      btn.classList.toggle("on", st === "done");
      if (st === "done") btn.appendChild(icon("check"));
      else if (st === "running") btn.appendChild(h("span", { class: "pct", text: Math.floor(dlProgress(d) * 100) + "%" }));
      else if (st === "queued" || st === "pending" || st === "paused") btn.appendChild(h("span", { class: "pct", text: "…" }));
      else btn.appendChild(icon("download"));
    }
    btn.addEventListener("click", function () {
      var st = DL.state(DL.find(entry.key)).status;
      if (st === "none" || st === "failed" || st === "missing") {
        if (DL.add(entry)) toast("Téléchargement lancé : " + entry.title);
      } else toast(entry.title + " : " + dlLabel(DL.find(entry.key)));
      paint();
    });
    return DL.watch(btn, paint);
  }

  // ---------------------------------------------------------------- Navigation à la télécommande

  var app = document.getElementById("app");
  var lastContentFocus = null;
  var wantsContentFocus = false;  // l'écran attend la fin d'un chargement pour sélectionner son contenu

  function focusables() {
    return Array.prototype.filter.call(document.querySelectorAll(".f"), function (el) {
      if (el.disabled || el.offsetParent === null) return false;
      return !webPlayer;
    });
  }

  function focus(el, scroll) {
    if (!el) return;
    if (!IS_TV) return;  // au doigt, pas de sélection ni de défilement automatique
    el.focus({ preventScroll: true });
    if (scroll !== false) scrollIntoView(el);
    if (!el.closest(".nav")) lastContentFocus = el;
    var hook = el.getAttribute("data-onfocus");
    if (hook && focusHooks[hook]) focusHooks[hook](el);
  }

  var focusHooks = {};

  // Défilement animé maison : court, interrompable, et instantané quand une flèche reste enfoncée.
  // (Le défilement « smooth » du navigateur saccade sur les TV et fausse la position des éléments.)
  var fastScroll = false;

  function scrollTo(box, prop, delta) {
    var max = prop === "scrollLeft" ? box.scrollWidth - box.clientWidth : box.scrollHeight - box.clientHeight;
    var from = box[prop];
    var to = Math.max(0, Math.min(max, Math.round(from + delta)));
    var key = "__anim" + prop;
    if (box[key]) cancelAnimationFrame(box[key]);
    box[key] = 0;
    if (to === from) return;
    if (fastScroll || !IS_TV) { box[prop] = to; return; }
    var start = null, duration = 170;
    function step(t) {
      if (start === null) start = t;
      var k = Math.min(1, (t - start) / duration);
      box[prop] = from + (to - from) * (1 - Math.pow(1 - k, 3));
      box[key] = k < 1 ? requestAnimationFrame(step) : 0;
    }
    box[key] = requestAnimationFrame(step);
  }

  function scrollIntoView(el) {
    var row = el.closest(".row, .seasons");
    if (row && row.scrollWidth > row.clientWidth) {
      var r = el.getBoundingClientRect(), rr = row.getBoundingClientRect();
      if (r.left < rr.left + 30) scrollTo(row, "scrollLeft", r.left - rr.left - 40);
      else if (r.right > rr.right - 30) scrollTo(row, "scrollLeft", r.right - rr.right + 40);
    }
    var box = el.parentElement;
    while (box && box !== document.body) {
      var style = getComputedStyle(box);
      if (/(auto|scroll)/.test(style.overflowY) && box.scrollHeight > box.clientHeight) break;
      box = box.parentElement;
    }
    if (!box || box === document.body) return;
    var er = el.getBoundingClientRect(), br = box.getBoundingClientRect();
    var margin = Math.min(br.height * 0.25, 160);
    if (er.top < br.top + margin) scrollTo(box, "scrollTop", er.top - br.top - margin);
    else if (er.bottom > br.bottom - margin) scrollTo(box, "scrollTop", er.bottom - br.bottom + margin);
  }

  function move(dir) {
    var cur = document.activeElement;
    var all = focusables();
    if (!cur || all.indexOf(cur) === -1) { focus(defaultFocus()); return; }

    var fromNav = !!cur.closest(".nav");
    // Passage du menu vers le contenu : revenir là où on était.
    if (fromNav && dir === "right") {
      var back = lastContentFocus && document.contains(lastContentFocus) && lastContentFocus.offsetParent !== null
        ? lastContentFocus : defaultFocus(true);
      if (back) focus(back);
      return;
    }

    var c = cur.getBoundingClientRect();
    var cx = c.left + c.width / 2, cy = c.top + c.height / 2;
    var best = null, bestScore = Infinity;
    all.forEach(function (el) {
      if (el === cur) return;
      if (fromNav !== !!el.closest(".nav") && !(dir === "left" && !fromNav)) return;
      var r = el.getBoundingClientRect();
      var ex = r.left + r.width / 2, ey = r.top + r.height / 2;
      var primary, secondary;
      if (dir === "right") { if (r.left < c.right - 4 && ex <= cx + 4) return; primary = Math.max(0, r.left - c.right); secondary = gap(r.top, r.bottom, c.top, c.bottom); }
      else if (dir === "left") { if (r.right > c.left + 4 && ex >= cx - 4) return; primary = Math.max(0, c.left - r.right); secondary = gap(r.top, r.bottom, c.top, c.bottom); }
      else if (dir === "down") { if (r.top < c.bottom - 4 && ey <= cy + 4) return; primary = Math.max(0, r.top - c.bottom); secondary = gap(r.left, r.right, c.left, c.right); }
      else { if (r.bottom > c.top + 4 && ey >= cy - 4) return; primary = Math.max(0, c.top - r.bottom); secondary = gap(r.left, r.right, c.left, c.right); }
      var score = primary + secondary * 3;
      if (score < bestScore) { bestScore = score; best = el; }
    });

    if (best && best.closest(".nav") && !fromNav) {
      best = document.querySelector(".nav .current") || best;
    }
    if (best) { focus(best); Sound.tick(); }
  }

  function gap(a1, a2, b1, b2) {
    if (a2 < b1) return b1 - a2;
    if (b2 < a1) return a1 - b2;
    return 0;
  }

  function defaultFocus(contentOnly) {
    var preferred = app.querySelector("[data-autofocus]");
    if (preferred && preferred.offsetParent !== null) return preferred;
    var list = focusables().filter(function (el) { return !el.closest(".nav"); });
    if (list.length) return list[0];
    return contentOnly ? null : document.querySelector(".nav .current");
  }

  // Au doigt, un bouton touché ne doit pas rester surligné.
  document.addEventListener("click", function () {
    if (IS_TV) return;
    var a = document.activeElement;
    if (a && a.tagName !== "INPUT" && a.blur) setTimeout(function () { a.blur(); }, 0);
  });

  document.addEventListener("keydown", function (e) {
    var key = e.key;
    var target = document.activeElement;
    var typing = target && target.tagName === "INPUT";

    if (webPlayer && (key === "Escape" || key === "Backspace" || key === "GoBack")) {
      webPlayer.remove(); webPlayer = null; Sound.playing(false); e.preventDefault(); return;
    }
    if (key === "ArrowUp" || key === "ArrowDown" || key === "ArrowLeft" || key === "ArrowRight") {
      var horizontal = key === "ArrowLeft" || key === "ArrowRight";
      if (horizontal && typing && target.value && !(key === "ArrowLeft" ? target.selectionStart === 0 : target.selectionEnd === target.value.length)) return;
      e.preventDefault();
      // Flèche maintenue : on avance à un rythme régulier, sans animation, pour que l'affichage suive.
      var now = Date.now();
      if (e.repeat && now - lastMoveAt < 85) return;
      lastMoveAt = now;
      fastScroll = e.repeat;
      move({ ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" }[key]);
      fastScroll = false;
      return;
    }
    if (key === "Enter" && target && target.classList.contains("f") && !typing) {
      e.preventDefault(); target.click(); return;
    }
    if (key === "Enter" && typing) {
      var submit = target.getAttribute("data-enter");
      if (submit && enterHooks[submit]) { e.preventDefault(); enterHooks[submit](); }
      else move("down");
      return;
    }
    if ((key === "Escape" || key === "GoBack" || (key === "Backspace" && !typing))) {
      e.preventDefault();
      NS.back();
    }
  });

  var enterHooks = {};
  var lastMoveAt = 0;

  // Clic sonore sur chaque bouton validé (la transition le remplace si l'écran change).
  document.addEventListener("click", function (e) {
    if (e.target && e.target.closest && e.target.closest("button")) Sound.click();
  }, true);

  // ---------------------------------------------------------------- Écrans

  function go(name, params) {
    if (S.stack.length) keep(S.stack[S.stack.length - 1]);
    S.stack.push({ name: name, params: params || {} });
    render();
  }

  // L'écran quitté est gardé tel quel (position, sélection) : le retour est instantané, sans tout reconstruire.
  var currentScreen = null;

  function keep(entry) {
    entry.focus = focusPath(document.activeElement);
    if (!currentScreen || entry.name === "login") return;
    var main = currentScreen.parentNode;
    entry.el = currentScreen;
    entry.version = S.version;
    entry.focusEl = document.activeElement;
    entry.scrolls = [[null, main ? main.scrollTop : 0, 0]];
    Array.prototype.forEach.call(currentScreen.querySelectorAll(".col, .catalog-body, .row, .seasons"), function (b) {
      if (b.scrollTop || b.scrollLeft) entry.scrolls.push([b, b.scrollTop, b.scrollLeft]);
    });
  }

  function setRoot(name) {
    S.root = name;
    S.stack = [{ name: name, params: {} }];
    lastContentFocus = null;
    render(true);
  }

  // Mémorise l'élément sélectionné pour le retrouver au retour.
  function focusPath(el) {
    return el && el.getAttribute ? el.getAttribute("data-key") : null;
  }

  function render(keepNavFocus) {
    var top = S.stack[S.stack.length - 1];
    var screen = SCREENS[top.name];
    var wasNav = document.activeElement && document.activeElement.closest && document.activeElement.closest(".nav");
    var first = !app.firstChild || app.firstChild.classList.contains("loader");
    if (!first) Sound.transition();
    app.innerHTML = "";
    if (top.name === "login") {
      currentScreen = null;
      app.appendChild(screen(top.params));
    } else {
      var main = h("main", { class: "main" });
      app.appendChild(h("div", { class: "shell" }, navBar(), main));
      if (!IS_TV && S.stack.length > 1) {
        main.appendChild(h("button", { class: "back-btn", "aria-label": "Retour", onclick: function () { NS.back(); } }, "‹"));
      }
      var cached = top.el && top.version === S.version ? top.el : null;
      top.el = null;
      currentScreen = cached || screen(top.params);
      if (!first) currentScreen.classList.add("enter");
      main.appendChild(currentScreen);
      if (cached) {
        top.scrolls.forEach(function (sc) {
          if (!sc[0]) main.scrollTop = sc[1];
          else { sc[0].scrollTop = sc[1]; sc[0].scrollLeft = sc[2]; }
        });
        DL.repaint(cached);
      }
    }
    restoreFocus(top, keepNavFocus && wasNav, cached);
  }

  function restoreFocus(top, toNav, cached) {
    wantsContentFocus = false;
    if (toNav) { focus(document.querySelector(".nav .current"), false); return; }
    var kept = top.focusEl;
    top.focusEl = null;
    if (cached && kept && kept.isConnected && kept.offsetParent !== null) { focus(kept, false); return; }
    if (top.focus) {
      var el = app.querySelector('[data-key="' + cssEscape(top.focus) + '"]');
      if (el) { focus(el); return; }
    }
    var target = defaultFocus(true);
    if (target) { focus(target, true); return; }
    // Rien à sélectionner tant que le contenu charge : on patiente sur le menu.
    wantsContentFocus = true;
    focus(document.querySelector(".nav .current") || document.querySelector(".f"), false);
  }

  function cssEscape(s) {
    return String(s).replace(/["\\]/g, "\\$&");
  }

  // Remplace le contenu d'un conteneur après un chargement, en gardant la sélection si possible.
  function fill(container, promise, build) {
    container.innerHTML = "";
    container.appendChild(h("div", { class: "loader" }));
    var token = {};
    container.__token = token;
    promise.then(function (data) {
      if (container.__token !== token) return;
      container.innerHTML = "";
      append(container, build(data));
      if (!container.isConnected) return;  // écran mis de côté : il sera prêt au retour
      var top = S.stack[S.stack.length - 1];
      var active = document.activeElement;
      if (wantsContentFocus || !active || active === document.body || !document.contains(active)) restoreFocus(top);
    }, function (err) {
      if (container.__token !== token) return;
      container.innerHTML = "";
      var retry = h("button", { class: "btn f", "data-autofocus": true, text: "Réessayer",
        onclick: function () { render(); } });
      container.appendChild(h("div", { class: "page" }, h("p", { class: "error", text: err.message }), h("br"), retry));
      focus(retry);
    });
  }

  var NAV = [
    ["home", "Accueil", "home"], ["live", "En direct", "live", "Direct"], ["movies", "Films", "movies"],
    ["series", "Séries", "series"], ["favorites", "Ma liste", "heart", "Ma liste"],
    ["downloads", "Téléchargés", "download", "Téléch."], ["search", "Rechercher", "search", "Chercher"]
  ].filter(function (n) { return n[0] !== "downloads" || DL.available; });

  function navBar() {
    var items = NAV.map(function (n) {
      return h("button", { class: "nav-item f" + (S.root === n[0] ? " current" : ""), "data-key": "nav-" + n[0],
        onclick: function () { setRoot(n[0]); } }, icon(n[2]), h("span", { class: "label" }, n[1]), h("span", { class: "short" }, n[3] || n[1]));
    });
    var u = S.user || {};
    return h("nav", { class: "nav" },
      h("div", { class: "logo display" }, h("img", { src: "mark.png", alt: "" }), "NovaStream"),
      items,
      h("div", { class: "nav-spacer" }),
      h("div", { class: "account" },
        h("b", null, h("span", { class: "dot" }), u.username || ""),
        h("div", { class: "muted", text: S.demo ? "Mode démo" : "Expire le " + (u.expires || "") })),
      h("button", { class: "nav-item f" + (S.root === "settings" ? " current" : ""), "data-key": "nav-settings",
        onclick: function () { setRoot("settings"); } }, icon("settings"), h("span", { class: "label" }, "Paramètres"), h("span", { class: "short" }, "Réglages")));
  }

  function posterCard(item, key) {
    var art = h("div", { class: "art", style: "background:" + gradient(item.name) },
      h("div", { class: "ph" }, h("span", { text: item.name })),
      item.rating ? h("div", { class: "rating", html: "<i>★</i> " + (Math.round(item.rating * 10) / 10) }) : null,
      img(item.image));
    return h("button", { class: "poster f", "data-key": key || item.kind + "-" + item.id,
      onclick: function () { openItem(item); } }, art, h("div", { class: "name", text: item.name }));
  }

  function channelLogo(item) {
    return h("div", { class: "logo-box", style: "background:" + gradient(item.name) }, initials(item.name), img(item.image));
  }

  function quality(name) {
    var n = name.toUpperCase();
    if (/4K|UHD/.test(n)) return "4K";
    if (/FHD|1080/.test(n)) return "FHD";
    if (/(^|\s)HD\b|720/.test(n)) return "HD";
    return null;
  }

  function channelRow(channels, index) {
    var ch = channels[index];
    var q = quality(ch.name);
    var fav = h("button", { class: "fav-btn f", "data-key": "chfav-" + ch.id, title: "Ma liste" });
    function paint() {
      fav.textContent = isFavorite(ch) ? "♥" : "♡";
      fav.classList.toggle("on", isFavorite(ch));
    }
    fav.addEventListener("click", function () { toggleFavorite(ch); paint(); });
    paint();
    return h("div", { class: "channel-wrap" },
      h("button", { class: "channel f", "data-key": "ch-" + ch.id, onclick: function () { playLive(channels, index); } },
        channelLogo(ch), h("span", { class: "name", text: ch.name }), q ? h("span", { class: "badge", text: q }) : null),
      fav);
  }

  function openItem(item) {
    if (item.kind === "live") {
      playLive([item], 0);
    } else {
      go(item.kind === "series" ? "seriesDetail" : "movieDetail", { item: item });
    }
  }

  function recent(items, n) {
    return items.slice().sort(function (a, b) { return b.added - a.added; }).slice(0, n);
  }

  // Texte de recherche sans accents, majuscules ni ponctuation : « Spider-Man » = « spiderman » = « spider man ».
  function normalize(text) {
    var t = str(text).toLowerCase();
    if (t.normalize) t = t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return t.replace(/[^a-z0-9]+/g, " ").trim();
  }

  function searchIn(items, q) {
    var words = q.split(" "), joined = q.replace(/ /g, "");
    var found = [];
    items.forEach(function (it) {
      var n = it._n || (it._n = normalize(it.name));
      var score = -1;
      if (n === q) score = 0;
      else if (n.indexOf(q) === 0) score = 1;
      else if (n.indexOf(q) !== -1) score = 2;
      else if (words.every(function (w) { return n.indexOf(w) !== -1; })) score = 3;
      else if (joined.length > 3 && n.replace(/ /g, "").indexOf(joined) !== -1) score = 4;
      if (score >= 0) found.push([score, it]);
    });
    found.sort(function (a, b) { return a[0] - b[0]; });
    return found.map(function (f) { return f[1]; });
  }

  function section(title, children, more) {
    return h("section", { class: "section" },
      h("div", { class: "section-head" }, h("h2", { text: title }), more ? h("span", { class: "muted", text: more }) : null),
      h("div", { class: "row" }, children));
  }

  var SCREENS = {
    login: function () {
      var saved = store.get("lastServer", {});
      var server = h("input", { class: "input f", id: "server", type: "url", placeholder: "http://exemple.com:8080",
        value: saved.server || "", autocomplete: "off", autocapitalize: "off", spellcheck: "false" });
      var user = h("input", { class: "input f", id: "user", placeholder: "Nom d'utilisateur", value: saved.username || "",
        autocomplete: "off", autocapitalize: "off", spellcheck: "false" });
      var pass = h("input", { class: "input f", id: "pass", type: "password", placeholder: "Mot de passe", "data-enter": "login" });
      var error = h("p", { class: "error hidden" });
      var submit = h("button", { class: "btn f", text: "Se connecter" });

      function doLogin() {
        var creds = { server: normalizeServer(server.value), username: str(user.value), password: str(pass.value) };
        if (!str(server.value) || !creds.username || !creds.password) {
          error.textContent = "Renseignez l'URL du serveur, l'utilisateur et le mot de passe.";
          error.classList.remove("hidden");
          return;
        }
        submit.textContent = "Connexion…";
        submit.disabled = true;
        Xtream.login(creds).then(function (info) {
          store.set("creds", creds);
          store.set("lastServer", { server: creds.server, username: creds.username });
          startSession(info, false);
        }, function (err) {
          submit.textContent = "Se connecter";
          submit.disabled = false;
          error.textContent = err.message;
          error.classList.remove("hidden");
          focus(submit);
        });
      }
      submit.addEventListener("click", doLogin);
      enterHooks.login = doLogin;

      return h("div", { class: "login" }, h("div", { class: "login-card" },
        h("div", { class: "logo display" }, h("img", { src: "mark.png", alt: "" }), "NovaStream"),
        h("div", { class: "eyebrow", text: "Connexion" }),
        h("h1", { class: "display", text: "Votre abonnement IPTV" }),
        h("p", { class: "muted", text: "Entrez les identifiants Xtream Codes fournis par votre fournisseur." }),
        h("div", { class: "field" }, h("label", { for: "server", text: "URL du serveur" }), server),
        h("div", { class: "field" }, h("label", { for: "user", text: "Utilisateur" }), user),
        h("div", { class: "field" }, h("label", { for: "pass", text: "Mot de passe" }), pass),
        error,
        h("div", { class: "actions" }, submit,
          h("button", { class: "btn secondary f", text: "Essayer le mode démo",
            onclick: function () { startSession(Demo.user, true); } }))));
    },

    home: function () {
      var page = h("div");
      var hero = h("div", { class: "hero" }, h("div", null,
        h("div", { class: "eyebrow", text: "NovaStream" }),
        h("h1", { class: "display", text: "Votre prochaine histoire commence ici." }),
        h("p", { text: "Le direct, les films et les séries de votre abonnement, réunis dans une seule expérience." }),
        h("div", { class: "actions" },
          h("button", { class: "btn f", "data-key": "hero-movies", "data-autofocus": true, onclick: function () { setRoot("movies"); } },
            icon("play"), "Explorer les films"),
          h("button", { class: "btn secondary f", "data-key": "hero-live", onclick: function () { setRoot("live"); } },
            icon("live"), "Voir le direct"))));
      var rows = h("div");
      page.appendChild(hero);
      page.appendChild(rows);

      if (S.favorites.length) {
        rows.appendChild(section("Ma liste", S.favorites.slice(0, 20).map(function (f) {
          return f.kind === "live" ? channelTile(S.favorites.filter(isLive), S.favorites.filter(isLive).indexOf(f), "fav-") : posterCard(f, "fav-" + f.kind + "-" + f.id);
        })));
      }
      var liveBox = h("div"), moviesBox = h("div"), seriesBox = h("div");
      append(rows, [liveBox, moviesBox, seriesBox]);
      var liveLoaded = catalog("live");
      var moviesLoaded = liveLoaded.catch(function () {}).then(function () { return catalog("movies"); });
      var seriesLoaded = moviesLoaded.catch(function () {}).then(function () { return catalog("series"); });
      liveLoaded.then(function (c) {
        if (!c.items.length) return;
        var list = c.items.slice(0, 20);
        liveBox.appendChild(section("En direct", list.map(function (ch, i) { return channelTile(list, i, "home-"); }),
          c.items.length + " chaînes"));
      }, function () {});
      moviesLoaded.then(function (c) {
        if (!c.items.length) return;
        moviesBox.appendChild(section("Nouveaux films", recent(c.items, 20).map(function (m) { return posterCard(m, "home-" + m.id); })));
      }, function (err) { moviesBox.appendChild(h("p", { class: "page error", text: err.message })); });
      seriesLoaded.then(function (c) {
        if (!c.items.length) return;
        seriesBox.appendChild(section("Séries à découvrir", recent(c.items, 20).map(function (s) { return posterCard(s, "home-s" + s.id); })));
      }, function () {});
      return page;
    },

    live: function (params) {
      var page = h("div", { class: "page" }, h("h1", { class: "page-title display", text: "En direct" }));
      var body = h("div");
      page.appendChild(body);
      fill(body, catalog("live"), function (c) {
        var current = params.cat || "all";
        var channelsCol = h("div", { class: "col list" });
        var cats = [{ id: "all", name: "Toutes les chaînes" }].concat(c.cats);

        function showChannels(catId) {
          current = catId;
          params.cat = catId;
          var list = catId === "all" ? c.items : c.items.filter(function (i) { return i.cat === catId; });
          channelsCol.innerHTML = "";
          channelsCol.appendChild(h("div", { class: "col-head" }, h("span", { text: "CHAÎNES" }), h("span", { text: String(list.length) })));
          lazyList(channelsCol, list, function (ch, i) { return channelRow(list, i); }, 60,
            function (ch) { return "ch-" + ch.id; });
          Array.prototype.forEach.call(catCol.querySelectorAll(".cat"), function (b) {
            b.classList.toggle("current", b.getAttribute("data-cat") === catId);
          });
        }

        var catCol = h("div", { class: "col cats" }, h("div", { class: "col-head", text: "CATÉGORIES" }),
          cats.map(function (cat) {
            return h("button", { class: "cat f" + (cat.id === current ? " current" : ""), "data-cat": cat.id, "data-key": "cat-" + cat.id,
              onclick: function () { showChannels(cat.id); var first = channelsCol.querySelector(".f"); if (first) focus(first); } },
              cat.name);
          }));
        showChannels(current);
        return h("div", { class: "columns" }, catCol, channelsCol);
      });
      return page;
    },

    movies: function (params) { return catalogScreen("movies", "Films", params); },
    series: function (params) { return catalogScreen("series", "Séries", params); },

    movieDetail: function (params) {
      var item = params.item;
      var page = h("div", { class: "detail" });
      var info = S.demo ? Promise.resolve({ info: { plot: "Un film de démonstration pour essayer le lecteur de NovaStream sur votre TV.",
        genre: "Science-fiction", duration: "01:52:00", director: "Réalisation Fictive", cast: "Distribution Fictive" } })
        : Xtream.api("get_vod_info", { vod_id: item.id });
      fill(page, info.catch(function () { return {}; }), function (data) {
        var i = (data && data.info) || {};
        var md = (data && data.movie_data) || {};
        if (str(md.container_extension)) item = Object.assign({}, item, { ext: str(md.container_extension) });
        return detailTop(item, {
          backdrop: firstString(i.backdrop_path), poster: str(i.movie_image || i.cover_big) || item.image,
          genre: str(i.genre), year: str(i.releasedate || i.release_date).slice(0, 4) || item.year,
          rating: rating(i) || item.rating, duration: minutes(i.duration), plot: str(i.plot || i.description),
          director: str(i.director), cast: str(i.cast || i.actors)
        }, [
          h("button", { class: "btn f", "data-autofocus": true, "data-key": "play", onclick: function () { playMovie(item); } }, icon("play"), "Lecture"),
          favoriteButton(item),
          downloadButton(function () { return movieDownload(item); })
        ]);
      });
      return page;
    },

    seriesDetail: function (params) {
      var item = params.item;
      var page = h("div", { class: "detail" });
      var info = S.demo ? Promise.resolve(Demo.seriesInfo(item)) : Xtream.api("get_series_info", { series_id: item.id }).then(function (d) {
        var i = (d && d.info) || {};
        return { plot: str(i.plot), genre: str(i.genre), year: str(i.releaseDate || i.release_date).slice(0, 4),
          rating: rating(i), director: str(i.director), cast: str(i.cast), backdrop: firstString(i.backdrop_path),
          cover: str(i.cover), seasons: episodesBySeason(d && d.episodes) };
      });
      fill(page, info, function (d) {
        var seasonNums = Object.keys(d.seasons).map(Number).sort(function (a, b) { return a - b; });
        var season = params.season || seasonNums[0];
        var list = h("div");

        function showSeason(s) {
          season = s;
          params.season = s;
          var eps = d.seasons[s] || [];
          list.innerHTML = "";
          if (!eps.length) list.appendChild(h("p", { class: "empty", text: "Aucun épisode disponible." }));
          if (eps.length && DL.available) {
            list.appendChild(h("button", { class: "chip f season-dl", "data-key": "season-dl-" + s, onclick: function () {
              var now = Date.now();
              var added = eps.filter(function (e, i) {
                var entry = episodeDownload(item, s, e);
                entry.added = now;
                entry.order = i;
                return DL.add(entry);
              }).length;
              toast(added ? added + " épisode" + (added > 1 ? "s" : "") + " ajouté" + (added > 1 ? "s" : "") + " aux téléchargements"
                : "Cette saison est déjà téléchargée ou en cours.");
              DL.repaint(list);
            } }, icon("download"), "Télécharger la saison " + s));
          }
          eps.forEach(function (e, idx) {
            var ep = h("button", { class: "episode f", "data-key": "ep-" + e.id,
              onclick: function () { playEpisodes(item, s, eps, idx); } },
              h("div", { class: "thumb" }, String(e.num), img(e.image)),
              h("div", null,
                h("h3", { text: e.num + ". " + (e.title || "Épisode " + e.num) }),
                minutes(e.duration) ? h("div", { class: "muted", text: minutes(e.duration) }) : null,
                e.plot ? h("p", { text: e.plot }) : null));
            list.appendChild(DL.available ? h("div", { class: "episode-wrap" }, ep, episodeDownloadButton(episodeDownload(item, s, e))) : ep);
          });
          Array.prototype.forEach.call(seasonsRow.children, function (b) {
            b.classList.toggle("current", Number(b.getAttribute("data-season")) === s);
          });
        }

        var seasonsRow = h("div", { class: "seasons" }, seasonNums.map(function (s) {
          return h("button", { class: "chip f", "data-season": s, "data-key": "season-" + s,
            onclick: function () { showSeason(s); } }, "Saison " + s + " · " + d.seasons[s].length);
        }));
        var first = seasonNums.length ? d.seasons[seasonNums[0]][0] : null;
        var top = detailTop(item, {
          backdrop: d.backdrop, poster: d.cover || item.image, genre: d.genre || item.genre, year: d.year || item.year,
          rating: d.rating || item.rating, plot: d.plot || item.plot, director: d.director, cast: d.cast
        }, [
          first ? h("button", { class: "btn f", "data-autofocus": true, "data-key": "play",
            onclick: function () { playEpisodes(item, seasonNums[0], d.seasons[seasonNums[0]], 0); } },
            icon("play"), "Lire S" + seasonNums[0] + " É" + first.num) : null,
          favoriteButton(item)
        ]);
        if (season) showSeason(season);
        return [top, h("div", { class: "episodes" }, h("h2", { text: "Épisodes" }), seasonNums.length > 1 ? seasonsRow : null, list)];
      });
      return page;
    },

    downloads: function () {
      var page = h("div", { class: "page" }, h("h1", { class: "page-title display", text: "Téléchargements" }));
      if (!DL.available) {
        page.appendChild(h("p", { class: "empty", text: "Les téléchargements sont disponibles dans l'appli Android (TV ou téléphone)." }));
        return page;
      }
      DL.refresh();
      var free = window.Android.freeSpace ? window.Android.freeSpace() : 0;
      page.appendChild(h("p", { class: "muted dl-intro", text: "Regardez vos films et épisodes sans connexion. Un téléchargement à la fois, il continue même appli fermée." +
        (free > 0 ? "  Espace libre : " + bytes(free) + "." : "") }));
      var listBox = h("div", { class: "dl-list" });
      page.appendChild(listBox);

      function empty() {
        if (!listBox.querySelector(".dl-row")) {
          listBox.innerHTML = "";
          listBox.appendChild(h("p", { class: "empty", text: "Aucun téléchargement. Ouvrez un film ou une série et choisissez « Télécharger »." }));
        }
      }

      DL.sorted().forEach(function (d) {
        var status = h("div", { class: "dl-status" });
        var bar = h("i");
        var item = h("button", { class: "dl-item f", "data-key": "dl-" + d.key, onclick: function () {
          var st = DL.state(d);
          if (st.status === "done" && st.file) {
            play({ live: false, kind: d.kind === "episode" ? "series" : "movie", index: 0, titles: [d.title],
              subtitle: d.subtitle || "", urls: [st.file] });
          } else if (st.status === "failed" || st.status === "missing") {
            var entry = { key: d.key, kind: d.kind, title: d.title, subtitle: d.subtitle, image: d.image, url: d.url, ext: d.ext };
            DL.add(entry);
            d = DL.find(entry.key);
            toast("Nouvel essai : " + d.title);
            item.__paint();
          } else {
            toast(d.title + " : " + dlLabel(d));
          }
        } },
          h("div", { class: "dl-thumb", style: "background:" + gradient(d.title) }, h("span", { text: initials(d.title) }), img(d.image)),
          h("div", { class: "dl-info" },
            h("h3", { text: d.title }),
            d.subtitle ? h("div", { class: "muted", text: d.subtitle }) : null,
            status,
            h("div", { class: "dl-bar" }, bar)));
        var del = h("button", { class: "fav-btn dl-del f", "data-key": "dldel-" + d.key, title: "Supprimer" }, icon("trash"));
        var row = h("div", { class: "dl-row" }, item, del);
        del.addEventListener("click", function () {
          // Deux appuis pour supprimer, pour éviter les fausses manœuvres à la télécommande.
          if (!del.classList.contains("confirm")) {
            del.classList.add("confirm");
            toast("Appuyez encore pour supprimer « " + d.title + " »");
            setTimeout(function () { del.classList.remove("confirm"); }, 3000);
            return;
          }
          var next = row.nextElementSibling || row.previousElementSibling;
          DL.forget(d);
          DL.pump();
          row.remove();
          toast("Supprimé : " + d.title);
          empty();
          var target = next && next.querySelector(".dl-item");
          focus(target || document.querySelector(".nav .current"));
        });
        DL.watch(item, function () {
          var st = DL.state(d);
          status.textContent = dlLabel(d);
          status.className = "dl-status " + st.status;
          bar.style.width = Math.round(dlProgress(d) * 100) + "%";
          row.classList.toggle("done", st.status === "done");
        });
        listBox.appendChild(row);
      });
      empty();
      return page;
    },

    favorites: function () {
      var page = h("div", { class: "page" }, h("h1", { class: "page-title display", text: "Ma liste" }));
      var channels = S.favorites.filter(isLive);
      var titles = S.favorites.filter(function (f) { return !isLive(f); });
      if (!S.favorites.length) {
        page.appendChild(h("p", { class: "empty", text: "Votre liste est vide. Ajoutez des films et des séries avec « Ma liste », ou des chaînes depuis le lecteur." }));
      }
      if (channels.length) {
        page.appendChild(h("h2", { text: "Chaînes", style: "margin:1rem 0 1.4rem" }));
        page.appendChild(h("div", { class: "grid" }, channels.map(function (c, i) { return channelTile(channels, i, "favp-"); })));
      }
      if (titles.length) {
        page.appendChild(h("h2", { text: "Films et séries", style: "margin:3rem 0 1.4rem" }));
        page.appendChild(h("div", { class: "grid" }, titles.map(function (t) { return posterCard(t); })));
      }
      return page;
    },

    search: function (params) {
      var input = h("input", { class: "input f", placeholder: "Une chaîne, un film, une série…", value: params.q || "",
        "data-autofocus": true, "data-key": "search-input", autocomplete: "off", "data-enter": "search" });
      var goBtn = h("button", { class: "btn f search-go", "data-key": "search-go", onclick: function () { submit(); } },
        icon("search"), "Rechercher");
      var summary = h("div", { class: "search-summary" });
      var results = h("div");
      var timer = null, lastQuery = null, jump = false;

      // Validation : on lance la recherche et on descend sur le premier résultat dès qu'il arrive.
      function submit() {
        clearTimeout(timer);
        jump = true;
        lastQuery = null;
        run();
      }

      function badge(label, count, loading) {
        var text = loading ? "recherche…" : count ? count + (count > 1 ? " trouvés" : " trouvé") : "introuvable";
        return h("span", { class: "found " + (loading ? "wait" : count ? "yes" : "no") }, h("b", { text: label + " : " }), text);
      }

      function run() {
        var q = normalize(input.value);
        params.q = input.value;
        if (q === lastQuery) return;
        lastQuery = q;
        results.innerHTML = "";
        summary.innerHTML = "";
        if (q.length < 2) {
          jump = false;
          results.appendChild(h("p", { class: "empty", text: "Tapez au moins deux lettres, puis validez." }));
          return;
        }
        append(summary, [badge("TV", 0, true), badge("Films", 0, true), badge("Séries", 0, true)]);
        results.appendChild(h("div", { class: "loader" }));
        Promise.all(["live", "movies", "series"].map(function (sec) {
          return catalog(sec).catch(function () { return { items: [], failed: true }; });
        })).then(function (all) {
          if (lastQuery !== q) return;
          var ch = searchIn(all[0].items, q), mv = searchIn(all[1].items, q), se = searchIn(all[2].items, q);
          summary.innerHTML = "";
          append(summary, [badge("TV", ch.length), badge("Films", mv.length), badge("Séries", se.length)]);
          results.innerHTML = "";
          function block(title, list, build, failed) {
            var head = h("h2", { class: "search-head" }, title + " ",
              h("span", { class: "muted", text: failed ? "· catalogue indisponible" : list.length ? "· " + list.length : "· introuvable" }));
            results.appendChild(head);
            if (list.length) results.appendChild(h("div", { class: "grid" }, list.slice(0, 60).map(build)));
          }
          block("Chaînes TV", ch, function (c, i) { return channelTile(ch, i, "sr-"); }, all[0].failed);
          block("Films", mv, function (m) { return posterCard(m); }, all[1].failed);
          block("Séries", se, function (x) { return posterCard(x); }, all[2].failed);
          var firstResult = results.querySelector(".f");
          if (jump && firstResult && results.isConnected) focus(firstResult);
          jump = false;
        });
      }

      input.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(run, 400); });
      // Clavier de la TV fermé ou validé : on lance la recherche tout de suite.
      input.addEventListener("change", function () { clearTimeout(timer); run(); });
      enterHooks.search = submit;
      run();
      return h("div", { class: "page" }, h("h1", { class: "page-title display", text: "Rechercher" }),
        h("div", { class: "search-bar" }, input, goBtn), summary, results);
    },

    settings: function () {
      var u = S.user || {};
      var formatBtn = h("button", { class: "setting f", "data-key": "set-format", onclick: function () {
        S.liveFormat = S.liveFormat === "ts" ? "m3u8" : "ts";
        store.set("liveFormat", S.liveFormat);
        formatBtn.lastChild.textContent = formatLabel();
      } }, h("span", { text: "Format du flux des chaînes" }), h("span", { text: formatLabel() }));

      function row(label, value) {
        return h("div", { class: "setting" }, h("span", { text: label }), h("span", { text: value }));
      }

      // Réglage à choix : chaque appui passe à la valeur suivante.
      function choice(label, key, options, fallback) {
        var btn = h("button", { class: "setting f", "data-key": "set-" + key }, h("span", { text: label }), h("span"));
        function paint() {
          var v = store.get(key, fallback);
          var o = options.find(function (x) { return x[0] === v; }) || options[0];
          btn.lastChild.textContent = o[1] + "  ›";
        }
        btn.addEventListener("click", function () {
          var v = store.get(key, fallback);
          var i = options.findIndex(function (x) { return x[0] === v; });
          store.set(key, options[(i + 1) % options.length][0]);
          paint();
        });
        paint();
        return btn;
      }

      function toggle(label, key, onChange) {
        var btn = h("button", { class: "setting f", "data-key": "set-" + key }, h("span", { text: label }), h("span"));
        function paint() { btn.lastChild.textContent = store.get(key, true) ? "Activé" : "Désactivé"; }
        btn.addEventListener("click", function () { store.set(key, !store.get(key, true)); paint(); if (onChange) onChange(); });
        paint();
        return btn;
      }

      return h("div", { class: "page" }, h("h1", { class: "page-title display", text: "Paramètres" }),
        h("div", { class: "settings" },
          row("Utilisateur", u.username || ""),
          row("Statut", str(u.status).toLowerCase() === "active" ? "Abonnement actif" : u.status || ""),
          row("Expire le", u.expires || ""),
          row("Connexions", u.connections || ""),
          row("Serveur", S.demo ? "Mode démo" : Xtream.creds.server),
          h("h2", { class: "settings-head", text: "Lecture" }),
          choice("Langue audio préférée", "audioLang", LANGS, ""),
          choice("Sous-titres", "subLang", SUBS, "off"),
          choice("Format de l'image : films", "resize.movie", RESIZE, "fit"),
          choice("Format de l'image : séries", "resize.series", RESIZE, "fit"),
          choice("Format de l'image : chaînes", "resize.live", RESIZE, "fit"),
          formatBtn,
          h("p", { class: "muted settings-note", text: "Pendant une vidéo, le bouton « Langue · Sous-titres · Format » (en haut à droite, ou la touche Menu) change ces réglages pour la vidéo en cours." }),
          h("h2", { class: "settings-head", text: "Sons" }),
          toggle("Musique d'ambiance", "music", Sound.update),
          toggle("Sons de l'interface", "sfx"),
          h("button", { class: "setting f", "data-key": "set-reload", "data-autofocus": true, onclick: function () {
            S.catalogs = {};
            toast("Catalogue rechargé");
            setRoot("home");
          } }, h("span", { text: "Recharger le catalogue" }), h("span", { text: "›" })),
          h("button", { class: "setting f", "data-key": "set-logout", onclick: logout },
            h("span", { text: "Se déconnecter", style: "color:#fca5a5" }), h("span", { text: "›" })),
          row("Version", (window.Android && window.Android.version && window.Android.version()) || "web")));
    }
  };

  function formatLabel() {
    return S.liveFormat === "ts" ? "MPEG-TS (.ts) recommandé" : "HLS (.m3u8)";
  }

  function isLive(i) { return i.kind === "live"; }

  function channelTile(channels, index, prefix) {
    var ch = channels[index];
    return h("button", { class: "tile f", "data-key": (prefix || "") + "tile-" + ch.id,
      onclick: function () { playLive(channels, index); } },
      channelLogo(ch), h("div", { class: "name", text: ch.name }));
  }

  function favoriteButton(item) {
    var btn = h("button", { class: "btn secondary f", "data-key": "fav" });
    function paint() {
      btn.innerHTML = "";
      append(btn, [icon(isFavorite(item) ? "check" : "plus"), "Ma liste"]);
    }
    btn.addEventListener("click", function () { toggleFavorite(item); paint(); });
    paint();
    return btn;
  }

  function detailTop(item, d, actions) {
    var meta = [];
    if (d.rating) meta.push("<i>★</i> " + (Math.round(d.rating * 10) / 10));
    if (d.year) meta.push(escapeHtml(d.year));
    if (d.genre) meta.push(escapeHtml(d.genre));
    if (d.duration) meta.push(escapeHtml(d.duration));
    var backdrop = d.backdrop || d.poster;
    return h("div", null,
      h("div", { class: "backdrop", style: backdrop && /^https?:/.test(backdrop) ? "background-image:url(\"" + backdrop.replace(/"/g, "%22") + "\")" : "background:" + gradient(item.name) }),
      h("div", { class: "top" },
        h("div", { class: "cover", style: "background:" + gradient(item.name) }, h("div", { class: "ph" }, h("span", { text: item.name })), img(d.poster)),
        h("div", { class: "info" },
          h("div", { class: "eyebrow", text: [item.kind === "series" ? "Série" : "Film", d.genre].filter(Boolean).join(" · ") }),
          h("h1", { class: "display", text: item.name }),
          meta.length ? h("div", { class: "meta", html: meta.join("  ·  ") }) : null,
          d.plot ? h("p", { class: "plot", text: d.plot }) : null,
          (d.director || d.cast) ? h("div", { class: "credits" },
            d.director ? h("div", { text: "Réalisation : " + d.director }) : null,
            d.cast ? h("div", { text: "Avec : " + d.cast }) : null) : null,
          h("div", { class: "actions" }, actions))));
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; });
  }

  // Affiche une longue liste par tranches, la suite arrivant quand on s'approche de la fin.
  function lazyList(container, items, build, chunk, keyOf) {
    chunk = chunk || 60;
    var shown = 0;
    // Au retour d'une fiche, on affiche assez d'éléments pour retrouver celui qui était sélectionné.
    var top = S.stack[S.stack.length - 1];
    var wanted = top && top.focus && keyOf ? items.findIndex(function (it) { return keyOf(it) === top.focus; }) : -1;
    var sentinel = h("div", { style: "height:1px;flex:none" });
    function more() {
      var end = Math.min(items.length, shown + chunk);
      var frag = document.createDocumentFragment();
      for (var i = shown; i < end; i++) frag.appendChild(build(items[i], i));
      container.insertBefore(frag, sentinel);
      shown = end;
      if (shown >= items.length) sentinel.remove();
    }
    container.appendChild(sentinel);
    more();
    while (shown <= wanted && shown < items.length) more();
    if (shown < items.length && "IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (entries) {
        if (entries.some(function (e) { return e.isIntersecting; })) {
          more();
          if (shown >= items.length) io.disconnect();
        }
      }, { root: null, rootMargin: "800px" });
      io.observe(sentinel);
    }
  }

  function catalogScreen(section, title, params) {
    var page = h("div", { class: "page" }, h("h1", { class: "page-title display", text: title }));
    var body = h("div");
    page.appendChild(body);
    fill(body, catalog(section), function (c) {
      var current = params.cat || "all";
      var grid = h("div", { class: "grid" });
      var head = h("div", { class: "col-head" });
      var right = h("div", { class: "catalog-body" }, head, grid);
      var cats = [{ id: "all", name: "Tout" }].concat(c.cats);

      function show(catId) {
        current = catId;
        params.cat = catId;
        var list = catId === "all" ? recent(c.items, c.items.length) : c.items.filter(function (i) { return i.cat === catId; });
        grid.innerHTML = "";
        head.innerHTML = "";
        append(head, [h("span", { text: (cats.find(function (x) { return x.id === catId; }) || {}).name.toUpperCase() }),
          h("span", { text: list.length + " titres" })]);
        lazyList(grid, list, function (item) { return posterCard(item); }, 48,
          function (item) { return item.kind + "-" + item.id; });
        right.scrollTop = 0;
        Array.prototype.forEach.call(catCol.querySelectorAll(".cat"), function (b) {
          b.classList.toggle("current", b.getAttribute("data-cat") === catId);
        });
      }

      var catCol = h("div", { class: "col cats" }, h("div", { class: "col-head", text: "CATÉGORIES" }),
        cats.map(function (cat) {
          return h("button", { class: "cat f" + (cat.id === current ? " current" : ""), "data-cat": cat.id, "data-key": "cat-" + cat.id,
            onclick: function () { show(cat.id); var first = grid.querySelector(".f"); if (first) focus(first); } }, cat.name);
        }));
      show(current);
      return h("div", { class: "columns" }, catCol, right);
    });
    return page;
  }

  // ---------------------------------------------------------------- Session

  function startSession(user, demo) {
    S.user = user;
    S.demo = demo;
    S.catalogs = {};
    if (demo) store.set("demo", true); else { store.remove("demo"); store.set("user", user); }
    setRoot("home");
  }

  function logout() {
    store.remove("creds");
    store.remove("demo");
    store.remove("user");
    S.user = null;
    S.catalogs = {};
    S.stack = [{ name: "login", params: {} }];
    render();
  }

  var NS = window.NS = {
    // Appelé par la touche Retour d'Android : renvoie true si l'appli a géré le retour.
    back: function () {
      if (webPlayer) { webPlayer.remove(); webPlayer = null; Sound.playing(false); return true; }
      var active = document.activeElement;
      if (S.stack.length > 1) {
        S.stack.pop();
        render();
        return true;
      }
      if (S.stack.length && S.stack[0].name !== "login" && S.stack[0].name !== "home") {
        setRoot("home");
        return true;
      }
      if (S.stack.length && S.stack[0].name === "home" && active && !active.closest(".nav")) {
        focus(document.querySelector(".nav .current"));
        return true;
      }
      return false;
    },
    focus: function () { var el = document.activeElement; if (!el || el === document.body) focus(defaultFocus()); },
    // Appelés par Android quand l'appli passe au second plan (lecteur ouvert…) puis revient.
    pause: function () { Sound.visible(false); },
    resume: function () { Sound.visible(true); DL.tick(); DL.repaint(); }
  };

  // ---------------------------------------------------------------- Démarrage

  function boot() {
    var creds = store.get("creds", null);
    if (store.get("demo", false)) { startSession(Demo.user, true); return; }
    if (!creds) { S.stack = [{ name: "login", params: {} }]; render(); return; }
    app.appendChild(h("div", { class: "loader" }));
    Xtream.login(creds).then(function (info) { startSession(info, false); }, function (err) {
      // Pas d'Internet : on garde la session pour pouvoir regarder les téléchargements.
      var offline = /joindre|Délai/.test(err.message);
      if (offline && store.get("user", null) && DL.list.length) {
        startSession(store.get("user", null), false);
        setRoot("downloads");
        toast("Pas de connexion : vos téléchargements restent disponibles.");
        return;
      }
      S.stack = [{ name: "login", params: {} }];
      render();
      toast(offline ? "Serveur injoignable, vérifiez votre connexion." : "Connexion impossible, vérifiez vos identifiants.");
    });
  }

  boot();
})();
