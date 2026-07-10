# TTV 97 Kamenz e.V. – Dashboard der 3. Mannschaft

## 1. Neues GitHub-Repository anlegen
1. Auf [github.com](https://github.com) mit deinem bestehenden Account einloggen
2. Oben rechts **"+" → "New repository"**
3. Name z. B. `ttv-kamenz-dashboard` (wenn du einen anderen Namen wählst, passe ihn in
   `vite.config.js` bei `base:` entsprechend an!)
4. Sichtbarkeit: **Private** empfohlen, solange Spielerdaten drin sind
5. Ohne README/​.gitignore erstellen (haben wir schon dabei) → **Create repository**

## 2. Projekt hochladen
Am einfachsten direkt im Browser:
1. Im neuen, leeren Repo auf **"uploading an existing file"** klicken
2. Alle Dateien/Ordner aus diesem Projekt-Paket hineinziehen (auch versteckte Ordner wie
   `.github` – ggf. über die Desktop-Oberfläche oder `git` hochladen, da manche Browser
   versteckte Ordner beim Drag&Drop überspringen)
3. Commit-Nachricht z. B. "Erstes Projekt-Setup" → **Commit changes**

Alternativ über die Kommandozeile (falls du `git` installiert hast):
```bash
cd ttv-kamenz-projekt
git init
git add .
git commit -m "Erstes Projekt-Setup"
git branch -M main
git remote add origin https://github.com/DEIN-GITHUB-NAME/ttv-kamenz-dashboard.git
git push -u origin main
```

## 3. GitHub Pages aktivieren
1. Im Repo: **Settings → Pages**
2. Bei **"Build and deployment" → Source** auf **"GitHub Actions"** stellen (nicht "Deploy from a branch")
3. Nach dem nächsten Push läuft der Workflow automatisch (sichtbar unter dem Reiter **Actions**)
   und die Seite ist danach unter `https://DEIN-GITHUB-NAME.github.io/ttv-kamenz-dashboard/` erreichbar

## 4. Lokal testen (optional, aber empfehlenswert vor dem Hochladen)
```bash
npm install
npm run dev
```
Öffnet die App unter `http://localhost:5173`.

## 5. Supabase-Zugangsdaten
Die Supabase-URL und der anon key sind bereits fest in `src/App.jsx` eingetragen
(das ist bei Supabase so vorgesehen – die eigentliche Absicherung läuft über
Row Level Security in der Datenbank, siehe `auth_schema.sql` und
`schema_saison_tabelle.sql` aus dem Chat).

## Projektstruktur
```
├── index.html
├── package.json
├── vite.config.js        ← "base" ggf. an deinen Repo-Namen anpassen
├── tailwind.config.js
├── postcss.config.js
├── .github/workflows/deploy.yml   ← automatisches Deployment
└── src/
    ├── main.jsx
    ├── index.css
    └── App.jsx            ← das eigentliche Dashboard
```
