# Installer NovaStream sur iPhone avec TestFlight

À faire une seule fois (compte développeur Apple requis) :

1. **Créer l'appli dans App Store Connect** : [appstoreconnect.apple.com](https://appstoreconnect.apple.com) › Apps › **+** › Nouvelle app.
   Plateforme iOS, nom « NovaStream » (ou un autre nom libre), langue Français,
   identifiant de paquet **com.naokits.novastream** (s'il n'apparaît pas encore dans la liste, lance d'abord
   l'étape 4 une fois : elle le crée, puis reviens ici), SKU : `novastream`.
2. **Créer une clé API** : Utilisateurs et accès › Intégrations › App Store Connect API › **+**,
   accès **App Manager**. Télécharge le fichier `AuthKey_XXXX.p8` (une seule fois possible) et note
   l'**ID de la clé** et l'**Issuer ID**.
3. **Ajouter 4 secrets dans GitHub** : dépôt Novastream › Settings › Secrets and variables › Actions › New repository secret :
   - `APPLE_TEAM_ID` : ton identifiant d'équipe (developer.apple.com › Account › Membership details)
   - `ASC_KEY_ID` : l'ID de la clé
   - `ASC_ISSUER_ID` : l'Issuer ID
   - `ASC_KEY_P8` : tout le contenu du fichier `.p8` (ouvre-le avec le Bloc-notes et copie tout)
4. **Lancer l'envoi** : onglet Actions › « Envoyer sur TestFlight » › Run workflow.
5. Après 10 à 30 minutes de traitement chez Apple : App Store Connect › ton appli › TestFlight ›
   **Testeurs internes** › ajoute ton adresse. Installe l'appli **TestFlight** sur l'iPhone et accepte l'invitation.

Ensuite, chaque nouvelle version se publie avec l'étape 4, et TestFlight la propose sur l'iPhone.
Une version TestFlight reste installable 90 jours.
