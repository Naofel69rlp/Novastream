# NovaStream pour iPhone

Version iOS native (SwiftUI + AVPlayer) de NovaStream, l'appli IPTV Xtream Codes.
Elle reprend l'identité de la version Windows (fond OLED, bleu cobalt, affiches 2:3, badges de note)
et ses rubriques : **Accueil**, **En direct**, **Films**, **Séries**, **Ma liste**, **Recherche** et **Paramètres**.

L'appli Windows n'est pas modifiée : ce dossier est un projet séparé.

## Ce que fait l'appli

- Connexion Xtream Codes (URL du serveur, utilisateur, mot de passe), mémorisée dans le trousseau iOS.
- **Mode démo** pour essayer l'appli sans abonnement (catalogue « Nova » et vidéos de test d'Apple).
- Accueil avec bannière, rangées « Nouveaux films », « Séries à découvrir », « En direct » et « Ma liste ».
- Direct : filtres par catégorie, recherche, badges HD/FHD/4K, lecteur avec la liste des chaînes en dessous
  (on zappe sans quitter le lecteur), plein écran en tournant l'iPhone.
- Films et séries : grilles filtrables, fiches détaillées, saisons et épisodes, bouton « Lire S1 É1 ».
- Lecteur iOS natif : Picture in Picture, AirPlay vers une Apple TV ou une TV compatible, son en arrière-plan.
- Si un flux n'est pas lisible par iOS (MKV, AVI, certains .ts), boutons **Ouvrir dans VLC** / **Infuse**.

## Structure

```text
NovaStream-iOS/
├── NovaStream.xcodeproj         # Projet Xcode (Xcode 16 ou plus récent)
├── .github/workflows/           # Compilation automatique sur un Mac GitHub (pour qui n'a pas de Mac)
└── NovaStream/
    ├── App/NovaStreamApp.swift  # Point d'entrée, onglets
    ├── Core/                    # Client Xtream, modèles, thème, trousseau, données démo
    ├── Components/              # Affiches, pastilles, badges, cache d'images
    ├── Views/                   # Connexion, Accueil, Direct, Films/Séries, fiches, lecteur, réglages
    ├── Assets.xcassets          # Icône, bannière, couleurs
    └── Info.plist               # Autorisation HTTP (serveurs IPTV), lecture en arrière-plan
```

## Installer sur ton iPhone

Une appli iPhone se compile **obligatoirement avec Xcode, qui ne tourne que sur macOS**. Trois chemins :

### Option 1 : tu as accès à un Mac (le plus simple)

1. Installe **Xcode** depuis l'App Store du Mac (gratuit).
2. Copie le dossier `NovaStream-iOS` sur le Mac et ouvre `NovaStream.xcodeproj`.
3. Dans Xcode : **Settings › Accounts › +** et ajoute ton Apple ID (un compte gratuit suffit).
4. Clique sur le projet **NovaStream › onglet Signing & Capabilities › Team** et choisis ton Apple ID.
   Si Xcode refuse l'identifiant `com.naokits.novastream`, change-le (par ex. `com.tonprenom.novastream`).
5. Branche l'iPhone en USB, choisis-le en haut de la fenêtre, puis **▶︎ Run**.
6. Sur l'iPhone :
   - **Réglages › Confidentialité et sécurité › Mode développeur** : active-le (l'iPhone redémarre).
   - **Réglages › Général › VPN et gestion de l'appareil** : fais confiance à ton certificat.

Avec un Apple ID gratuit, l'appli **expire au bout de 7 jours** : il suffit de refaire « Run » depuis Xcode.
Avec le programme développeur Apple (99 €/an), elle dure un an et tu peux la distribuer par TestFlight.

### Option 2 : tu n'as que Windows (compilation en ligne + sideload)

1. Crée un dépôt GitHub et envoie-y le contenu de `NovaStream-iOS` (sans le dossier parent).
2. Dans l'onglet **Actions** du dépôt, lance **« Construire l'IPA »**. GitHub compile l'appli sur un Mac
   dans le cloud (gratuit pour un dépôt public ; pour un dépôt privé, les minutes macOS gratuites sont limitées).
3. Télécharge l'artefact **NovaStream-ipa** : il contient `NovaStream-non-signe.ipa`.
4. Sur ton PC, installe **Sideloadly** (ou **AltStore** avec AltServer), branche l'iPhone, glisse le `.ipa`,
   entre ton Apple ID : l'outil signe l'appli et l'installe.
5. Sur l'iPhone, active le **Mode développeur** et fais confiance au certificat comme à l'option 1.

Même limite de 7 jours avec un Apple ID gratuit : Sideloadly/AltStore peuvent la renouveler.
Autre possibilité : louer un Mac dans le cloud (MacinCloud, etc.) quelques heures pour suivre l'option 1.

### Option 3 : une web-app ajoutée à l'écran d'accueil (PWA)

Possible, mais moins fiable pour l'IPTV :

- **HTTP bloqué** : une PWA doit être servie en HTTPS, et Safari bloque alors les appels vers un serveur
  IPTV en `http://` (contenu mixte). La majorité des serveurs Xtream sont en HTTP.
- **CORS** : `player_api.php` n'autorise presque jamais les appels depuis un autre site ; le navigateur refuse
  de lire la réponse.
- **Formats** : Safari lit le HLS (`.m3u8`) mais pas le MPEG-TS brut (`.ts`) ni le MKV.
- La parade est un petit **serveur relais** (proxy) en HTTPS qui interroge le serveur IPTV à ta place :
  il faut l'héberger, et tes identifiants IPTV transitent par lui.

L'appli native n'a aucune de ces limites : c'est l'option recommandée.

## Lecture : formats pris en charge

| Contenu | Format | Lecteur iOS |
|---|---|---|
| Direct | HLS `.m3u8` (par défaut) | ✅ |
| Direct | MPEG-TS `.ts` (réglable dans Paramètres) | ⚠️ souvent refusé |
| Films / épisodes | MP4, M4V, MOV | ✅ |
| Films / épisodes | MKV, AVI | ❌ → bouton « Ouvrir dans VLC » |

Pour tout lire dans l'appli, on peut intégrer **VLCKit** (moteur VLC) via Swift Package Manager ;
c'est une évolution possible, au prix d'une appli plus lourde.

## Note

Le projet a été écrit sans Mac à disposition, donc **il n'a pas encore été compilé**. Si Xcode affiche
une erreur au premier build, copie le message : la correction est en général immédiate.
