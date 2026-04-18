# LinkDesk — DEV-RULES

Règles de développement à respecter strictement pendant toute la vie du projet.
Ces règles s'appliquent aussi bien à Claude Code qu'au développeur humain.

---

## 1. Règles de Code — TypeScript / React (Frontend)

### Typage
- **TypeScript strict** activé (`strict: true` dans `tsconfig.json`). Jamais de `any`, jamais de `as unknown as`.
- Préférer les **interfaces** pour les objets publics, les **types** pour les unions/intersections/utilitaires.
- Toujours typer les props de composant. Utiliser `React.ComponentProps<'button'>` pour étendre les props HTML natives.
- Valider toutes les données venant de l'extérieur (WS, data channel, Tauri) avec **Zod** avant usage.

### Commentaires
- Commenter **chaque hook custom**, **chaque fonction > 10 lignes**, et **chaque bloc de logique non triviale**.
- Commentaires en anglais dans le code (convention internationale). Explications de haut niveau en français dans les README.
- Ne supprimer un commentaire QUE s'il est devenu obsolète ou faux.

### Nommage
- `camelCase` pour variables, fonctions, hooks (`useSignaling`, `generatePin`).
- `PascalCase` pour composants et types (`PinDisplay`, `SessionState`).
- `SCREAMING_SNAKE_CASE` pour constantes globales (`PIN_ROTATION_MINUTES = 30`).
- Pas d'abréviations cryptiques. `controllerPeerConnection` > `ctrlPC`.

### Taille & responsabilité
- Max **40 lignes par fonction**. Au-delà, découper.
- Max **150 lignes par composant**. Au-delà, extraire en sous-composants ou hooks.
- Un hook = une responsabilité (ne pas mélanger signaling + WebRTC dans un seul hook).

### Imports
- Ordre : (1) libs externes, (2) imports `@/` absolus, (3) imports relatifs, (4) types, (5) styles.
- Jamais d'import relatif qui remonte de plus de 2 niveaux (`../../../..`). Utiliser l'alias `@/`.
- Pas d'import circulaire. Vérifier avec `madge` avant chaque merge.

### Error handling
- Jamais de `catch (e) {}` vide. Toujours logger ou remonter.
- Utiliser des **Result types** (ou Zod `SafeParseReturnType`) pour les opérations qui peuvent échouer légitimement.
- Les erreurs de réseau/WebRTC doivent toujours être affichées à l'utilisateur via un toast.

---

## 2. Règles de Code — Rust (Backend natif Tauri)

### Qualité
- `cargo clippy` **clean**, zéro warning toléré. Ajouter `#![deny(warnings)]` en Phase 5.
- Pas de `.unwrap()` ni `.expect()` en production. Utiliser `?` ou gérer explicitement via `Result`.
- Documenter chaque fonction publique avec `///` (style rustdoc).
- Utiliser `thiserror` pour définir les types d'erreur, `anyhow` uniquement dans `main.rs`.

### Conventions
- `snake_case` pour tout (variables, fonctions, modules, fichiers).
- Modules regroupés par domaine (voir STRUCTURE.md).
- Les commandes Tauri (`#[tauri::command]`) retournent toujours `Result<T, String>` (le message d'erreur est remonté au frontend).

### Sécurité Rust spécifique
- Aucun `unsafe` sans justification écrite en commentaire avec audit.
- Crates avec `unsafe` (comme `enigo`) : isoler derrière une API sûre dans `core/`.
- Secrets jamais loggés, jamais retournés au frontend en clair.

---

## 3. Règles de Code — Node.js (Signaling server)

### Qualité
- TypeScript strict également côté server.
- Fastify plugins : toujours **async register** avec encapsulation des routes.
- Logs via **Pino** uniquement, jamais `console.log` en production.
- Validation Zod sur **chaque** message WebSocket entrant.

### Structure
- Une feature = un dossier dans `features/`. Handler = fonction pure testable.
- `session-manager.ts` est le **seul** endroit qui mute l'état global des sessions.

---

## 4. Règles UI/UX

### Philosophie
- **Zéro courbe d'apprentissage** : un utilisateur doit comprendre quoi faire en < 5 secondes.
- **Un écran = une décision.** Jamais plus de 2 actions principales par écran.
- **Texte en français** partout dans l'UI. Pas d'anglais visible pour l'utilisateur final.

### Composants
- Utiliser **shadcn/ui** comme base. Customiser via props ou `className`, ne pas réécrire.
- Spacing via **multiples de 4px** (système Tailwind par défaut).
- Typography : `text-base` (16px) minimum pour le corps, `text-lg` ou plus pour les CTA.

### États à toujours gérer
Pour **chaque** action utilisateur, prévoir :
- **Loading** : spinner ou skeleton visible.
- **Empty** : message clair si pas de données.
- **Error** : toast ou inline message + action de retry possible.
- **Success** : feedback visuel confirmant l'action (toast, animation).

### Feedback utilisateur
- Toute action produit un retour en **< 100ms**.
- Les actions destructives (déconnecter, refuser) ne demandent **pas** de confirmation supplémentaire si elles sont réversibles (on peut se reconnecter).
- Les connexions entrantes (côté hôte) doivent faire du **bruit** : son système + popup OS-level + mise en avant fenêtre.

### Accessibilité
- Tout élément interactif est atteignable au **clavier** (`Tab` + `Enter`).
- `aria-label` sur tous les boutons icône-only.
- Contraste minimum **4.5:1** (WCAG AA).
- Support du mode sombre via classe `dark:` (shadcn gère nativement).

### Responsive
- L'app est une fenêtre desktop, **pas besoin de responsive mobile**.
- Min window size : **900x600**. Max : illimité.
- Layout fluide, pas de largeurs fixes au pixel près.

---

## 5. Règles de Structure

- **Colocation** : garder le hook, le composant et les types associés dans le même dossier `features/xxx/`.
- **Séparation** : la logique métier est dans `features/` (hooks), jamais inline dans un composant.
- **Types partagés** : dans `src/types/`. Types locaux : colocalisés avec leur module.
- **Commandes Tauri** : jamais d'appel `invoke()` direct dans un composant. Toujours via un wrapper typé dans `src/lib/tauri.ts` ou `src/features/xxx/commands.ts`.
- **Pas d'import circulaire** : vérifier avec `madge --circular src/` avant chaque PR.

---

## 6. Règles de Données & État

### État React
- **Local state** (`useState`) par défaut.
- **Zustand** si un état doit être partagé entre 3+ composants non-reliés.
- **Pas de Redux**, overkill pour ce projet.
- Jamais de `useState([])` pour des collections mutables : préférer `Map` ou `Set` wrappés.

### Validation
- **Toute** donnée venant de l'extérieur (WS, data channel, Tauri commands, `localStorage`) est validée via Zod avant usage.
- Schémas Zod définis dans `features/xxx/schemas.ts`, utilisés côté client ET serveur si possible (monorepo = package partagé possible en Phase 5).

### Secrets & config
- Jamais de secret en dur dans le code.
- Variables Tauri préfixées `VITE_` pour le webview. Côté Rust, via `env!()` ou fichier de config chiffré.
- `.env.example` à jour avec **toutes** les variables, commentées.
- ID machine, PIN, et données de session : jamais loggés en clair.

### Stockage local
- **ID machine** : chiffré via **Tauri Stronghold**.
- **Log de session** : SQLite local via `tauri-plugin-sql`.
- **Pas de `localStorage`** pour les données sensibles (accessible depuis devtools).

---

## 7. Règles WebRTC & Réseau

### Handshake
- Toujours utiliser `iceGatheringState === 'complete'` avant d'envoyer l'offer finale (trickle ICE possible mais complexifie).
- **Timeout** à 15s sur le handshake. Au-delà, abort + message utilisateur clair.
- Tester systématiquement sur 3 scénarios : même LAN, WAN avec IP publique, derrière double NAT (TURN requis).

### Data channel
- Canal unique `ordered: true, maxRetransmits: 0` pour les inputs (low latency > fiabilité).
- Messages JSON compacts (pas de champs verbeux). Envisager MessagePack en Phase 5 si bande passante problématique.
- **Throttling** des événements souris à **60Hz max** (1 message / 16ms).

### Signaling
- Reconnexion automatique avec **backoff exponentiel** (1s, 2s, 4s, 8s, max 30s).
- Heartbeat **ping/pong toutes les 30s**, timeout 10s.
- Si le signaling tombe en cours de session active : la session P2P continue, on tente juste de se ré-enregistrer en arrière-plan.

---

## 8. Règles de Documentation Externe

### Context7 MCP (OBLIGATOIRE en Claude Code)
- Pour **toute** librairie de la stack, utiliser Context7 pour obtenir la documentation à jour **avant** de coder.
- Ne jamais coder une API de librairie de mémoire sans vérification.
- Librairies concernées : `@tauri-apps/api`, `enigo`, `fastify`, `ws`, `react`, `@radix-ui/*` (via shadcn), `zod`, `zustand`.
- WebRTC : MDN est prioritaire, mais Context7 peut aider pour les bibliothèques d'abstraction.

### README
- `README.md` racine : vue d'ensemble, quick start, état d'avancement.
- `desktop-app/README.md` : setup local (Rust toolchain + Node), commandes utiles.
- `signaling-server/README.md` : deploy guide + variables d'env.
- Mettre à jour à chaque **fin de phase**.

### Env
- `.env.example` : toutes les variables documentées avec un commentaire et une valeur exemple.
- Exemple : `VITE_SIGNALING_WS_URL=ws://localhost:3001  # URL du serveur de signaling`

---

## 9. Règles Git

- Un commit = une tâche atomique.
- Format : `type(scope): description`
- Types : `feat` | `fix` | `refactor` | `docs` | `chore` | `test` | `perf`
- Exemples :
  - `feat(pin): add PIN rotation timer`
  - `fix(webrtc): handle ICE candidate parse error`
  - `chore(tauri): upgrade to 2.1.0`
- Tag Git à chaque fin de phase : `git tag v0.X-label` puis `git push --tags`.
- Branches :
  - `main` → production only
  - `dev` → branche d'intégration
  - `feat/xxx`, `fix/xxx` → branches de travail
- **Ne jamais committer** : `.env`, `node_modules/`, `target/` (Rust), `dist/`, `*.log`, `.DS_Store`, clés privées, certificats.

---

## 10. Règles de Sécurité

### Inputs
- Valider **côté serveur** toute donnée reçue (jamais faire confiance au client).
- Sanitizer les chaînes avant affichage (`DOMPurify` si HTML, sinon échappement par défaut React).
- Le PIN est un secret éphémère : transmission uniquement en WSS (TLS obligatoire).

### Auth & permissions
- Pas d'auth utilisateur pour le MVP, mais **consentement explicite** obligatoire avant chaque connexion.
- Le consentement est **toujours côté hôte**, avec nom du pair (ou IP si pas de nom) affiché clairement.
- Timeout **30 secondes** sur le consentement (refus par défaut).

### Rate limiting
- Signaling server : **10 tentatives PIN / IP / 5 min**. Dépassement = ban IP 15 min.
- Reconnexion WS : **max 5 tentatives / min / machine_id**.

### Headers & TLS
- Signaling server derrière reverse proxy avec TLS (Caddy ou Nginx).
- Headers : `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`.
- Origines WS autorisées : liste blanche stricte en prod.

### Dépendances
- Audit **hebdomadaire** en phase de dev, **quotidien** en prod : `npm audit`, `cargo audit`.
- Pas de dépendance avec `< 100 weekly downloads` ou sans mise à jour depuis > 1 an.

### Logs
- **Jamais logger** : PIN, machine_id en clair, SDP, ICE candidates (contiennent des IPs).
- Logger : timestamps, types d'événements, codes d'erreur, durées.
- Logs locaux : rotation automatique, max 10 MB cumulés.

---

## 11. Workflow de Fin de Phase

À chaque fin de phase, exécuter **dans l'ordre** :

1. **Build** — `npm run tauri build` + `npm run build` (signaling) → zéro erreur.
2. **Lint** — `npm run lint` + `cargo clippy --all-targets -- -D warnings` → zéro warning.
3. **Tests** — `npm test` + `cargo test` → tous verts.
4. **Vérification manuelle** — Tester le flow complet entre 2 machines (ou 2 instances locales).
5. **README** — Mettre à jour la section "Avancement" + les nouvelles variables d'env.
6. **.env.example** — Synchroniser avec les nouvelles variables.
7. **Commit final** — Message : `chore: complete phase X`
8. **Tag Git** — `git tag v0.X-label && git push --tags`

### Rapport de phase attendu

```markdown
## Rapport Phase X — [Titre]

### Implémenté
- [Feature A] — description courte
- [Feature B] — description courte

### Non implémenté (et pourquoi)
- [Feature C] — raison (complexité, dépendance manquante, hors scope MVP)

### Problèmes rencontrés
- [Problème] → [Solution appliquée]

### Recommandations Phase suivante
- [Point d'attention, pré-requis, refactoring à prévoir]

### Métriques (si applicable)
- Latence handshake : Xms
- Latence input → action : Xms
- Taille bundle : X MB
```

---

## 12. Workflow de Debug

Processus **systématique** en 6 étapes, à suivre dans l'ordre :

1. **Observer** — Lire les fichiers concernés, reproduire le bug. **Ne rien modifier** à cette étape.
2. **Diagnostiquer** — Identifier la cause racine, pas le symptôme. Lire les logs (console, Tauri devtools, serveur).
3. **Formuler 2-3 hypothèses** — Classer par probabilité. Les présenter clairement.
4. **Valider** — Attendre la validation de Guillaume avant d'appliquer un fix.
5. **Corriger** — Fix minimal. Pas de refactoring simultané.
6. **Expliquer** — Documenter le changement dans le commit + éventuellement dans le README.

### Garde-fous debug

- **Ne jamais modifier > 1 fichier à la fois** sans le signaler explicitement.
- Si le bug implique une **API de librairie** : consulter Context7 avant tout code.
- Si le bug implique un **changement de schéma** (BDD locale, messages WS) : **STOP** et alerter.
- Vérifier **tous les logs** (console browser, `console_log` Rust, serveur Fastify) avant de conclure.
- Ne jamais supprimer du code "parce que ça marche sans" : comprendre pourquoi d'abord.

### Spécifique WebRTC

- **Toujours** activer `chrome://webrtc-internals` (ou équivalent) pour diagnostiquer les problèmes ICE/DTLS.
- En cas de "connection failed" : vérifier successivement STUN, TURN, firewall, NAT type.
- Latence élevée : vérifier le codec négocié (H.264 > VP8 en général), la résolution, la fréquence d'images.

### Spécifique Tauri

- Erreur "command not found" : vérifier que la commande est bien enregistrée dans `main.rs` (`.invoke_handler`).
- Permissions refusées : vérifier `tauri.conf.json` et `capabilities/default.json`.
- Build échoue en release : tester d'abord en dev, puis `cargo build --release` seul pour isoler.

---

## 13. Règles spécifiques Claude Code / Cursor

- **Lire** le PRD.md et STRUCTURE.md **avant** toute modification de code.
- Respecter l'arborescence définie. Ne pas créer de fichiers en dehors sans justification.
- Utiliser **Context7** pour toute API de librairie avant de coder.
- En cas de doute sur une décision architecturale : **demander**, ne pas improviser.
- Une tâche ambiguë → proposer 2-3 approches avant de coder.
- Ne jamais désactiver un test qui échoue sans documenter pourquoi.
