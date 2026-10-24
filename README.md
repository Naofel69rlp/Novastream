# NovaStream TV

Version **Android TV / Google TV / Fire TV** de NovaStream, l'appli IPTV Xtream Codes,
pilotable entièrement à la télécommande.

- Connexion Xtream Codes (ou **mode démo** pour essayer sans abonnement).
- Accueil, **En direct** (catégories + chaînes), **Films**, **Séries** (saisons, épisodes), **Ma liste**, **Recherche**, **Paramètres**.
- Lecteur **ExoPlayer** : HLS (.m3u8), MPEG-TS (.ts), MP4, MKV ; sous-titres et pistes audio.
- Direct : **haut / bas** (ou CH+ / CH−) pour zapper. Séries : l'épisode suivant s'enchaîne.
- Si un flux ne passe pas : « Ouvrir avec un autre lecteur » (VLC, MX Player…).

## Installer sur la TV avec Downloader

1. Sur la TV, installe **Downloader** (icône orange) depuis le Play Store ou l'Amazon Appstore.
2. Autorise l'installation d'applis inconnues pour Downloader :
   - **Fire TV** : Paramètres › Ma Fire TV › Options pour les développeurs › Installer des applis inconnues › Downloader.
     (Si le menu développeur est caché : Paramètres › Ma Fire TV › À propos, clique 7 fois sur le nom de l'appareil.)
   - **Android TV / Google TV** : Paramètres › Applications › Sécurité et restrictions › Sources inconnues › Downloader.
3. Dans Downloader, tape le **code** (ou l'adresse ci-dessous), puis **Go** et **Installer**.

Adresse fixe de la dernière version :

```
https://github.com/Naofel69rlp/Novastream/releases/latest/download/NovaStream-TV.apk
```

Pour obtenir un code court : colle cette adresse sur <https://go.aftvnews.com/> et note le numéro donné.
Le code reste valable à chaque nouvelle version, puisque l'adresse ne change pas.

## Mettre à jour

Chaque modification poussée sur `main` recompile l'APK (onglet **Actions**) et publie une nouvelle version.
Sur la TV, refais simplement le code dans Downloader : la nouvelle version remplace l'ancienne sans perdre tes réglages.

## Structure

```text
app/src/main/
├── assets/web/        # Interface TV (HTML/CSS/JS) : écrans, navigation télécommande, client Xtream
├── java/…/MainActivity.java    # WebView + requêtes HTTP vers le serveur IPTV
├── java/…/PlayerActivity.java  # Lecteur plein écran ExoPlayer (Media3)
└── res/               # Icône et bannière Android TV
```

L'interface se teste aussi dans un navigateur : ouvre `app/src/main/assets/web/index.html`
(le mode démo fonctionne ; un vrai serveur IPTV sera bloqué par le navigateur, pas par l'appli).

La clé de signature `app/novastream-release.jks` sert uniquement à ce que chaque version remplace la précédente.
Cette appli n'est pas destinée au Play Store.
