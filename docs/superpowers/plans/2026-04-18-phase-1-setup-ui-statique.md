/resume# LinkDesk — Phase 1 : Setup & UI statique — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer une app Tauri 2.x qui lance, affiche un écran d'accueil à 2 boutons, un écran Hôte avec PIN rotatif 30 min (timer + régénération + copie clipboard) et un écran Contrôleur avec saisie PIN 9 cases. **Aucune logique réseau** à ce stade.

**Architecture :** Monorepo npm workspaces (`desktop-app/` + `signaling-server/` déjà réservé). Frontend React 18 + TS strict + Tailwind + shadcn/ui. Backend Rust avec commandes Tauri pour génération d'ID machine persistant (Stronghold) et génération de PIN via CSPRNG. Navigation via `MemoryRouter` (pas de deep links).

**Tech Stack :** Tauri 2.x · React 18 · TypeScript 5.x (strict) · Vite · Tailwind 3.x · shadcn/ui · Zod · Vitest · React Router 6 · Rust (stable) · `tauri-plugin-stronghold` · `uuid` · `thiserror` · `rand`

**Livrable :** Tag Git `v0.1-setup` à la fin de la phase.

---

## Prérequis côté exécuteur

- **Rust toolchain** stable (1.77+) : `rustup show` doit montrer un channel `stable`.
- **Node.js** 20 LTS et **npm** 10+.
- **Dépendances système Tauri** installées selon l'OS (voir https://v2.tauri.app/start/prerequisites/). Sur Windows : WebView2 + Microsoft C++ Build Tools. Sur macOS : Xcode CLT. Sur Linux : `webkit2gtk`.
- **Context7 MCP** configuré et fonctionnel (règle DEV-RULES §8 — obligatoire avant tout appel d'API de librairie).

**Règle transverse pour ce plan :** avant chaque tâche impliquant une API de librairie externe (`tauri`, `tauri-plugin-stronghold`, `shadcn`, `react-router-dom`, `vitest`), l'exécuteur **doit** appeler `mcp__claude_ai_Context7__query-docs` pour confirmer l'API courante. Les snippets ci-dessous sont la meilleure estimation à date du plan mais peuvent avoir dérivé.

---

## File Structure

Fichiers à créer pendant la Phase 1.

### Racine monorepo (5 fichiers)

- `.gitignore` — exclusions globales (node_modules, target, dist, .env, etc.)
- `.editorconfig` — config d'indentation partagée
- `package.json` — workspaces npm (`desktop-app`, `signaling-server`)
- `README.md` — vue d'ensemble + quick start (progressif)
- `CHANGELOG.md` — initialisation vide

### `desktop-app/` (Tauri + React frontend)

Fichiers de config racine :
- `desktop-app/package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`
- `desktop-app/tailwind.config.js`, `postcss.config.js`
- `desktop-app/.eslintrc.cjs`, `.prettierrc`
- `desktop-app/.env.example`
- `desktop-app/index.html`
- `desktop-app/components.json` (shadcn)
- `desktop-app/README.md`

Frontend (`desktop-app/src/`) :
- `main.tsx`, `App.tsx`, `index.css`
- `routes/home.tsx`, `routes/host.tsx`, `routes/controller.tsx`
- `components/ui/button.tsx`, `card.tsx`, `input.tsx`, `dialog.tsx`, `toast.tsx` (shadcn-generated)
- `components/hero-buttons.tsx`
- `components/pin-display.tsx`, `pin-timer.tsx`, `pin-input.tsx`
- `components/regenerate-button.tsx`, `copy-button.tsx`
- `features/pin/use-pin.ts`, `pin-generator.ts`, `pin.types.ts`
- `features/machine-id/use-machine-id.ts`, `machine-id.types.ts`
- `lib/tauri.ts`, `cn.ts`
- `types/tauri-commands.ts`

Tests :
- `desktop-app/tests/setup.ts`
- `desktop-app/tests/features/pin-generator.test.ts`
- `desktop-app/tests/features/use-pin.test.tsx`

Backend Rust (`desktop-app/src-tauri/`) :
- `Cargo.toml`, `tauri.conf.json`, `build.rs`
- `src/main.rs`, `lib.rs`
- `src/commands/mod.rs`, `machine_id.rs`, `pin.rs`
- `src/core/mod.rs`, `stronghold.rs`
- `src/errors.rs`
- `capabilities/default.json`
- `icons/` (placeholders générés par Tauri CLI)

### `signaling-server/` (Phase 1 : placeholder)

- `signaling-server/.gitkeep` — pour matérialiser le dossier dans Git. Contenu réel en Phase 2.

---

## Task 1 : Initialisation du monorepo (racine)

**Files :**
- Create : `.gitignore`
- Create : `.editorconfig`
- Create : `package.json`
- Create : `README.md`
- Create : `CHANGELOG.md`
- Create : `signaling-server/.gitkeep`

- [ ] **Step 1 : Créer `.gitignore` à la racine**

```gitignore
# Node
node_modules/
dist/
.vite/

# Rust
target/
Cargo.lock.bak

# Tauri
src-tauri/target/
src-tauri/gen/

# Env & secrets
.env
.env.local
*.key
*.pem

# OS
.DS_Store
Thumbs.db

# Logs
*.log
npm-debug.log*

# Editors
.vscode/
.idea/
*.swp
```

- [ ] **Step 2 : Créer `.editorconfig`**

```ini
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.rs]
indent_size = 4

[*.md]
trim_trailing_whitespace = false
```

- [ ] **Step 3 : Créer `package.json` racine (npm workspaces)**

```json
{
  "name": "linkdesk",
  "version": "0.1.0",
  "private": true,
  "description": "LinkDesk - remote desktop app (Tauri + WebRTC)",
  "workspaces": [
    "desktop-app",
    "signaling-server"
  ],
  "scripts": {
    "dev": "npm run tauri:dev --workspace=desktop-app",
    "build": "npm run tauri:build --workspace=desktop-app",
    "lint": "npm run lint --workspaces --if-present",
    "test": "npm run test --workspaces --if-present"
  },
  "engines": {
    "node": ">=20",
    "npm": ">=10"
  }
}
```

- [ ] **Step 4 : Créer `README.md` racine**

```markdown
# LinkDesk

Application de contrôle à distance (Tauri + WebRTC + Node.js signaling).

## Structure

- `desktop-app/` — App Tauri (client host & controller)
- `signaling-server/` — Serveur WebSocket de signaling (Phase 2+)

## Quick start (Phase 1)

```bash
npm install
npm run dev
```

## Avancement

- [x] Phase 1 — Setup & UI statique (en cours)
- [ ] Phase 2 — Signaling server
- [ ] Phase 3 — Handshake WebRTC
- [ ] Phase 4 — Streaming & contrôle
- [ ] Phase 5 — Polish & MVP release
```

- [ ] **Step 5 : Créer `CHANGELOG.md` + `signaling-server/.gitkeep`**

`CHANGELOG.md` :
```markdown
# Changelog

## [Unreleased]

### Phase 1 — Setup & UI statique (en cours)
```

`signaling-server/.gitkeep` : fichier vide.

- [ ] **Step 6 : Commit**

```bash
git add .gitignore .editorconfig package.json README.md CHANGELOG.md signaling-server/.gitkeep
git commit -m "chore: init monorepo structure with npm workspaces"
```

---

## Task 2 : Scaffolding Tauri 2.x + React + TypeScript

**Context7 check avant de commencer :** `mcp__claude_ai_Context7__resolve-library-id` puis `query-docs` avec id Tauri 2.x — vérifier le CLI `create-tauri-app` et la structure `src-tauri/` attendue en v2.

**Files :**
- Create (via scaffolder) : `desktop-app/package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `index.html`
- Create (via scaffolder) : `desktop-app/src/main.tsx`, `App.tsx`, `assets/react.svg`
- Create (via scaffolder) : `desktop-app/src-tauri/` entier (Cargo.toml, tauri.conf.json, src/main.rs, src/lib.rs, capabilities/default.json, icons/)
- Delete : tous les fichiers démo (logo React, CSS demo, App.css)

- [ ] **Step 1 : Scaffolder l'app via le CLI Tauri**

Depuis la racine du monorepo :
```bash
npm create tauri-app@latest desktop-app -- --template react-ts --manager npm --identifier com.linkdesk.app
```

Si le CLI demande confirmation pour overwrite : répondre `N` et vérifier que le dossier `desktop-app/` est bien vide avant relance.

Expected : dossier `desktop-app/` créé avec squelette Tauri 2.x + Vite + React + TS.

- [ ] **Step 2 : Installer les dépendances du workspace**

```bash
cd desktop-app
npm install
cd ..
```

Note : la commande `npm install` à la racine se lancera aussi mais le workspace peut nécessiter un premier install ciblé pour garantir les binaires Tauri CLI.

- [ ] **Step 3 : Vérifier que `npm run tauri dev` démarre**

```bash
cd desktop-app
npm run tauri dev
```

Expected : fenêtre Tauri s'ouvre avec l'écran démo React (logo + "Welcome to Tauri"). Fermer la fenêtre pour arrêter. Si compilation Rust échoue : vérifier les prérequis système (voir section Prérequis).

- [ ] **Step 4 : Durcir `tsconfig.json` (strict mode + alias `@/`)**

Remplacer `desktop-app/tsconfig.json` par :

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true,
    "forceConsistentCasingInFileNames": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src", "tests"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 5 : Configurer l'alias `@/` côté Vite**

Remplacer `desktop-app/vite.config.ts` par :

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Tauri configuration: dev server host must be 0.0.0.0 so mobile targets work later.
// Port 1420 is the Tauri default; do not change without updating tauri.conf.json.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: "0.0.0.0",
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
});
```

- [ ] **Step 6 : Nettoyer les fichiers démo**

```bash
rm -f desktop-app/src/App.css desktop-app/src/assets/react.svg desktop-app/public/tauri.svg desktop-app/public/vite.svg
```

Puis remplacer `desktop-app/src/App.tsx` par un squelette minimal :

```tsx
import "./index.css";

// Root component - will mount the router in Task 4.
export default function App() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">LinkDesk</h1>
      <p className="text-sm text-muted-foreground">Bootstrapping...</p>
    </div>
  );
}
```

Et `desktop-app/src/main.tsx` :

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// React 18 strict-mode root. Strict mode is kept on throughout the app to
// catch side-effect regressions early during the UI-only phase.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 7 : Relancer `npm run tauri dev` et vérifier**

```bash
cd desktop-app
npm run tauri dev
```

Expected : fenêtre Tauri affiche "LinkDesk / Bootstrapping..." en texte brut (Tailwind pas encore branché — le `text-muted-foreground` ne rendra rien tant que Task 3 n'est pas faite, c'est attendu).

- [ ] **Step 8 : Commit**

```bash
git add desktop-app
git commit -m "feat(app): scaffold tauri 2 + react + ts desktop-app"
```

---

## Task 3 : Tailwind 3.x + shadcn/ui + thème sombre

**Context7 check :** `query-docs` sur `shadcn-ui` et `tailwindcss` (versions 3.x). La CLI shadcn et sa config évoluent fréquemment.

**Files :**
- Create : `desktop-app/tailwind.config.js`, `postcss.config.js`, `components.json`
- Modify : `desktop-app/src/index.css` (Tailwind directives + variables shadcn)
- Create : `desktop-app/src/lib/cn.ts`
- Create (via CLI shadcn) : `desktop-app/src/components/ui/button.tsx`, `card.tsx`, `input.tsx`, `dialog.tsx`, `toast.tsx`, `toaster.tsx`, `use-toast.ts`

- [ ] **Step 1 : Installer Tailwind, PostCSS, autoprefixer**

```bash
cd desktop-app
npm install -D tailwindcss@^3 postcss autoprefixer
npx tailwindcss init -p
```

Expected : `tailwind.config.js` et `postcss.config.js` créés.

- [ ] **Step 2 : Configurer `tailwind.config.js` pour shadcn**

Remplacer `desktop-app/tailwind.config.js` par :

```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
```

- [ ] **Step 3 : Remplacer `src/index.css` (directives + thème shadcn)**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222 47% 11%;
    --card: 0 0% 100%;
    --card-foreground: 222 47% 11%;
    --popover: 0 0% 100%;
    --popover-foreground: 222 47% 11%;
    --primary: 142 76% 36%;
    --primary-foreground: 0 0% 100%;
    --secondary: 217 91% 60%;
    --secondary-foreground: 0 0% 100%;
    --muted: 210 40% 96%;
    --muted-foreground: 215 16% 47%;
    --accent: 210 40% 96%;
    --accent-foreground: 222 47% 11%;
    --destructive: 0 84% 60%;
    --destructive-foreground: 0 0% 100%;
    --border: 214 32% 91%;
    --input: 214 32% 91%;
    --ring: 222 47% 11%;
    --radius: 0.75rem;
  }

  .dark {
    --background: 222 47% 11%;
    --foreground: 210 40% 98%;
    --card: 222 47% 11%;
    --card-foreground: 210 40% 98%;
    --popover: 222 47% 11%;
    --popover-foreground: 210 40% 98%;
    --primary: 142 71% 45%;
    --primary-foreground: 0 0% 100%;
    --secondary: 217 91% 60%;
    --secondary-foreground: 0 0% 100%;
    --muted: 217 33% 18%;
    --muted-foreground: 215 20% 65%;
    --accent: 217 33% 18%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 63% 50%;
    --destructive-foreground: 210 40% 98%;
    --border: 217 33% 18%;
    --input: 217 33% 18%;
    --ring: 212 100% 70%;
  }

  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
    font-feature-settings: "rlig" 1, "calt" 1;
  }
}
```

- [ ] **Step 4 : Créer `src/lib/cn.ts` (classnames helper)**

```typescript
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Merge tailwind classes while de-duplicating conflicting utilities.
// Used by every shadcn component.
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

Installer ses deps :
```bash
npm install clsx tailwind-merge tailwindcss-animate class-variance-authority lucide-react
```

- [ ] **Step 5 : Initialiser shadcn/ui**

```bash
npx shadcn@latest init
```

Répondre :
- Style : `Default`
- Base color : `Slate`
- CSS variables : `yes`
- `tsconfig.json` alias : `@/components` et `@/lib/utils` (OK si il renomme `cn.ts` en `utils.ts` — l'accepter et garder `cn.ts` comme ré-export si besoin)
- Would you like to use RSC ? `No`
- Tailwind config : accepter le path actuel
- Global CSS : accepter le path actuel
- Import alias for components : `@/components`
- Import alias for utils : `@/lib/cn`

Si le CLI écrase `index.css`, restaurer le contenu du Step 3.

- [ ] **Step 6 : Ajouter les composants UI nécessaires**

```bash
npx shadcn@latest add button card input dialog toast
```

Expected : 5 fichiers + `toaster.tsx` + `use-toast.ts` ajoutés sous `src/components/ui/`.

- [ ] **Step 7 : Vérifier visuellement**

Modifier `src/App.tsx` pour afficher un bouton shadcn :

```tsx
import { Button } from "@/components/ui/button";
import "./index.css";

export default function App() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Button>Test shadcn</Button>
    </div>
  );
}
```

Lancer :
```bash
npm run tauri dev
```

Expected : fenêtre Tauri affiche un bouton shadcn stylé au centre. Fermer.

- [ ] **Step 8 : Commit**

```bash
git add desktop-app
git commit -m "feat(ui): setup tailwind + shadcn/ui theme with dark mode"
```

---

## Task 4 : React Router (memory mode) + Vitest

**Context7 check :** `query-docs` sur `react-router-dom` v6 (API `createMemoryRouter`) et `vitest` (setup avec jsdom).

**Files :**
- Modify : `desktop-app/src/App.tsx`
- Create : `desktop-app/src/routes/home.tsx`, `host.tsx`, `controller.tsx` (placeholders)
- Create : `desktop-app/vitest.config.ts`
- Create : `desktop-app/tests/setup.ts`
- Modify : `desktop-app/package.json` (scripts test + lint)

- [ ] **Step 1 : Installer React Router + Vitest + RTL**

```bash
cd desktop-app
npm install react-router-dom
npm install -D vitest @vitest/ui jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

- [ ] **Step 2 : Créer les routes placeholders**

`desktop-app/src/routes/home.tsx` :
```tsx
// Home screen - 2-button entry point (host / controller).
// Real UI lives in Task 10.
export function HomeRoute() {
  return <div data-testid="home-route">Accueil</div>;
}
```

`desktop-app/src/routes/host.tsx` :
```tsx
// Host screen - displays rotating PIN (wired in Task 11).
export function HostRoute() {
  return <div data-testid="host-route">Hôte</div>;
}
```

`desktop-app/src/routes/controller.tsx` :
```tsx
// Controller screen - PIN input (wired in Task 12).
export function ControllerRoute() {
  return <div data-testid="controller-route">Contrôleur</div>;
}
```

- [ ] **Step 3 : Wire du `MemoryRouter` dans `App.tsx`**

```tsx
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { HomeRoute } from "@/routes/home";
import { HostRoute } from "@/routes/host";
import { ControllerRoute } from "@/routes/controller";
import { Toaster } from "@/components/ui/toaster";
import "./index.css";

// Memory router: no browser URL exposed to end user (PRD §7).
// Initial route is always `/` at cold start.
const router = createMemoryRouter(
  [
    { path: "/", element: <HomeRoute /> },
    { path: "/host", element: <HostRoute /> },
    { path: "/controller", element: <ControllerRoute /> },
  ],
  { initialEntries: ["/"] },
);

export default function App() {
  return (
    <>
      <RouterProvider router={router} />
      <Toaster />
    </>
  );
}
```

- [ ] **Step 4 : Créer `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

- [ ] **Step 5 : Créer `tests/setup.ts`**

```typescript
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Unmount any rendered components between tests to avoid cross-test leaks.
afterEach(() => {
  cleanup();
});

// Mock Tauri's invoke() for all tests by default. Individual tests override
// the mock via vi.mocked(invoke).mockResolvedValueOnce(...) as needed.
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));
```

- [ ] **Step 6 : Ajouter scripts `test` et `lint` dans `desktop-app/package.json`**

Ajouter dans la section `"scripts"` :
```json
"test": "vitest run",
"test:watch": "vitest",
"lint": "eslint . --ext ts,tsx --max-warnings 0",
"typecheck": "tsc --noEmit"
```

- [ ] **Step 7 : Configurer ESLint (`.eslintrc.cjs`)**

`desktop-app/.eslintrc.cjs` :
```javascript
module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react-hooks/recommended",
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: { ecmaVersion: "latest", sourceType: "module" },
  plugins: ["@typescript-eslint", "react-refresh"],
  rules: {
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
  },
  ignorePatterns: ["dist", "src-tauri", "node_modules"],
};
```

Installer les deps ESLint :
```bash
npm install -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin eslint-plugin-react-hooks eslint-plugin-react-refresh
```

- [ ] **Step 8 : Écrire un test smoke du routage**

`desktop-app/tests/app.test.tsx` :
```tsx
import { render, screen } from "@testing-library/react";
import App from "@/App";

describe("App routing", () => {
  it("renders the home route at cold start", () => {
    render(<App />);
    expect(screen.getByTestId("home-route")).toBeInTheDocument();
  });
});
```

- [ ] **Step 9 : Lancer les tests**

```bash
npm test
```

Expected : 1 test passing (`App routing > renders the home route at cold start`).

- [ ] **Step 10 : Vérifier lint + typecheck**

```bash
npm run lint
npm run typecheck
```

Expected : 0 warning, 0 error.

- [ ] **Step 11 : Commit**

```bash
git add desktop-app
git commit -m "feat(router): add memory router + vitest + eslint config"
```

---

## Task 5 : PIN generator (pure TS, TDD)

**Files :**
- Create : `desktop-app/src/features/pin/pin.types.ts`
- Create : `desktop-app/src/features/pin/pin-generator.ts`
- Create : `desktop-app/tests/features/pin-generator.test.ts`

- [ ] **Step 1 : Écrire les types**

`desktop-app/src/features/pin/pin.types.ts` :
```typescript
// A 9-digit PIN formatted as "XXX-XXX-XXX" (see PRD §3 Module 1).
export type Pin = string;

// Lifecycle metadata attached to every generated PIN.
export interface PinSession {
  pin: Pin;
  generatedAt: Date;
  expiresAt: Date;
}

export interface PinRotationConfig {
  // Duration in milliseconds between automatic rotations. Default 30 min.
  rotationIntervalMs: number;
}

export const DEFAULT_PIN_ROTATION_MS = 30 * 60 * 1000; // 30 minutes
```

- [ ] **Step 2 : Écrire le test (failing)**

`desktop-app/tests/features/pin-generator.test.ts` :
```typescript
import { generatePin, formatPin, parsePin } from "@/features/pin/pin-generator";

describe("pin-generator", () => {
  describe("generatePin", () => {
    it("returns a string in XXX-XXX-XXX format", () => {
      const pin = generatePin();
      expect(pin).toMatch(/^\d{3}-\d{3}-\d{3}$/);
    });

    it("uses crypto-secure randomness (distinct calls differ)", () => {
      const pins = new Set(Array.from({ length: 100 }, () => generatePin()));
      // With CSPRNG the collision probability across 100 calls is negligible.
      expect(pins.size).toBeGreaterThan(95);
    });
  });

  describe("formatPin", () => {
    it("inserts dashes every 3 chars", () => {
      expect(formatPin("123456789")).toBe("123-456-789");
    });

    it("throws if input is not 9 digits", () => {
      expect(() => formatPin("12345678")).toThrow();
      expect(() => formatPin("abcdefghi")).toThrow();
    });
  });

  describe("parsePin", () => {
    it("strips dashes and returns 9 digits", () => {
      expect(parsePin("123-456-789")).toBe("123456789");
    });

    it("returns null on invalid format", () => {
      expect(parsePin("12-345-678")).toBeNull();
      expect(parsePin("abc-def-ghi")).toBeNull();
    });
  });
});
```

- [ ] **Step 3 : Lancer le test — doit échouer**

```bash
npm test -- pin-generator
```

Expected : FAIL avec "Cannot find module '@/features/pin/pin-generator'".

- [ ] **Step 4 : Implémenter `pin-generator.ts`**

```typescript
import type { Pin } from "./pin.types";

const PIN_LENGTH = 9;
const PIN_PATTERN = /^\d{3}-\d{3}-\d{3}$/;

// Generates a 9-digit PIN using crypto.getRandomValues (CSPRNG).
// DEV-RULES §10: PINs must never come from Math.random.
export function generatePin(): Pin {
  const bytes = new Uint32Array(PIN_LENGTH);
  crypto.getRandomValues(bytes);
  // Map each 32-bit value to a single digit [0-9] via modulo.
  // Modulo bias is negligible here (2^32 mod 10 = 6, bias < 1.4e-9 per digit).
  const digits = Array.from(bytes, (n) => (n % 10).toString()).join("");
  return formatPin(digits);
}

// Formats a 9-digit string into "XXX-XXX-XXX". Throws on malformed input.
export function formatPin(raw: string): Pin {
  if (!/^\d{9}$/.test(raw)) {
    throw new Error(`Invalid PIN body: expected 9 digits, got "${raw}"`);
  }
  return `${raw.slice(0, 3)}-${raw.slice(3, 6)}-${raw.slice(6, 9)}`;
}

// Parses "XXX-XXX-XXX" into "XXXXXXXXX". Returns null if the format is wrong.
// Accepts exactly the canonical format - callers should normalize first.
export function parsePin(formatted: string): string | null {
  if (!PIN_PATTERN.test(formatted)) return null;
  return formatted.replace(/-/g, "");
}
```

- [ ] **Step 5 : Relancer — doit passer**

```bash
npm test -- pin-generator
```

Expected : PASS (4 tests).

- [ ] **Step 6 : Commit**

```bash
git add desktop-app/src/features/pin desktop-app/tests/features/pin-generator.test.ts
git commit -m "feat(pin): add csprng-based pin generator with format helpers"
```

---

## Task 6 : Hook `usePin` (rotation auto 30 min)

**Files :**
- Create : `desktop-app/src/features/pin/use-pin.ts`
- Create : `desktop-app/tests/features/use-pin.test.tsx`

- [ ] **Step 1 : Écrire le test (failing)**

`desktop-app/tests/features/use-pin.test.tsx` :
```tsx
import { act, renderHook } from "@testing-library/react";
import { usePin } from "@/features/pin/use-pin";

describe("usePin", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("generates a PIN on mount", () => {
    const { result } = renderHook(() => usePin({ rotationIntervalMs: 1000 }));
    expect(result.current.session.pin).toMatch(/^\d{3}-\d{3}-\d{3}$/);
  });

  it("exposes seconds-remaining countdown", () => {
    const { result } = renderHook(() => usePin({ rotationIntervalMs: 10_000 }));
    expect(result.current.secondsRemaining).toBeGreaterThan(0);
    expect(result.current.secondsRemaining).toBeLessThanOrEqual(10);
  });

  it("rotates PIN automatically when interval elapses", () => {
    const { result } = renderHook(() => usePin({ rotationIntervalMs: 1000 }));
    const firstPin = result.current.session.pin;

    act(() => {
      vi.advanceTimersByTime(1001);
    });

    expect(result.current.session.pin).not.toBe(firstPin);
  });

  it("regenerate() forces a new PIN immediately", () => {
    const { result } = renderHook(() => usePin({ rotationIntervalMs: 60_000 }));
    const firstPin = result.current.session.pin;

    act(() => {
      result.current.regenerate();
    });

    expect(result.current.session.pin).not.toBe(firstPin);
  });
});
```

- [ ] **Step 2 : Lancer — doit échouer**

```bash
npm test -- use-pin
```

Expected : FAIL (module non trouvé).

- [ ] **Step 3 : Implémenter `use-pin.ts`**

```typescript
import { useCallback, useEffect, useRef, useState } from "react";
import { generatePin } from "./pin-generator";
import {
  DEFAULT_PIN_ROTATION_MS,
  type PinRotationConfig,
  type PinSession,
} from "./pin.types";

interface UsePinReturn {
  session: PinSession;
  secondsRemaining: number;
  regenerate: () => void;
}

// Manages the rotating PIN lifecycle:
// - Generates a PIN on mount.
// - Rotates automatically every `rotationIntervalMs` (default 30 min).
// - Exposes a 1Hz countdown for the UI (see PinTimer component).
// - regenerate() invalidates the current PIN and starts a new rotation cycle.
export function usePin(
  config: Partial<PinRotationConfig> = {},
): UsePinReturn {
  const rotationMs = config.rotationIntervalMs ?? DEFAULT_PIN_ROTATION_MS;

  const [session, setSession] = useState<PinSession>(() => createSession(rotationMs));
  const [secondsRemaining, setSecondsRemaining] = useState(() =>
    secondsUntil(session.expiresAt),
  );

  // Keep the latest expiry in a ref so the countdown tick reads the current
  // value without re-subscribing to the interval on every state update.
  const expiresAtRef = useRef(session.expiresAt);
  expiresAtRef.current = session.expiresAt;

  // 1Hz countdown tick - drives the PinTimer progress display.
  useEffect(() => {
    const id = window.setInterval(() => {
      setSecondsRemaining(secondsUntil(expiresAtRef.current));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  // Rotation scheduler - schedules a single timeout for the current session.
  // When it fires, we generate a new session, which triggers a re-render and
  // this effect reschedules for the next rotation.
  useEffect(() => {
    const delay = Math.max(0, session.expiresAt.getTime() - Date.now());
    const id = window.setTimeout(() => {
      setSession(createSession(rotationMs));
    }, delay);
    return () => window.clearTimeout(id);
  }, [session, rotationMs]);

  const regenerate = useCallback(() => {
    setSession(createSession(rotationMs));
  }, [rotationMs]);

  return { session, secondsRemaining, regenerate };
}

function createSession(rotationMs: number): PinSession {
  const generatedAt = new Date();
  const expiresAt = new Date(generatedAt.getTime() + rotationMs);
  return { pin: generatePin(), generatedAt, expiresAt };
}

function secondsUntil(date: Date): number {
  return Math.max(0, Math.ceil((date.getTime() - Date.now()) / 1000));
}
```

- [ ] **Step 4 : Relancer les tests — doivent passer**

```bash
npm test -- use-pin
```

Expected : PASS (4 tests).

- [ ] **Step 5 : Commit**

```bash
git add desktop-app/src/features/pin/use-pin.ts desktop-app/tests/features/use-pin.test.tsx
git commit -m "feat(pin): add usePin hook with auto-rotation and countdown"
```

---

## Task 7 : Rust — structure de base des commandes + errors

**Context7 check :** `query-docs` sur `tauri` (v2) pour `#[tauri::command]`, `tauri::generate_handler!`, et `tauri::AppHandle` / `tauri::State`.

**Files :**
- Modify : `desktop-app/src-tauri/Cargo.toml` (ajout dépendances)
- Modify : `desktop-app/src-tauri/src/main.rs` (enable Rust edition strict)
- Modify : `desktop-app/src-tauri/src/lib.rs` (registration des commandes)
- Create : `desktop-app/src-tauri/src/errors.rs`
- Create : `desktop-app/src-tauri/src/commands/mod.rs`

- [ ] **Step 1 : Ajouter les dépendances dans `Cargo.toml`**

Dans `desktop-app/src-tauri/Cargo.toml`, section `[dependencies]` (ajouter à ce qui existe déjà, ne pas dupliquer `tauri` ni `serde`) :

```toml
uuid = { version = "1", features = ["v4", "serde"] }
rand = "0.8"
thiserror = "1"
tauri-plugin-stronghold = "2"
iota_stronghold = "2"
sha2 = "0.10"
hex = "0.4"
tokio = { version = "1", features = ["sync"] }
```

(Les versions exactes peuvent être validées au moment de l'implémentation via `cargo add` qui prend la dernière stable.)

- [ ] **Step 2 : Créer `errors.rs`**

```rust
use serde::Serialize;
use thiserror::Error;

/// Top-level error surface exposed to the frontend.
/// Every Tauri command returns `Result<T, AppError>` so the frontend can
/// display a toast with a stable message.
#[derive(Debug, Error, Serialize)]
#[serde(tag = "kind", content = "message")]
pub enum AppError {
    #[error("stronghold vault error: {0}")]
    Stronghold(String),

    #[error("invalid state: {0}")]
    InvalidState(String),

    #[error("io error: {0}")]
    Io(String),
}

impl From<std::io::Error> for AppError {
    fn from(value: std::io::Error) -> Self {
        AppError::Io(value.to_string())
    }
}
```

- [ ] **Step 3 : Créer `commands/mod.rs` (placeholders)**

```rust
//! Tauri command handlers exposed to the frontend via `invoke()`.
//!
//! Each submodule hosts one responsibility (PRD §6).
//! All commands must return `Result<T, crate::errors::AppError>`.

pub mod machine_id;
pub mod pin;
```

- [ ] **Step 4 : Créer un fichier squelette `commands/pin.rs` (implémenté en Task 8)**

```rust
use crate::errors::AppError;

/// Generates a 9-digit PIN using the OS-level CSPRNG (`OsRng`).
/// Returned unformatted - the frontend applies the "XXX-XXX-XXX" presentation.
#[tauri::command]
pub fn generate_pin_native() -> Result<String, AppError> {
    use rand::Rng;
    let mut rng = rand::rngs::OsRng;
    let mut out = String::with_capacity(9);
    for _ in 0..9 {
        out.push(char::from_digit(rng.gen_range(0..10), 10).expect("0..10 fits a digit"));
    }
    Ok(out)
}
```

- [ ] **Step 5 : Créer un squelette `commands/machine_id.rs` (implémenté en Task 8)**

```rust
use crate::errors::AppError;

/// Stub - real body added in Task 8 once Stronghold is wired.
#[tauri::command]
pub async fn get_machine_id() -> Result<String, AppError> {
    Err(AppError::InvalidState("get_machine_id: not yet implemented".into()))
}

#[tauri::command]
pub async fn generate_machine_id() -> Result<String, AppError> {
    Err(AppError::InvalidState("generate_machine_id: not yet implemented".into()))
}
```

- [ ] **Step 6 : Mettre à jour `lib.rs`**

```rust
//! LinkDesk desktop-app Rust library.
//! All business logic lives here; `main.rs` is a thin wrapper.

pub mod commands;
pub mod core;
pub mod errors;

use commands::{machine_id, pin};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            pin::generate_pin_native,
            machine_id::get_machine_id,
            machine_id::generate_machine_id,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 7 : Créer `core/mod.rs` vide pour préparer Task 8**

```rust
//! Native core modules (non-command utilities).

pub mod stronghold;
```

Et `core/stronghold.rs` avec un stub pour que ça compile :
```rust
//! Stronghold wrapper - real implementation in Task 8.
```

- [ ] **Step 8 : Vérifier la compilation**

```bash
cd desktop-app
npm run tauri dev
```

Expected : compilation Rust réussit, fenêtre s'ouvre (rien de neuf visuellement). Fermer.

Si erreurs : typiquement `tauri_plugin_shell` manquant → vérifier qu'il est dans `Cargo.toml` (ajouté par le scaffolder en Task 2, sinon `cargo add tauri-plugin-shell`).

- [ ] **Step 9 : `cargo clippy` clean**

```bash
cd desktop-app/src-tauri
cargo clippy --all-targets -- -D warnings
cd ../..
```

Expected : 0 warning.

- [ ] **Step 10 : Commit**

```bash
git add desktop-app/src-tauri
git commit -m "feat(rust): scaffold commands/errors/core module structure"
```

---

## Task 8 : Rust — Stronghold + machine_id persistant

**Context7 check (OBLIGATOIRE) :** `query-docs` sur `tauri-plugin-stronghold` v2 — l'API JS et Rust a beaucoup bougé entre v1 et v2. Vérifier :
1. Comment initialiser le plugin (`Builder::new(|password| ...)`)
2. Comment ouvrir un snapshot / client
3. Comment stocker/lire un store record

**Garde-fou :** si l'API Stronghold exige un prompt utilisateur pour le master password (ce qui casserait le flow "< 5s au démarrage" du PRD), **STOP et alerter Guillaume**. Un fallback acceptable serait `tauri-plugin-store` avec chiffrement applicatif léger, mais c'est une décision d'archi qui nécessite un go.

**Files :**
- Modify : `desktop-app/src-tauri/Cargo.toml` (déjà fait en Task 7, vérifier)
- Modify : `desktop-app/src-tauri/src/lib.rs` (enregistrer plugin Stronghold)
- Modify : `desktop-app/src-tauri/src/core/stronghold.rs` (wrapper)
- Modify : `desktop-app/src-tauri/src/commands/machine_id.rs`
- Modify : `desktop-app/src-tauri/capabilities/default.json` (permissions stronghold)
- Modify : `desktop-app/src-tauri/tauri.conf.json` (app identifier déjà set, vérifier)

- [ ] **Step 1 : Wrapper `core/stronghold.rs`**

Approche : dériver un master password déterministe depuis l'`app_data_dir` Tauri (stable par install) + un salt hardcodé. Ce n'est **pas** une protection forte — juste un chiffrement at-rest contre un utilisateur non-technique qui ouvrirait le fichier. L'ID machine n'est pas ultra-sensible.

```rust
use crate::errors::AppError;
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const STRONGHOLD_FILENAME: &str = "linkdesk.stronghold";
const PASSWORD_SALT: &[u8] = b"linkdesk-v1-stronghold-salt";

/// Returns the absolute path to the Stronghold vault file.
pub fn vault_path(app: &AppHandle) -> Result<PathBuf, AppError> {
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| AppError::Stronghold(format!("app_local_data_dir: {e}")))?;
    std::fs::create_dir_all(&dir)?;
    Ok(dir.join(STRONGHOLD_FILENAME))
}

/// Derives a deterministic password for the Stronghold snapshot from the
/// install-specific data directory path + a hardcoded salt.
/// Not a user secret - just prevents casual file-system inspection.
pub fn derive_password(app: &AppHandle) -> Result<Vec<u8>, AppError> {
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| AppError::Stronghold(format!("app_local_data_dir: {e}")))?;
    let mut hasher = Sha256::new();
    hasher.update(PASSWORD_SALT);
    hasher.update(dir.to_string_lossy().as_bytes());
    Ok(hasher.finalize().to_vec())
}
```

- [ ] **Step 2 : Enregistrer le plugin Stronghold dans `lib.rs`**

Remplacer la section `tauri::Builder::default()` par :

```rust
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Build the stronghold plugin with a derived password.
            // Done in setup() so we have access to app paths.
            let password = core::stronghold::derive_password(app.handle())?;
            let vault_path = core::stronghold::vault_path(app.handle())?;
            app.handle()
                .plugin(tauri_plugin_stronghold::Builder::with_argon2(&vault_path).build())?;
            // Store password on the state for command access.
            app.manage(core::stronghold::Password(password));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::pin::generate_pin_native,
            commands::machine_id::get_machine_id,
            commands::machine_id::generate_machine_id,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

Ajouter dans `core/stronghold.rs` :
```rust
/// Wrapper type so we can use `State<Password>` in commands without leaking `Vec<u8>`.
pub struct Password(pub Vec<u8>);
```

> **Note sur `with_argon2`** : l'API exacte (`new`, `with_argon2`, builder hasher custom) peut avoir changé. Vérifier via Context7 avant d'implémenter. Si `with_argon2` n'existe pas, fallback sur `Builder::new(|password: &str| hash_blake2b(password))` selon docs courantes.

- [ ] **Step 3 : Implémenter `commands/machine_id.rs`**

Approche pragmatique : utiliser l'API JavaScript Stronghold depuis le frontend (via `@tauri-apps/plugin-stronghold`) plutôt que de ré-exposer des commandes Rust customs. Ça réduit la surface Rust et évite une double-couche d'API.

**Décision d'archi pour Phase 1 :** les commandes `generate_machine_id` / `get_machine_id` côté Rust **deviennent un wrapper simple** qui appelle le store via la lib Rust Stronghold directement. Ça donne :

```rust
use crate::core::stronghold::Password;
use crate::errors::AppError;
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;

const STORE_CLIENT: &[u8] = b"linkdesk-client";
const STORE_KEY_MACHINE_ID: &[u8] = b"machine_id";

/// Returns the persisted machine UUID, generating and storing it if absent.
/// Idempotent: subsequent calls return the same UUID for a given installation.
#[tauri::command]
pub async fn get_machine_id(
    app: AppHandle,
    password: State<'_, Password>,
) -> Result<String, AppError> {
    let stronghold = app
        .try_state::<tauri_plugin_stronghold::Stronghold>()
        .ok_or_else(|| AppError::InvalidState("stronghold plugin not initialized".into()))?;

    // Load or create the client, then read the store entry.
    let client = stronghold
        .load_client(STORE_CLIENT)
        .or_else(|_| stronghold.create_client(STORE_CLIENT))
        .map_err(|e| AppError::Stronghold(e.to_string()))?;

    let store = client.store();

    if let Some(existing) = store
        .get(STORE_KEY_MACHINE_ID)
        .map_err(|e| AppError::Stronghold(e.to_string()))?
    {
        return String::from_utf8(existing)
            .map_err(|e| AppError::Stronghold(format!("invalid utf8: {e}")));
    }

    // No existing id - generate, persist, return.
    let new_id = Uuid::new_v4().to_string();
    store
        .insert(STORE_KEY_MACHINE_ID.to_vec(), new_id.as_bytes().to_vec(), None)
        .map_err(|e| AppError::Stronghold(e.to_string()))?;

    // Persist snapshot to disk with our derived password.
    stronghold
        .save(&password.0)
        .map_err(|e| AppError::Stronghold(e.to_string()))?;

    Ok(new_id)
}

/// Forces regeneration of the machine id (used for testing / reset flows).
/// Not called in normal flow - `get_machine_id` is idempotent.
#[tauri::command]
pub async fn generate_machine_id(
    app: AppHandle,
    password: State<'_, Password>,
) -> Result<String, AppError> {
    let stronghold = app
        .try_state::<tauri_plugin_stronghold::Stronghold>()
        .ok_or_else(|| AppError::InvalidState("stronghold plugin not initialized".into()))?;

    let client = stronghold
        .load_client(STORE_CLIENT)
        .or_else(|_| stronghold.create_client(STORE_CLIENT))
        .map_err(|e| AppError::Stronghold(e.to_string()))?;

    let store = client.store();
    let new_id = Uuid::new_v4().to_string();

    store
        .insert(STORE_KEY_MACHINE_ID.to_vec(), new_id.as_bytes().to_vec(), None)
        .map_err(|e| AppError::Stronghold(e.to_string()))?;
    stronghold
        .save(&password.0)
        .map_err(|e| AppError::Stronghold(e.to_string()))?;

    Ok(new_id)
}
```

> **⚠️ API exacte à vérifier avec Context7** : `Stronghold::load_client`, `.store()`, `.get()`, `.insert()`, `.save()` — les noms et signatures peuvent différer. Si l'API diffère, adapter le corps mais garder la sémantique :
> 1. `get_machine_id()` retourne UUID persistant (idempotent)
> 2. `generate_machine_id()` force une nouvelle écriture

- [ ] **Step 4 : Mettre à jour `capabilities/default.json`**

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Default permissions for LinkDesk desktop app",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "shell:allow-open",
    "stronghold:default"
  ]
}
```

- [ ] **Step 5 : Vérifier compilation + smoke test manuel**

```bash
cd desktop-app
npm run tauri dev
```

Expected : app démarre. Ouvrir les DevTools (F12 sur Windows / Cmd+Opt+I sur macOS) et taper dans la console :
```javascript
await window.__TAURI__.core.invoke("get_machine_id")
```
→ doit retourner un UUID v4 (ex: `"3f2e8b1a-..."`).

Relancer la même commande → doit retourner **le même** UUID (persistance).

- [ ] **Step 6 : `cargo clippy` clean**

```bash
cd desktop-app/src-tauri
cargo clippy --all-targets -- -D warnings
cd ../..
```

- [ ] **Step 7 : Commit**

```bash
git add desktop-app/src-tauri
git commit -m "feat(rust): persist machine id via tauri stronghold plugin"
```

---

## Task 9 : Wrappers Tauri côté TS + hook `useMachineId`

**Context7 check :** `query-docs` sur `@tauri-apps/api/core` pour `invoke()`.

**Files :**
- Create : `desktop-app/src/types/tauri-commands.ts`
- Create : `desktop-app/src/lib/tauri.ts`
- Create : `desktop-app/src/features/machine-id/machine-id.types.ts`
- Create : `desktop-app/src/features/machine-id/use-machine-id.ts`

- [ ] **Step 1 : Installer la lib `@tauri-apps/api` si absente**

```bash
cd desktop-app
npm install @tauri-apps/api
```

(Déjà installé par le scaffolder en Task 2, la commande sera idempotente.)

- [ ] **Step 2 : Types miroir des commandes Rust**

`desktop-app/src/types/tauri-commands.ts` :
```typescript
// Mirror of Rust command signatures. Any change on the Rust side
// MUST be reflected here - there is no codegen for Tauri commands.
export interface TauriCommandMap {
  get_machine_id: {
    args: Record<string, never>;
    result: string; // UUID v4
  };
  generate_machine_id: {
    args: Record<string, never>;
    result: string;
  };
  generate_pin_native: {
    args: Record<string, never>;
    result: string; // raw 9 digits, unformatted
  };
}

// Shape matching AppError serialization (see errors.rs).
export interface TauriError {
  kind: "Stronghold" | "InvalidState" | "Io";
  message: string;
}
```

- [ ] **Step 3 : Wrapper typé `lib/tauri.ts`**

```typescript
import { invoke } from "@tauri-apps/api/core";
import type { TauriCommandMap, TauriError } from "@/types/tauri-commands";

type CommandName = keyof TauriCommandMap;

// Typed wrapper around invoke(). All frontend access to Rust goes through here
// (DEV-RULES §5: no raw invoke() in components).
export async function tauriInvoke<K extends CommandName>(
  name: K,
  args?: TauriCommandMap[K]["args"],
): Promise<TauriCommandMap[K]["result"]> {
  return invoke<TauriCommandMap[K]["result"]>(name, args as Record<string, unknown>);
}

// Narrows an unknown caught value into a TauriError when possible.
export function isTauriError(value: unknown): value is TauriError {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    "message" in value
  );
}
```

- [ ] **Step 4 : Types `machine-id.types.ts`**

```typescript
export interface MachineIdState {
  id: string | null;
  isLoading: boolean;
  error: string | null;
}
```

- [ ] **Step 5 : Hook `useMachineId`**

`desktop-app/src/features/machine-id/use-machine-id.ts` :
```typescript
import { useEffect, useState } from "react";
import { tauriInvoke, isTauriError } from "@/lib/tauri";
import type { MachineIdState } from "./machine-id.types";

// Fetches the persistent machine UUID on mount.
// Idempotent: the Rust command generates-on-miss, so repeat calls are safe.
export function useMachineId(): MachineIdState {
  const [state, setState] = useState<MachineIdState>({
    id: null,
    isLoading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    tauriInvoke("get_machine_id")
      .then((id) => {
        if (!cancelled) setState({ id, isLoading: false, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = isTauriError(err) ? err.message : String(err);
        setState({ id: null, isLoading: false, error: message });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
```

- [ ] **Step 6 : Vérifier le typecheck**

```bash
npm run typecheck
```

Expected : 0 erreur.

- [ ] **Step 7 : Commit**

```bash
git add desktop-app/src/types desktop-app/src/lib/tauri.ts desktop-app/src/features/machine-id
git commit -m "feat(frontend): add typed tauri wrapper and useMachineId hook"
```

---

## Task 10 : Écran d'accueil (`HomeRoute` + `HeroButtons`)

**Files :**
- Create : `desktop-app/src/components/hero-buttons.tsx`
- Modify : `desktop-app/src/routes/home.tsx`

- [ ] **Step 1 : Créer `components/hero-buttons.tsx`**

```tsx
import { Monitor, MousePointer2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

// Two mutually exclusive CTAs that split the home screen (PRD §2 / §4 Module 4).
// Green = share (passive action). Blue = take control (active action).
export function HeroButtons() {
  const navigate = useNavigate();

  return (
    <div className="grid w-full max-w-4xl gap-6 md:grid-cols-2">
      <HeroCta
        onClick={() => navigate("/host")}
        className="bg-primary hover:bg-primary/90 text-primary-foreground"
        icon={<Monitor className="size-12" aria-hidden />}
        title="Partager mon écran"
        subtitle="Obtenez un code à communiquer à la personne qui va vous dépanner."
      />
      <HeroCta
        onClick={() => navigate("/controller")}
        className="bg-secondary hover:bg-secondary/90 text-secondary-foreground"
        icon={<MousePointer2 className="size-12" aria-hidden />}
        title="Prendre le contrôle"
        subtitle="Saisissez le code fourni par la personne que vous allez dépanner."
      />
    </div>
  );
}

interface HeroCtaProps {
  onClick: () => void;
  className: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}

function HeroCta({ onClick, className, icon, title, subtitle }: HeroCtaProps) {
  return (
    <Button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-auto flex-col items-start gap-3 rounded-2xl p-8 text-left whitespace-normal",
        className,
      )}
    >
      <span aria-hidden>{icon}</span>
      <span className="text-2xl font-semibold">{title}</span>
      <span className="text-sm font-normal opacity-90">{subtitle}</span>
    </Button>
  );
}
```

- [ ] **Step 2 : Remplacer `routes/home.tsx`**

```tsx
import { HeroButtons } from "@/components/hero-buttons";

// Cold-start landing screen - PRD §7.
// Accessible via Tab (HeroButtons renders focusable <Button> elements).
export function HomeRoute() {
  return (
    <main
      data-testid="home-route"
      className="flex min-h-screen flex-col items-center justify-center gap-12 bg-background p-8"
    >
      <header className="text-center">
        <h1 className="text-4xl font-bold tracking-tight">LinkDesk</h1>
        <p className="mt-2 text-muted-foreground">
          Que souhaitez-vous faire ?
        </p>
      </header>
      <HeroButtons />
    </main>
  );
}
```

- [ ] **Step 3 : Vérifier visuellement**

```bash
npm run tauri dev
```

Expected :
- Écran centré avec titre "LinkDesk" + sous-titre
- 2 boutons côte à côte : vert (gauche, "Partager mon écran") et bleu (droite, "Prendre le contrôle")
- Les 2 boutons sont atteignables au Tab + activables à Entrée
- Clic sur "Partager mon écran" → navigue vers `/host` (écran "Hôte" placeholder visible)
- Revenir en arrière : relancer l'app (pas de bouton back prévu en Phase 1)

- [ ] **Step 4 : Commit**

```bash
git add desktop-app/src/components/hero-buttons.tsx desktop-app/src/routes/home.tsx
git commit -m "feat(ui): add home screen with share/control hero buttons"
```

---

## Task 11 : Écran Hôte (PIN display + timer + régénération + copie)

**Files :**
- Create : `desktop-app/src/components/pin-display.tsx`
- Create : `desktop-app/src/components/pin-timer.tsx`
- Create : `desktop-app/src/components/regenerate-button.tsx`
- Create : `desktop-app/src/components/copy-button.tsx`
- Modify : `desktop-app/src/routes/host.tsx`

- [ ] **Step 1 : `components/pin-display.tsx`**

```tsx
import { cn } from "@/lib/cn";

interface PinDisplayProps {
  pin: string; // Expected format "XXX-XXX-XXX"
  className?: string;
}

// Large monospace display of the rotating PIN.
// Selectable text so users can copy manually (copy-button.tsx also provides a 1-click copy).
export function PinDisplay({ pin, className }: PinDisplayProps) {
  return (
    <p
      aria-label={`Code de connexion : ${pin.replace(/-/g, " ")}`}
      className={cn(
        "select-all font-mono text-6xl font-bold tracking-wider tabular-nums",
        className,
      )}
    >
      {pin}
    </p>
  );
}
```

- [ ] **Step 2 : `components/pin-timer.tsx`**

```tsx
import { cn } from "@/lib/cn";

interface PinTimerProps {
  secondsRemaining: number;
  totalSeconds: number;
  className?: string;
}

// Countdown bar + mm:ss label showing time until the next auto-rotation.
// Color shifts from green to amber to red as expiry approaches.
export function PinTimer({ secondsRemaining, totalSeconds, className }: PinTimerProps) {
  const progress = Math.max(0, Math.min(1, secondsRemaining / totalSeconds));
  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const label = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;

  // Piecewise color: > 50% green, 20-50% amber, < 20% red.
  const barColor =
    progress > 0.5 ? "bg-primary" : progress > 0.2 ? "bg-amber-500" : "bg-destructive";

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full transition-all duration-1000 ease-linear", barColor)}
          style={{ width: `${progress * 100}%` }}
          role="progressbar"
          aria-valuenow={secondsRemaining}
          aria-valuemin={0}
          aria-valuemax={totalSeconds}
          aria-label="Temps restant avant rotation du code"
        />
      </div>
      <span className="font-mono tabular-nums text-sm text-muted-foreground">{label}</span>
    </div>
  );
}
```

- [ ] **Step 3 : `components/regenerate-button.tsx`**

```tsx
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface RegenerateButtonProps {
  onRegenerate: () => void;
}

export function RegenerateButton({ onRegenerate }: RegenerateButtonProps) {
  return (
    <Button variant="outline" onClick={onRegenerate} aria-label="Régénérer le code maintenant">
      <RefreshCw className="mr-2 size-4" aria-hidden />
      Régénérer maintenant
    </Button>
  );
}
```

- [ ] **Step 4 : `components/copy-button.tsx`**

```tsx
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

interface CopyButtonProps {
  value: string;
  label?: string;
}

// Copy-to-clipboard with a 2s success affordance (checkmark + toast).
// Falls back to a toast error if the Clipboard API is blocked.
export function CopyButton({ value, label = "Copier le code" }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast({ title: "Code copié", description: "Vous pouvez le coller maintenant." });
      window.setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast({
        title: "Échec de la copie",
        description: "Sélectionnez le code puis Ctrl+C.",
        variant: "destructive",
      });
    }
  }

  return (
    <Button variant="secondary" onClick={handleCopy} aria-label={label}>
      {copied ? (
        <Check className="mr-2 size-4" aria-hidden />
      ) : (
        <Copy className="mr-2 size-4" aria-hidden />
      )}
      {copied ? "Copié !" : label}
    </Button>
  );
}
```

- [ ] **Step 5 : Remplacer `routes/host.tsx`**

```tsx
import { CopyButton } from "@/components/copy-button";
import { PinDisplay } from "@/components/pin-display";
import { PinTimer } from "@/components/pin-timer";
import { RegenerateButton } from "@/components/regenerate-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePin } from "@/features/pin/use-pin";
import { DEFAULT_PIN_ROTATION_MS } from "@/features/pin/pin.types";

// Host view - shows the rotating PIN the user must share verbally.
// PRD §3 Module 1: 9-digit PIN, 30-min rotation, manual regen invalidates prior.
export function HostRoute() {
  const { session, secondsRemaining, regenerate } = usePin();
  const totalSeconds = Math.round(DEFAULT_PIN_ROTATION_MS / 1000);

  return (
    <main
      data-testid="host-route"
      className="flex min-h-screen items-center justify-center bg-background p-8"
    >
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Votre code de connexion</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Communiquez ce code à la personne qui va se connecter.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-6">
          <PinDisplay pin={session.pin} />
          <PinTimer secondsRemaining={secondsRemaining} totalSeconds={totalSeconds} className="w-full" />
          <div className="flex flex-wrap items-center justify-center gap-3">
            <CopyButton value={session.pin} />
            <RegenerateButton onRegenerate={regenerate} />
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 6 : Vérifier visuellement**

```bash
npm run tauri dev
```

Expected :
- Depuis l'accueil, cliquer "Partager mon écran" → écran Hôte
- PIN "XXX-XXX-XXX" affiché en gros, monospace
- Barre de progression + timer mm:ss (commence proche de 30:00)
- Bouton "Copier le code" → clic → toast "Code copié"
- Bouton "Régénérer maintenant" → clic → nouveau PIN + timer remis à 30:00
- Le timer décroît de 1s/1s

- [ ] **Step 7 : Commit**

```bash
git add desktop-app/src/components desktop-app/src/routes/host.tsx
git commit -m "feat(host): pin display, countdown timer, copy & regenerate"
```

---

## Task 12 : Écran Contrôleur (PIN input 9 cases)

**Files :**
- Create : `desktop-app/src/components/pin-input.tsx`
- Modify : `desktop-app/src/routes/controller.tsx`

- [ ] **Step 1 : `components/pin-input.tsx`**

```tsx
import { useRef } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";

interface PinInputProps {
  value: string; // 0-9 chars, digits only
  onChange: (next: string) => void;
  onComplete?: (full: string) => void; // Called once 9 digits are entered
  disabled?: boolean;
  className?: string;
}

const SLOT_COUNT = 9;
const SEPARATOR_AFTER = new Set([2, 5]); // Visual dash after index 2 and 5

// 9-slot PIN input with auto-advance, backspace navigation and paste support.
// Accepts digits only. On reaching the 9th digit, onComplete fires once.
export function PinInput({ value, onChange, onComplete, disabled, className }: PinInputProps) {
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  const digits = Array.from({ length: SLOT_COUNT }, (_, i) => value[i] ?? "");

  function setDigitAt(index: number, digit: string) {
    const clean = digit.replace(/\D/g, "").slice(0, 1);
    const nextArr = [...digits];
    nextArr[index] = clean;
    const next = nextArr.join("");
    onChange(next);

    if (clean && index < SLOT_COUNT - 1) {
      inputsRef.current[index + 1]?.focus();
    }
    if (next.length === SLOT_COUNT && !next.includes("") && onComplete) {
      onComplete(next);
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
    if (e.key === "ArrowLeft" && index > 0) inputsRef.current[index - 1]?.focus();
    if (e.key === "ArrowRight" && index < SLOT_COUNT - 1) inputsRef.current[index + 1]?.focus();
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, SLOT_COUNT);
    if (!pasted) return;
    onChange(pasted);
    const focusIndex = Math.min(pasted.length, SLOT_COUNT - 1);
    inputsRef.current[focusIndex]?.focus();
    if (pasted.length === SLOT_COUNT && onComplete) {
      onComplete(pasted);
    }
  }

  return (
    <div className={cn("flex items-center justify-center gap-2", className)}>
      {digits.map((digit, i) => (
        <div key={i} className="flex items-center">
          <Input
            ref={(el) => {
              inputsRef.current[i] = el;
            }}
            value={digit}
            onChange={(e) => setDigitAt(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={handlePaste}
            inputMode="numeric"
            autoComplete="off"
            maxLength={1}
            disabled={disabled}
            aria-label={`Chiffre ${i + 1}`}
            className="size-12 text-center text-2xl font-mono tabular-nums"
          />
          {SEPARATOR_AFTER.has(i) && (
            <span aria-hidden className="px-1 text-xl text-muted-foreground">
              -
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2 : Remplacer `routes/controller.tsx`**

```tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { PinInput } from "@/components/pin-input";
import { formatPin } from "@/features/pin/pin-generator";

// Controller view - PIN entry screen.
// Phase 1: `onConnect` is a no-op that just echoes the PIN in a toast.
// Phase 3 will wire this to the signaling + WebRTC handshake.
export function ControllerRoute() {
  const [pin, setPin] = useState("");
  const { toast } = useToast();

  const complete = pin.length === 9 && /^\d{9}$/.test(pin);

  function handleConnect() {
    if (!complete) return;
    toast({
      title: "Code saisi",
      description: `Connexion simulée avec ${formatPin(pin)} (réseau en Phase 3).`,
    });
  }

  return (
    <main
      data-testid="controller-route"
      className="flex min-h-screen items-center justify-center bg-background p-8"
    >
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Saisissez le code</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Entrez les 9 chiffres communiqués par la personne que vous allez dépanner.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-6">
          <PinInput value={pin} onChange={setPin} onComplete={() => undefined} />
          <Button
            size="lg"
            onClick={handleConnect}
            disabled={!complete}
            className="min-w-48"
          >
            Se connecter
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 3 : Vérifier visuellement**

```bash
npm run tauri dev
```

Expected :
- Depuis l'accueil, "Prendre le contrôle" → écran Contrôleur
- 9 cases monospace séparées par deux tirets visuels (après les indices 2 et 5)
- Frappe d'un chiffre → avance automatiquement à la case suivante
- Backspace sur case vide → recule à la précédente
- Ctrl+V d'un texte "123456789" → remplit les 9 cases d'un coup
- Bouton "Se connecter" désactivé tant que les 9 cases ne sont pas remplies
- Bouton activé → clic → toast "Code saisi / Connexion simulée avec 123-456-789"

- [ ] **Step 4 : Commit**

```bash
git add desktop-app/src/components/pin-input.tsx desktop-app/src/routes/controller.tsx
git commit -m "feat(controller): 9-slot pin input with auto-advance and paste"
```

---

## Task 13 : Branchement `useMachineId` + fin de phase

**Files :**
- Modify : `desktop-app/src/App.tsx` (fetch machine id au boot pour forcer la création Stronghold)
- Modify : `desktop-app/README.md` (quick start Phase 1)
- Modify : `CHANGELOG.md` (entrée Phase 1)
- Modify : `desktop-app/.env.example` (placeholder pour Phase 2)

- [ ] **Step 1 : Forcer l'appel `get_machine_id` au boot**

Modifier `desktop-app/src/App.tsx` :

```tsx
import { useEffect } from "react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { HomeRoute } from "@/routes/home";
import { HostRoute } from "@/routes/host";
import { ControllerRoute } from "@/routes/controller";
import { Toaster } from "@/components/ui/toaster";
import { useMachineId } from "@/features/machine-id/use-machine-id";
import "./index.css";

const router = createMemoryRouter(
  [
    { path: "/", element: <HomeRoute /> },
    { path: "/host", element: <HostRoute /> },
    { path: "/controller", element: <ControllerRoute /> },
  ],
  { initialEntries: ["/"] },
);

export default function App() {
  // Fires the Tauri command that generates-or-reads the persistent machine id.
  // The UUID itself is never shown to the user (PRD §3 Module 1).
  const machine = useMachineId();

  // Log once in dev to confirm persistence. Removed before v1.0 (DEV-RULES §10).
  useEffect(() => {
    if (import.meta.env.DEV && machine.id) {
      // eslint-disable-next-line no-console
      console.debug("[linkdesk] machine id ready");
    }
  }, [machine.id]);

  return (
    <>
      <RouterProvider router={router} />
      <Toaster />
    </>
  );
}
```

- [ ] **Step 2 : Créer `.env.example`**

```env
# LinkDesk - desktop-app environment (Vite-exposed vars need the VITE_ prefix).

# Signaling server URL (used from Phase 2 onward).
# Default: local dev server spun up by signaling-server workspace.
VITE_SIGNALING_WS_URL=ws://localhost:3001/signaling

# STUN servers for WebRTC (used from Phase 3 onward).
VITE_STUN_SERVERS=stun:stun.l.google.com:19302
```

- [ ] **Step 3 : Mettre à jour `desktop-app/README.md`**

```markdown
# LinkDesk — desktop-app

Application Tauri 2.x client (host + controller).

## Prérequis

- Rust stable 1.77+
- Node 20 LTS
- Dépendances système Tauri selon OS : https://v2.tauri.app/start/prerequisites/

## Dev

```bash
npm install
npm run tauri dev
```

## Build

```bash
npm run tauri build
```

## Tests

```bash
npm test          # Vitest
npm run typecheck
npm run lint
cargo clippy --all-targets -- -D warnings --manifest-path src-tauri/Cargo.toml
```

## Phase 1 — implémenté

- Monorepo npm workspaces
- Scaffolding Tauri 2.x + React 18 + TypeScript strict
- Tailwind 3.x + shadcn/ui (theme clair/sombre)
- React Router 6 en mode memory
- Générateur PIN CSPRNG (frontend) + commande native Rust (OsRng)
- Persistence machine id via Tauri Stronghold
- 3 écrans : Accueil · Hôte (PIN rotatif 30 min, copie, régénération) · Contrôleur (saisie 9 cases)

Aucune logique réseau à ce stade.
```

- [ ] **Step 4 : Mettre à jour `CHANGELOG.md` racine**

Remplacer la section `## [Unreleased]` par :

```markdown
## [Unreleased]

## [0.1.0] — 2026-04-18 — Phase 1 : Setup & UI statique

### Added
- Init monorepo npm workspaces (`desktop-app`, `signaling-server` réservé)
- Scaffolding Tauri 2.x + React 18 + TypeScript strict + Vite
- Tailwind 3.x + shadcn/ui (button, card, input, dialog, toast)
- React Router 6 (memory mode)
- Générateur PIN CSPRNG frontend + commande Rust `generate_pin_native`
- Commandes Rust `get_machine_id` / `generate_machine_id` via tauri-plugin-stronghold
- Hook `usePin` : rotation automatique 30 min, countdown, régénération manuelle
- Hook `useMachineId` : fetch UUID persistant au boot
- Écran Accueil (HeroButtons vert/bleu)
- Écran Hôte (PinDisplay + PinTimer + CopyButton + RegenerateButton)
- Écran Contrôleur (PinInput 9 cases auto-focus + paste)
- Tests Vitest : `pin-generator.test.ts`, `use-pin.test.tsx`, `app.test.tsx`
```

- [ ] **Step 5 : Exécuter le checklist de fin de phase (DEV-RULES §11)**

Dans l'ordre strict :

1) Build frontend :
```bash
cd desktop-app
npm run build
```
Expected : `dist/` généré, 0 erreur.

2) Build Tauri complet :
```bash
npm run tauri build
```
Expected : bundle `src-tauri/target/release/bundle/` généré (MSI sur Windows, DMG sur macOS). Peut être long (~5 min premier build).

3) Lint TS :
```bash
npm run lint
```
Expected : 0 warning.

4) Typecheck :
```bash
npm run typecheck
```
Expected : 0 erreur.

5) Lint Rust :
```bash
cd src-tauri
cargo clippy --all-targets -- -D warnings
cd ..
```
Expected : 0 warning.

6) Tests frontend :
```bash
npm test
```
Expected : tous verts (≥ 9 tests entre `pin-generator`, `use-pin`, `app`).

7) Tests Rust (pas de tests Rust spécifiques en Phase 1, mais vérifier que `cargo test` compile) :
```bash
cd src-tauri
cargo test
cd ..
```
Expected : 0 test fail (0 ou quelques tests default Tauri).

8) Vérification manuelle end-to-end :
   - Lancer `npm run tauri dev`
   - Accueil s'affiche avec les 2 CTAs
   - Clic "Partager mon écran" → écran Hôte affiche un PIN XXX-XXX-XXX + timer qui décroît
   - "Régénérer" → nouveau PIN, timer reset
   - "Copier" → toast + PIN dans le clipboard (tester avec Ctrl+V ailleurs)
   - Relancer l'app → le machine id reste le même (ouvrir DevTools, `invoke("get_machine_id")` retourne la même valeur)
   - Retour accueil (relancer), clic "Prendre le contrôle" → écran Contrôleur
   - Saisir 9 chiffres → auto-advance OK
   - Paste d'une string numérique → remplissage OK
   - Bouton "Se connecter" → toast "Connexion simulée"
   - Navigation clavier Tab complète

- [ ] **Step 6 : Commit de fin de phase**

```bash
git add .
git commit -m "chore: complete phase 1"
```

- [ ] **Step 7 : Tag Git**

```bash
git tag v0.1-setup
git push origin master
git push --tags
```

- [ ] **Step 8 : Rédiger le rapport de phase**

Créer `docs/superpowers/reports/2026-04-18-phase-1-report.md` avec le template DEV-RULES §11 :

```markdown
## Rapport Phase 1 — Setup & UI statique

### Implémenté
- Monorepo npm workspaces
- Tauri 2.x + React 18 + TS strict + Vite + Tailwind + shadcn/ui
- Générateur PIN CSPRNG (frontend + Rust)
- Persistence machine id via Stronghold
- Hooks `usePin` (rotation 30 min) et `useMachineId`
- 3 écrans : Accueil, Hôte, Contrôleur

### Non implémenté (et pourquoi)
- Logique réseau : hors scope Phase 1 (prévu Phase 2+)
- Commandes Rust `inject_*`, `show_consent_dialog`, overlay : Phase 3/4
- Tests composants React : volontairement minimaux (PRD §8 stratégie MVP)

### Problèmes rencontrés
- [À remplir par l'exécuteur]

### Recommandations Phase 2
- Confirmer le choix de port pour le signaling server (3001 proposé)
- Valider le schéma WS avec Zod avant de commencer le handler
- Préparer le wrapping Stronghold pour persister les logs de session (Phase 5)

### Métriques
- Taille bundle release : [à mesurer]
- Temps de démarrage à froid : [à mesurer]
- RAM au repos : [à mesurer]
```

- [ ] **Step 9 : Commit du rapport**

```bash
git add docs/superpowers/reports/2026-04-18-phase-1-report.md
git commit -m "docs: add phase 1 completion report"
git push
```

---

## Self-review (writing-plans skill §Self-Review)

### 1. Couverture du PRD Phase 1

| PRD Phase 1 item | Tâche qui le couvre |
|---|---|
| Init Tauri 2.x + React + TS + Tailwind | Task 2, 3 |
| Config shadcn/ui (button, card, input, dialog, toast) | Task 3 |
| Génération ID machine persistant (Stronghold) | Task 7, 8, 9 |
| Génération PIN rotatif 30 min (timer visible) | Task 5, 6, 11 |
| Écran d'accueil 2 boutons | Task 10 |
| Écran Hôte (PIN + timer + régénération) | Task 11 |
| Écran Contrôleur (input PIN 9 chiffres) | Task 12 |
| Aucune logique réseau | Respecté par omission |
| Tag `v0.1-setup` | Task 13 |

### 2. Placeholders

Aucun `TBD`, `TODO`, `implement later` ou "similar to X". Les seuls "stubs" explicites sont les commandes Rust en Task 7 remplacées intégralement en Task 8 — le code final est fourni.

### 3. Cohérence de typage

- `usePin` retourne `{ session, secondsRemaining, regenerate }` (Task 6) → consommé tel quel en Task 11 ✅
- `generatePin()` / `formatPin()` / `parsePin()` (Task 5) → `formatPin` utilisé en Task 12 ✅
- `tauriInvoke<"get_machine_id">()` (Task 9) → retourne `string` → consommé par `useMachineId` (Task 9) et `App.tsx` (Task 13) ✅
- `Pin` type (Task 5) → utilisé par `PinDisplay` props (Task 11) comme `string` (alias) ✅
- `AppError` Rust (Task 7) sérialisé en `{kind, message}` → mappé par `TauriError` et `isTauriError` (Task 9) ✅

### 4. Points d'attention pour l'exécuteur

1. **Stronghold API (Task 8)** — probable point de friction. Contexte : la version 2.x du plugin a changé par rapport à la 1.x. **Obligation :** passer par Context7 avant d'écrire une ligne. Si l'API diffère substantiellement du snippet fourni, adapter en gardant la sémantique (get idempotent, generate force réécriture).

2. **shadcn CLI (Task 3)** — peut demander le nom du fichier utils. Si le CLI impose `@/lib/utils` au lieu de `@/lib/cn`, accepter et re-exporter depuis `cn.ts` OU renommer et mettre à jour les imports partout.

3. **Vérification manuelle en Task 13 Step 5.8** — critique. Si un point échoue, **ne pas continuer** sur les commits de fin : corriger d'abord.

---

**Fin du plan Phase 1.**
