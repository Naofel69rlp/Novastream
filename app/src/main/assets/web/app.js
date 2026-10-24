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
    check: '<path d="m5 12 5 5 9-10"/>'
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
    stack: [],     // pile de navigation : { name, params, focus }
    root: "home"
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
  }

  // ---------------------------------------------------------------- Lecture

  function liveUrl(ch) {
    return S.demo ? DEMO_URL : Xtream.streamUrl("live", ch.id, S.liveFormat);
  }

  function play(payload) {
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
    play({ live: true, index: index, titles: channels.map(function (c) { return c.name; }),
      urls: channels.map(liveUrl), subtitle: "En direct" });
  }

  function playMovie(item) {
    play({ live: false, index: 0, titles: [item.name], subtitle: item.year || "",
      urls: [S.demo ? DEMO_URL : Xtream.streamUrl("movie", item.id, item.ext)] });
  }

  function playEpisodes(show, season, episodes, index) {
    play({ live: false, index: index, subtitle: show.name,
      titles: episodes.map(function (e) { return "S" + season + " É" + e.num + " · " + (e.title || "Épisode " + e.num); }),
      urls: episodes.map(function (e) { return S.demo ? DEMO_URL : Xtream.streamUrl("series", e.id, e.ext); }) });
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

  function scrollIntoView(el) {
    var row = el.closest(".row");
    if (row) {
      var r = el.getBoundingClientRect(), rr = row.getBoundingClientRect();
      if (r.left < rr.left + 30) row.scrollLeft -= (rr.left + 40 - r.left);
      else if (r.right > rr.right - 30) row.scrollLeft += (r.right - rr.right + 40);
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
    if (er.top < br.top + margin) box.scrollTop -= (br.top + margin - er.top);
    else if (er.bottom > br.bottom - margin) box.scrollTop += (er.bottom - br.bottom + margin);
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
    if (best) focus(best);
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
      webPlayer.remove(); webPlayer = null; e.preventDefault(); return;
    }
    if (key === "ArrowUp" || key === "ArrowDown") { e.preventDefault(); move(key === "ArrowUp" ? "up" : "down"); return; }
    if (key === "ArrowLeft" || key === "ArrowRight") {
      if (typing && target.value && !(key === "ArrowLeft" ? target.selectionStart === 0 : target.selectionEnd === target.value.length)) return;
      e.preventDefault(); move(key === "ArrowLeft" ? "left" : "right"); return;
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

  // ---------------------------------------------------------------- Écrans

  function go(name, params) {
    if (S.stack.length) S.stack[S.stack.length - 1].focus = focusPath(document.activeElement);
    S.stack.push({ name: name, params: params || {} });
    render();
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
    app.innerHTML = "";
    if (top.name === "login") {
      app.appendChild(screen(top.params));
    } else {
      var main = h("main", { class: "main" });
      app.appendChild(h("div", { class: "shell" }, navBar(), main));
      if (!IS_TV && S.stack.length > 1) {
        main.appendChild(h("button", { class: "back-btn", "aria-label": "Retour", onclick: function () { NS.back(); } }, "‹"));
      }
      main.appendChild(screen(top.params, main));
    }
    restoreFocus(top, keepNavFocus && wasNav);
  }

  function restoreFocus(top, toNav) {
    wantsContentFocus = false;
    if (toNav) { focus(document.querySelector(".nav .current"), false); return; }
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
      if (container.__token !== token || !document.contains(container)) return;
      container.innerHTML = "";
      append(container, build(data));
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
    ["series", "Séries", "series"], ["favorites", "Ma liste", "heart", "Ma liste"], ["search", "Rechercher", "search", "Chercher"]
  ];

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
        if (!c.items.length || !document.contains(liveBox)) return;
        var list = c.items.slice(0, 20);
        liveBox.appendChild(section("En direct", list.map(function (ch, i) { return channelTile(list, i, "home-"); }),
          c.items.length + " chaînes"));
      }, function () {});
      moviesLoaded.then(function (c) {
        if (!c.items.length || !document.contains(moviesBox)) return;
        moviesBox.appendChild(section("Nouveaux films", recent(c.items, 20).map(function (m) { return posterCard(m, "home-" + m.id); })));
      }, function (err) { if (document.contains(moviesBox)) moviesBox.appendChild(h("p", { class: "page error", text: err.message })); });
      seriesLoaded.then(function (c) {
        if (!c.items.length || !document.contains(seriesBox)) return;
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
          favoriteButton(item)
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
          eps.forEach(function (e, idx) {
            list.appendChild(h("button", { class: "episode f", "data-key": "ep-" + e.id,
              onclick: function () { playEpisodes(item, s, eps, idx); } },
              h("div", { class: "thumb" }, String(e.num), img(e.image)),
              h("div", null,
                h("h3", { text: e.num + ". " + (e.title || "Épisode " + e.num) }),
                minutes(e.duration) ? h("div", { class: "muted", text: minutes(e.duration) }) : null,
                e.plot ? h("p", { text: e.plot }) : null)));
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
      var results = h("div");
      var timer = null;

      function run() {
        var q = str(input.value).toLowerCase();
        params.q = input.value;
        results.innerHTML = "";
        if (q.length < 2) {
          results.appendChild(h("p", { class: "empty", text: "Tapez au moins deux lettres." }));
          return;
        }
        Promise.all(["live", "movies", "series"].map(function (s) {
          return catalog(s).catch(function () { return { items: [] }; });
        })).then(function (all) {
          if (str(input.value).toLowerCase() !== q) return;
          var match = function (i) { return i.name.toLowerCase().indexOf(q) !== -1; };
          var ch = all[0].items.filter(match).slice(0, 30);
          var mv = all[1].items.filter(match).slice(0, 60);
          var se = all[2].items.filter(match).slice(0, 60);
          results.innerHTML = "";
          if (!ch.length && !mv.length && !se.length) results.appendChild(h("p", { class: "empty", text: "Aucun résultat pour « " + input.value + " »." }));
          if (ch.length) results.appendChild(h("div", null, h("h2", { text: "Chaînes", style: "margin:2.4rem 0 1.2rem" }),
            h("div", { class: "grid" }, ch.map(function (c, i) { return channelTile(ch, i, "sr-"); }))));
          if (mv.length) results.appendChild(h("div", null, h("h2", { text: "Films", style: "margin:2.4rem 0 1.2rem" }),
            h("div", { class: "grid" }, mv.map(function (m) { return posterCard(m); }))));
          if (se.length) results.appendChild(h("div", null, h("h2", { text: "Séries", style: "margin:2.4rem 0 1.2rem" }),
            h("div", { class: "grid" }, se.map(function (s) { return posterCard(s); }))));
        });
      }

      input.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(run, 350); });
      enterHooks.search = function () { clearTimeout(timer); run(); move("down"); };
      run();
      return h("div", { class: "page" }, h("h1", { class: "page-title display", text: "Rechercher" }), input, results);
    },

    settings: function () {
      var u = S.user || {};
      var formatBtn = h("button", { class: "setting f", "data-key": "set-format", onclick: function () {
        S.liveFormat = S.liveFormat === "ts" ? "m3u8" : "ts";
        store.set("liveFormat", S.liveFormat);
        formatBtn.lastChild.textContent = formatLabel();
      } }, h("span", { text: "Format du direct" }), h("span", { text: formatLabel() }));

      function row(label, value) {
        return h("div", { class: "setting" }, h("span", { text: label }), h("span", { text: value }));
      }

      return h("div", { class: "page" }, h("h1", { class: "page-title display", text: "Paramètres" }),
        h("div", { class: "settings" },
          row("Utilisateur", u.username || ""),
          row("Statut", str(u.status).toLowerCase() === "active" ? "Abonnement actif" : u.status || ""),
          row("Expire le", u.expires || ""),
          row("Connexions", u.connections || ""),
          row("Serveur", S.demo ? "Mode démo" : Xtream.creds.server),
          formatBtn,
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
    if (demo) store.set("demo", true); else store.remove("demo");
    setRoot("home");
  }

  function logout() {
    store.remove("creds");
    store.remove("demo");
    S.user = null;
    S.catalogs = {};
    S.stack = [{ name: "login", params: {} }];
    render();
  }

  var NS = window.NS = {
    // Appelé par la touche Retour d'Android : renvoie true si l'appli a géré le retour.
    back: function () {
      if (webPlayer) { webPlayer.remove(); webPlayer = null; return true; }
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
    focus: function () { var el = document.activeElement; if (!el || el === document.body) focus(defaultFocus()); }
  };

  // ---------------------------------------------------------------- Démarrage

  function boot() {
    var creds = store.get("creds", null);
    if (store.get("demo", false)) { startSession(Demo.user, true); return; }
    if (!creds) { S.stack = [{ name: "login", params: {} }]; render(); return; }
    app.appendChild(h("div", { class: "loader" }));
    Xtream.login(creds).then(function (info) { startSession(info, false); }, function () {
      S.stack = [{ name: "login", params: {} }];
      render();
      toast("Connexion impossible, vérifiez vos identifiants.");
    });
  }

  boot();
})();
