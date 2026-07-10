import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// WICHTIG: "base" muss exakt dem Namen deines GitHub-Repos entsprechen,
// z.B. wenn dein Repo "ttv-kamenz-dashboard" heißt und unter
// https://DEIN-GITHUB-NAME.github.io/ttv-kamenz-dashboard/ erreichbar sein soll.
// Falls du das Repo anders nennst, hier den Namen anpassen!
export default defineConfig({
  plugins: [react()],
  base: "/ttv-kamenz-dashboard/",
});
