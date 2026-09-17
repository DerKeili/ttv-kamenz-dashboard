import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

// WICHTIG: "base" muss exakt dem Namen deines GitHub-Repos entsprechen,
// z.B. wenn dein Repo "ttv-kamenz-dashboard" heißt und unter
// https://DEIN-GITHUB-NAME.github.io/ttv-kamenz-dashboard/ erreichbar sein soll.
// Falls du das Repo anders nennst, hier den Namen anpassen!

// Bei jedem Build ein neuer Stempel. Er wird in den Code eingebacken UND als
// version.json abgelegt, damit die laufende App erkennen kann, dass es eine
// neuere Fassung gibt. Ohne das bleiben Geräte mit der App auf dem
// Home-Bildschirm auf einer alten index.html sitzen.
const version = new Date().toISOString();

function versionsDatei() {
  return {
    name: "versionsdatei",
    closeBundle() {
      writeFileSync(resolve("dist", "version.json"), JSON.stringify({ version }, null, 2));
    },
  };
}

export default defineConfig({
  plugins: [react(), versionsDatei()],
  base: "/ttv-kamenz-dashboard/",
  define: { __APP_VERSION__: JSON.stringify(version) },
});
