import React, { useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";
import logoKlein from "./logo-klein.png";
import logoM1 from "./logo-m1.png";
import logoM2 from "./logo-m2.png";
import logoM3 from "./logo-m3.png";

// Jede Mannschaft hat ihr eigenes Logo. Zugeordnet wird über die Rangstufe,
// damit es auch stimmt, wenn eine Mannschaft mal umbenannt wird.
const MANNSCHAFTS_LOGOS = { 1: logoM1, 2: logoM2, 3: logoM3 };

function logoFuerMannschaft(mannschaft) {
  return MANNSCHAFTS_LOGOS[mannschaft?.hierarchie_stufe] ?? null;
}
import {
  LayoutDashboard, Table2, CalendarDays, Users, MessageSquare,
  Settings, Bell, ChevronRight, Check, X, HelpCircle, Cake,
  Trophy, AlertTriangle, Vote, GraduationCap, Menu, LogOut, ShieldCheck, Award,
  UserPlus, KeyRound, Eye, EyeOff, Plus, Pencil, Trash2, CalendarPlus, Send, ArrowLeft, Shield, Sparkles,
  CalendarClock, Clock, Newspaper, Lock, Unlock, Mail
} from "lucide-react";

/* ------------------------------------------------------------------
   TTV 97 Kamenz e.V. — Die 3. Mannschaft
   Echte Supabase-Anbindung: Auth, Rollen, Tabelle, Kader, Kalender,
   Spielerplanung. Keine Testdaten mehr — alles kommt aus der Datenbank.
   Läuft nur in einem echten React-Build (npm install @supabase/supabase-js),
   nicht in der reinen Chat-Vorschau.
------------------------------------------------------------------- */

// Diese beiden Werte sind bewusst öffentlich im Frontend – die eigentliche
// Absicherung passiert über Row Level Security in Supabase, nicht über Geheimhaltung.
const SUPABASE_URL = "https://oskplsznrhpcfvoogcup.supabase.co";

const supabase = createClient(
  SUPABASE_URL,
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9za3Bsc3pucmhwY2Z2b29nY3VwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyNzU3NzksImV4cCI6MjA5ODg1MTc3OX0.x8aWcUz2MNLjfy_YZ4RvQtk6zWbHlvmrMdTrBPC0pFs"
);

const COLORS = {
  petrolDark: "#0F2E2A",
  petrol: "#1B5951",
  petrolLight: "#2E7A6E",
  orange: "#E2632B",
  orangeDeep: "#B84A1C",
  anthracite: "#26251F",
  paper: "#F8F6F1",
  // Eigene Farbwelt für Terminkonflikte — bewusst NICHT orange,
  // damit "Terminüberschneidung" nie mit "zu wenige Zusagen" verwechselt wird.
  konflikt: "#5B4B9E",
  konfliktDunkel: "#3D3272",
  konfliktHell: "#ECE9F7",
};

/* ---------- Hilfsfunktionen ---------- */

// Sortiert Mannschaften zuverlässig nach Rangstufe (1 = höchste Mannschaft), egal was die DB liefert
const LEITER_RAENGE = ["Mannschaftsführer", "stellv. Mannschaftsführer"];

// Ist der Nutzer Mannschaftsführer oder stellv. Mannschaftsführer (irgendeiner Mannschaft)?
function istTeamLeiter(profil) {
  return LEITER_RAENGE.includes(profil?.rang);
}

// Darf der Nutzer Inhalte für GENAU diese Mannschaft verwalten (anlegen/bearbeiten/aktualisieren)?
function darfMannschaftVerwalten(profil, mannschaftId) {
  if (!mannschaftId) return !!profil?.ist_admin;
  return !!profil?.ist_admin || (istTeamLeiter(profil) && profil?.mannschaft_id === mannschaftId);
}

// Turniere sind mannschaftsübergreifend -> Admin oder irgendein Team-Leiter darf verwalten
function darfTurniereVerwalten(profil) {
  return !!profil?.ist_admin || istTeamLeiter(profil);
}

function mehrheitSaetze(saetzeProSpiel) {
  return Math.ceil(saetzeProSpiel / 2);
}

function berechneMatchAusSaetzen(saetze) {
  let a = 0, b = 0;
  saetze.forEach((s) => {
    if (Number(s.a) > Number(s.b)) a++;
    else if (Number(s.b) > Number(s.a)) b++;
  });
  return { saetze_a: a, saetze_b: b };
}

// Ein Satz ist erst abgeschlossen, wenn eine Seite mind. 11 Punkte UND mind. 2 Punkte Vorsprung hat
function istSatzGueltig(satz) {
  const a = Number(satz.a), b = Number(satz.b);
  if (satz.a === "" || satz.b === "" || Number.isNaN(a) || Number.isNaN(b)) return false;
  return Math.max(a, b) >= 11 && Math.abs(a - b) >= 2;
}

// Vereinfachtes Schweizer System: nach Punkten sortieren, dann von oben nach unten
// den nächsten noch nicht gespielten Gegner zuweisen. Bei ungerader Anzahl: Freilos
// an den zuletzt platzierten Teilnehmer ohne bisheriges Freilos.
function schweizerPaarung(teilnehmerMitStats, bereitsGespielt, bereitsFreilos) {
  const sortiert = [...teilnehmerMitStats].sort(
    (a, b) => b.siege - a.siege || b.buchholz - a.buchholz || Math.random() - 0.5
  );

  let freilos = null;
  const uebrig = [...sortiert];
  if (uebrig.length % 2 === 1) {
    for (let i = uebrig.length - 1; i >= 0; i--) {
      if (!bereitsFreilos.has(uebrig[i].id)) {
        freilos = uebrig.splice(i, 1)[0];
        break;
      }
    }
    if (!freilos) freilos = uebrig.pop();
  }

  const paarungen = [];
  while (uebrig.length > 0) {
    const erster = uebrig.shift();
    let idx = uebrig.findIndex((p) => !bereitsGespielt.has([erster.id, p.id].sort().join("|")));
    if (idx === -1) idx = 0;
    const partner = uebrig.splice(idx, 1)[0];
    paarungen.push([erster, partner]);
  }
  return { paarungen, freilos };
}

function berechneEinzelTabelle(teilnehmerIds, spiele, spielerNamen) {
  const stats = {};
  teilnehmerIds.forEach((id) => {
    stats[id] = { id, name: spielerNamen[id] ?? "?", siege: 0, niederlagen: 0, saetzeFuer: 0, saetzeGegen: 0, ballFuer: 0, ballGegen: 0, gegner: [] };
  });
  spiele.filter((s) => s.gespielt).forEach((s) => {
    if (s.ist_freilos) {
      const id = s.spieler_a_id ?? s.spieler_b_id;
      if (stats[id]) stats[id].siege += 1;
      return;
    }
    const a = stats[s.spieler_a_id], b = stats[s.spieler_b_id];
    if (!a || !b) return;
    a.saetzeFuer += s.saetze_a; a.saetzeGegen += s.saetze_b;
    b.saetzeFuer += s.saetze_b; b.saetzeGegen += s.saetze_a;
    (s.saetze || []).forEach((set) => { a.ballFuer += Number(set.a); a.ballGegen += Number(set.b); b.ballFuer += Number(set.b); b.ballGegen += Number(set.a); });
    if (s.saetze_a > s.saetze_b) { a.siege++; b.niederlagen++; } else { b.siege++; a.niederlagen++; }
    a.gegner.push(s.spieler_b_id); b.gegner.push(s.spieler_a_id);
  });
  const liste = Object.values(stats);
  liste.forEach((sp) => { sp.buchholz = sp.gegner.reduce((sum, gid) => sum + (stats[gid]?.siege ?? 0), 0); });
  liste.sort((x, y) =>
    y.siege - x.siege ||
    y.buchholz - x.buchholz ||
    (y.saetzeFuer - y.saetzeGegen) - (x.saetzeFuer - x.saetzeGegen) ||
    (y.ballFuer - y.ballGegen) - (x.ballFuer - x.ballGegen)
  );
  return liste;
}

function berechneDoppelTabelle(paare, spiele) {
  const stats = {};
  paare.forEach((p) => { stats[p.id] = { id: p.id, name: p.name, siege: 0, niederlagen: 0, saetzeFuer: 0, saetzeGegen: 0, ballFuer: 0, ballGegen: 0 }; });
  spiele.filter((s) => s.gespielt && !s.ist_freilos).forEach((s) => {
    const a = stats[s.paar_a_id], b = stats[s.paar_b_id];
    if (!a || !b) return;
    a.saetzeFuer += s.saetze_a; a.saetzeGegen += s.saetze_b;
    b.saetzeFuer += s.saetze_b; b.saetzeGegen += s.saetze_a;
    (s.saetze || []).forEach((set) => { a.ballFuer += Number(set.a); a.ballGegen += Number(set.b); b.ballFuer += Number(set.b); b.ballGegen += Number(set.a); });
    if (s.saetze_a > s.saetze_b) { a.siege++; b.niederlagen++; } else { b.siege++; a.niederlagen++; }
  });
  const liste = Object.values(stats);
  liste.sort((x, y) => y.siege - x.siege || (y.saetzeFuer - y.saetzeGegen) - (x.saetzeFuer - x.saetzeGegen) || (y.ballFuer - y.ballGegen) - (x.ballFuer - x.ballGegen));
  return liste;
}

function sortiereMannschaften(liste) {
  return [...(liste ?? [])].sort((a, b) => (a.hierarchie_stufe ?? 999) - (b.hierarchie_stufe ?? 999));
}

/* ---------- Automatische Aktualisierung (Tabelle & Ergebnisse) ----------
   Beim Öffnen des Reiters bzw. beim Wechsel der Mannschaft/Runde wird automatisch
   beim Verband nachgeschaut. Damit nicht bei jedem Tab-Wechsel neu gescrapt wird,
   merken wir uns pro Saison/Runde den Zeitpunkt des letzten Abrufs (nur im Speicher,
   gilt also für die aktuelle Sitzung). Der Button erzwingt weiterhin sofort. */
const AUTO_AKTUALISIEREN_INTERVALL_MS = 10 * 60 * 1000; // 10 Minuten
const letzteAutoAktualisierung = new Map();

function autoAktualisierungFaellig(schluessel) {
  const zuletzt = letzteAutoAktualisierung.get(schluessel);
  return !zuletzt || Date.now() - zuletzt > AUTO_AKTUALISIEREN_INTERVALL_MS;
}

function autoAktualisierungMerken(schluessel) {
  letzteAutoAktualisierung.set(schluessel, Date.now());
}

function letzterAbrufZeitpunkt(schluessel) {
  const zuletzt = letzteAutoAktualisierung.get(schluessel);
  return zuletzt ? new Date(zuletzt) : null;
}

/* ---------- Spielverlegung ----------
   Das vom Verband gemeldete Datum bleibt in `datum` unangetastet, damit ein
   erneuter Spielplan-Abruf nichts überschreibt. Eine Verlegung wird separat in
   `verlegt` und `verlegt_auf` geführt. Überall, wo es um den tatsächlichen
   Termin geht, wird das effektive Datum verwendet. */

function effektivesSpielDatum(spiel) {
  return spiel?.verlegt_auf ?? spiel?.datum ?? null;
}

// Solange kein Ersatztermin feststeht, kann sich niemand eintragen
function spielGesperrt(spiel) {
  return Boolean(spiel?.verlegt) && !spiel?.verlegt_auf;
}

function wochentagLang(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("de-DE", { weekday: "short" });
}

function uhrzeit(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  // Ohne hinterlegte Anspielzeit steht in der Datenbank Mitternacht — dann lieber nichts anzeigen
  if (d.getHours() === 0 && d.getMinutes() === 0) return "";
  return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) + " Uhr";
}

function formatDatumZeit(iso) {
  if (!iso) return "–";
  return new Date(iso).toLocaleString("de-DE", {
    weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  }) + " Uhr";
}

function formatDatum(iso) {
  if (!iso) return "–";
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/* ---------- Schichtplan ----------
   Spieler können eine wiederkehrende Schichtrotation hinterlegen (z. B. Woche 1 Früh,
   Woche 2 Spät, Woche 3 Nacht). Aus der Startwoche und der Rotationslänge lässt sich
   für jedes beliebige Datum die Schicht ausrechnen. */
const SCHICHT_OPTIONEN = ["Frühschicht", "Spätschicht", "Nachtschicht", "Tagschicht", "Frei"];

const SCHICHT_STIL = {
  "Frühschicht": { background: "#FFF1D6", color: "#8A6100", kuerzel: "Früh" },
  "Spätschicht": { background: "#FBE2DA", color: COLORS.orangeDeep, kuerzel: "Spät" },
  "Nachtschicht": { background: "#E3E0F3", color: COLORS.konfliktDunkel, kuerzel: "Nacht" },
  "Tagschicht": { background: "#E4F2EE", color: COLORS.petrol, kuerzel: "Tag" },
  "Frei": { background: "#F1F1EF", color: "#777", kuerzel: "Frei" },
};

// Montag 00:00 der Woche, in der das Datum liegt
function wochenStart(datum) {
  const d = new Date(datum);
  if (isNaN(d)) return null;
  const versatz = (d.getDay() + 6) % 7; // Montag = 0
  d.setDate(d.getDate() - versatz);
  d.setHours(0, 0, 0, 0);
  return d;
}

function schichtFuerDatum(spieler, datum) {
  const rotation = spieler?.schicht_rotation;
  if (!Array.isArray(rotation) || rotation.length === 0) return null;
  if (!spieler?.schicht_referenzwoche || !datum) return null;
  const start = wochenStart(spieler.schicht_referenzwoche);
  const ziel = wochenStart(datum);
  if (!start || !ziel) return null;
  const wochen = Math.round((ziel.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000));
  const index = ((wochen % rotation.length) + rotation.length) % rotation.length;
  return rotation[index] ?? null;
}

// Darf ich die Schicht dieses Spielers sehen? (eigene immer, fremde nur bei Freigabe)
function schichtSichtbarFuer(spieler, profil) {
  return spieler?.id === profil?.id || spieler?.schicht_sichtbar === true;
}

function naechsterGeburtstag(spielerListe) {
  if (!spielerListe || spielerListe.length === 0) return null;
  const heute = new Date();
  const mitTag = spielerListe
    .filter((s) => s.geburtstag)
    .map((s) => {
      const gd = new Date(s.geburtstag);
      let next = new Date(heute.getFullYear(), gd.getMonth(), gd.getDate());
      if (next < heute) next = new Date(heute.getFullYear() + 1, gd.getMonth(), gd.getDate());
      return { ...s, next };
    });
  mitTag.sort((a, b) => a.next - b.next);
  return mitTag[0] ?? null;
}

/* ---------- Wiederkehrende Bauteile: geneigte "Tischplatten"-Karte ---------- */

function TiltCard({ children, className = "", tone = "petrol" }) {
  const bg =
    tone === "petrol"
      ? `linear-gradient(135deg, ${COLORS.petrolLight}, ${COLORS.petrol} 60%, ${COLORS.petrolDark})`
      : tone === "orange"
      ? `linear-gradient(135deg, #F0895C, ${COLORS.orange} 55%, ${COLORS.orangeDeep})`
      : "#fff";
  return (
    <div
      className={`relative ${className}`}
      style={{
        background: bg,
        clipPath: "polygon(0 14px, 14px 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%)",
      }}
    >
      {children}
    </div>
  );
}

function SectionLabel({ icon: Icon, children }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon size={16} style={{ color: COLORS.orange }} />
      <h3 className="uppercase tracking-wide text-xs font-semibold" style={{ color: COLORS.anthracite, fontFamily: "Oswald, sans-serif", letterSpacing: "0.08em" }}>
        {children}
      </h3>
    </div>
  );
}

function Leerzustand({ text }) {
  return <p className="text-sm text-gray-400 py-4 text-center">{text}</p>;
}

// supabase-js zeigt bei Edge-Function-Fehlern standardmäßig nur "non-2xx status code" an.
// Diese Funktion liest die eigentliche Fehlermeldung aus der Antwort der Funktion aus.
async function echteFehlermeldung(error, data) {
  if (data?.error) return data.error;
  if (error?.context && typeof error.context.json === "function") {
    try {
      const body = await error.context.json();
      if (body?.error) return body.error;
    } catch (_) {
      // Antwort war kein JSON – dann bleibt die generische Meldung
    }
  }
  return error?.message ?? "Unbekannter Fehler";
}

/* ---------- Login ---------- */

const APP_ADRESSE = "https://derkeili.github.io/ttv-kamenz-dashboard/";

function PasswortVergessen({ onZurueck }) {
  const [email, setEmail] = useState("");
  const [gesendet, setGesendet] = useState(false);
  const [ladend, setLadend] = useState(false);
  const [fehler, setFehler] = useState(null);

  async function anfordern() {
    setFehler(null);
    if (!email.trim()) return setFehler("Bitte deine E-Mail-Adresse eingeben.");
    setLadend(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: APP_ADRESSE });
    setLadend(false);
    // Aus Datenschutzgründen bestätigen wir immer gleich — sonst ließe sich hier
    // durchprobieren, welche E-Mail-Adressen im Verein hinterlegt sind.
    if (error && !error.message.toLowerCase().includes("user")) {
      setFehler(error.message);
      return;
    }
    setGesendet(true);
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: `radial-gradient(circle at 30% 20%, ${COLORS.petrol}, ${COLORS.petrolDark})`, fontFamily: "Inter, sans-serif" }}
    >
      <div className="w-full max-w-sm">
        <TiltCard tone="paper" className="p-8 shadow-2xl">
          <h1 className="text-lg font-bold text-center mb-2" style={{ color: COLORS.petrolDark, fontFamily: "Oswald, sans-serif" }}>
            PASSWORT VERGESSEN
          </h1>

          {gesendet ? (
            <>
              <p className="text-sm text-gray-600 mb-4">
                Wenn für diese Adresse ein Zugang besteht, ist die E-Mail unterwegs. Darin findest du einen Link,
                über den du dir ein neues Passwort vergeben kannst. Der Link gilt eine Stunde.
              </p>
              <p className="text-xs text-gray-500 mb-4">
                Nichts angekommen? Schau bitte im Spam-Ordner nach oder wende dich an deinen Mannschaftsführer —
                er kann dir ein neues Passwort einrichten.
              </p>
              <button onClick={onZurueck} className="w-full py-2.5 rounded-md text-white font-semibold text-sm" style={{ background: COLORS.orange, fontFamily: "Oswald, sans-serif" }}>
                ZURÜCK ZUR ANMELDUNG
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-600 mb-4">
                Gib die E-Mail-Adresse ein, mit der du in der App angemeldet bist. Du bekommst dann einen Link zum Zurücksetzen.
              </p>
              <label className="block text-xs font-medium mb-1" style={{ color: COLORS.anthracite }}>E-Mail</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && anfordern()}
                className="w-full border rounded-md px-3 py-2 mb-3 text-sm"
                placeholder="deine@adresse.de"
              />
              {fehler && <p className="text-xs mb-3" style={{ color: COLORS.orangeDeep }}>{fehler}</p>}
              <button
                onClick={anfordern}
                disabled={ladend}
                className="w-full py-2.5 rounded-md text-white font-semibold text-sm"
                style={{ background: COLORS.orange, fontFamily: "Oswald, sans-serif", opacity: ladend ? 0.6 : 1 }}
              >
                {ladend ? "SENDE…" : "LINK ANFORDERN"}
              </button>
              <button onClick={onZurueck} className="w-full text-xs text-center mt-4 text-gray-500 underline">
                Zurück zur Anmeldung
              </button>
            </>
          )}
        </TiltCard>
      </div>
    </div>
  );
}

/* ---------- Neues Passwort nach Klick auf den Rücksetz-Link ---------- */

function PasswortNeuVergeben({ onFertig }) {
  const [neu, setNeu] = useState("");
  const [wiederholung, setWiederholung] = useState("");
  const [zeigen, setZeigen] = useState(false);
  const [fehler, setFehler] = useState(null);
  const [ladend, setLadend] = useState(false);

  async function speichern() {
    setFehler(null);
    if (neu.length < 8) return setFehler("Das neue Passwort muss mindestens 8 Zeichen haben.");
    if (neu !== wiederholung) return setFehler("Die beiden Passwörter stimmen nicht überein.");
    setLadend(true);
    const { error } = await supabase.auth.updateUser({ password: neu });
    if (error) {
      setLadend(false);
      setFehler(error.message);
      return;
    }
    // Der Spieler hat sich selbst ein Passwort gesetzt — die erzwungene Änderung entfällt.
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await supabase.from("profiles").update({ muss_passwort_aendern: false }).eq("id", user.id);
    setLadend(false);
    onFertig();
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: `radial-gradient(circle at 30% 20%, ${COLORS.petrol}, ${COLORS.petrolDark})`, fontFamily: "Inter, sans-serif" }}
    >
      <div className="w-full max-w-sm">
        <TiltCard tone="paper" className="p-8 shadow-2xl">
          <h1 className="text-lg font-bold text-center mb-4" style={{ color: COLORS.petrolDark, fontFamily: "Oswald, sans-serif" }}>
            NEUES PASSWORT
          </h1>
          <p className="text-sm text-gray-600 mb-4">Vergib jetzt dein neues Passwort — mindestens 8 Zeichen.</p>

          <label className="block text-xs font-medium mb-1" style={{ color: COLORS.anthracite }}>Neues Passwort</label>
          <div className="relative mb-3">
            <input
              type={zeigen ? "text" : "password"}
              value={neu}
              onChange={(e) => setNeu(e.target.value)}
              className="w-full border rounded-md px-3 py-2 pr-9 text-sm"
            />
            <button type="button" onClick={() => setZeigen(!zeigen)} className="absolute right-2 top-2.5 text-gray-400">
              {zeigen ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          <label className="block text-xs font-medium mb-1" style={{ color: COLORS.anthracite }}>Wiederholen</label>
          <input
            type={zeigen ? "text" : "password"}
            value={wiederholung}
            onChange={(e) => setWiederholung(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && speichern()}
            className="w-full border rounded-md px-3 py-2 mb-3 text-sm"
          />

          {fehler && <p className="text-xs mb-3" style={{ color: COLORS.orangeDeep }}>{fehler}</p>}
          <button
            onClick={speichern}
            disabled={ladend}
            className="w-full py-2.5 rounded-md text-white font-semibold text-sm"
            style={{ background: COLORS.orange, fontFamily: "Oswald, sans-serif", opacity: ladend ? 0.6 : 1 }}
          >
            {ladend ? "SPEICHERE…" : "PASSWORT SPEICHERN"}
          </button>
        </TiltCard>
      </div>
    </div>
  );
}

function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [passwort, setPasswort] = useState("");
  const [zeigen, setZeigen] = useState(false);
  const [fehler, setFehler] = useState(null);
  const [ladend, setLadend] = useState(false);
  const [vergessenOffen, setVergessenOffen] = useState(false);

  if (vergessenOffen) return <PasswortVergessen onZurueck={() => setVergessenOffen(false)} />;

  async function anmelden() {
    setFehler(null);
    setLadend(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: passwort });
    if (error) {
      setFehler(error.message === "Invalid login credentials" ? "E-Mail oder Passwort ist falsch." : error.message);
      setLadend(false);
      return;
    }
    const { data: profil, error: profilError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", data.user.id)
      .single();

    setLadend(false);
    if (profilError || !profil) {
      setFehler("Anmeldung erfolgreich, aber kein Spielerprofil gefunden. Bitte beim Admin melden.");
      return;
    }
    onLogin(profil);
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: `radial-gradient(circle at 30% 20%, ${COLORS.petrol}, ${COLORS.petrolDark})`, fontFamily: "Inter, sans-serif" }}
    >
      <div className="w-full max-w-sm">
        <TiltCard tone="paper" className="p-8 shadow-2xl">
          <div className="flex flex-col items-center mb-6">
            <img src={logoKlein} alt="TTV 97 Kamenz e.V." className="w-20 h-20 rounded-2xl mb-3" />
            <h1 className="text-xl font-bold text-center" style={{ color: COLORS.petrolDark, fontFamily: "Oswald, sans-serif" }}>
              TTV 97 KAMENZ e.V.
            </h1>
          </div>
          <label className="block text-xs font-medium mb-1" style={{ color: COLORS.anthracite }}>E-Mail</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border rounded-md px-3 py-2 mb-4 text-sm"
            placeholder="deine@adresse.de"
          />
          <label className="block text-xs font-medium mb-1" style={{ color: COLORS.anthracite }}>Passwort</label>
          <div className="relative mb-2">
            <input
              type={zeigen ? "text" : "password"}
              value={passwort}
              onChange={(e) => setPasswort(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && anmelden()}
              className="w-full border rounded-md px-3 py-2 pr-9 text-sm"
              placeholder="••••••••"
            />
            <button type="button" onClick={() => setZeigen(!zeigen)} className="absolute right-2 top-2.5 text-gray-400">
              {zeigen ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {fehler && <p className="text-xs mb-3" style={{ color: COLORS.orangeDeep }}>{fehler}</p>}
          <button
            onClick={anmelden}
            disabled={ladend}
            className="w-full py-2.5 rounded-md text-white font-semibold text-sm transition mt-2"
            style={{ background: COLORS.orange, fontFamily: "Oswald, sans-serif", opacity: ladend ? 0.6 : 1 }}
          >
            {ladend ? "MELDE AN…" : "ANMELDEN"}
          </button>
          <button
            onClick={() => setVergessenOffen(true)}
            className="w-full text-xs text-center mt-3 underline"
            style={{ color: COLORS.petrol }}
          >
            Passwort vergessen?
          </button>
          <p className="text-[11px] text-center mt-4 text-gray-500">
            Erstanmeldung? Nutze das Einmalpasswort vom Admin – du wirst danach direkt zur Passwortänderung geführt.
          </p>
        </TiltCard>
      </div>
    </div>
  );
}

/* ---------- Erstes Login: Passwort muss geändert werden ---------- */

function ErstesPasswortAendern({ profil, onFertig }) {
  const [neu, setNeu] = useState("");
  const [wiederholung, setWiederholung] = useState("");
  const [fehler, setFehler] = useState(null);
  const [ladend, setLadend] = useState(false);

  async function speichern() {
    setFehler(null);
    if (neu.length < 8) return setFehler("Das neue Passwort muss mindestens 8 Zeichen haben.");
    if (neu !== wiederholung) return setFehler("Die beiden Passwörter stimmen nicht überein.");

    setLadend(true);
    const { error: updateError } = await supabase.auth.updateUser({ password: neu });
    if (updateError) {
      setFehler(updateError.message);
      setLadend(false);
      return;
    }
    const { error: profilError } = await supabase
      .from("profiles")
      .update({ muss_passwort_aendern: false })
      .eq("id", profil.id);
    setLadend(false);
    if (profilError) return setFehler(profilError.message);
    onFertig();
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: COLORS.petrolDark }}>
      <TiltCard tone="paper" className="p-8 shadow-2xl w-full max-w-sm">
        <div className="flex items-center gap-2 mb-4">
          <KeyRound size={18} style={{ color: COLORS.orange }} />
          <h2 className="font-bold" style={{ color: COLORS.petrolDark, fontFamily: "Oswald, sans-serif" }}>Passwort festlegen</h2>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Willkommen, {profil.vorname}! Bevor es losgeht, lege bitte ein eigenes Passwort fest — das Einmalpasswort vom Admin ist danach ungültig.
        </p>
        <label className="block text-xs font-medium mb-1">Neues Passwort</label>
        <input type="password" value={neu} onChange={(e) => setNeu(e.target.value)} className="w-full border rounded-md px-3 py-2 mb-3 text-sm" />
        <label className="block text-xs font-medium mb-1">Wiederholen</label>
        <input type="password" value={wiederholung} onChange={(e) => setWiederholung(e.target.value)} className="w-full border rounded-md px-3 py-2 mb-4 text-sm" />
        {fehler && <p className="text-xs mb-3" style={{ color: COLORS.orangeDeep }}>{fehler}</p>}
        <button
          onClick={speichern}
          disabled={ladend}
          className="w-full py-2.5 rounded-md text-white font-semibold text-sm"
          style={{ background: COLORS.orange, opacity: ladend ? 0.6 : 1 }}
        >
          {ladend ? "Speichere…" : "Passwort speichern und starten"}
        </button>
      </TiltCard>
    </div>
  );
}

/* ---------- Einführungs-Tour (nur beim allerersten Start) ---------- */

function baueOnboardingSchritte(profil) {
  const admin = profil.ist_admin;
  const leiter = istTeamLeiter(profil);
  const verwaltet = admin || leiter; // darf Inhalte pflegen (mind. der eigenen Mannschaft)

  const schritte = [
    {
      icon: Sparkles,
      titel: profil.vorname ? `Willkommen, ${profil.vorname}!` : "Willkommen beim TTV 97 Kamenz",
      text:
        "Schön, dass du beim TTV 97 Kamenz dabei bist. Diese App bringt alles zusammen, was bei uns über die Saison hinweg organisiert werden muss — für alle Mannschaften des Vereins an einem Ort. " +
        "Wer kann am Freitag, wer ist verhindert, wo fehlt noch ein Spieler? Statt langer Telefonketten und untergegangener Chatnachrichten sagst du hier einmal Bescheid, und alle sehen es sofort. " +
        "Dazu kommen die wichtigen Vereinstermine im Jahr und unsere internen Turniere, die sich damit von der Anmeldung bis zum letzten Satz planen lassen. " +
        "Je mehr von uns mitmachen, desto besser funktioniert es — und desto entspannter wird der Spieltag für alle. Zwei Minuten, dann kennst du dich aus.",
    },
    {
      icon: LayoutDashboard,
      titel: "Dein Dashboard",
      text: "Hier siehst du auf einen Blick euren Tabellenplatz, das nächste Spiel, offene Umfragen, ungelesene Nachrichten und anstehende Termine.",
    },
    {
      icon: Table2,
      titel: "Tabelle & Ergebnisse",
      text: verwaltet
        ? "Die aktuelle Tabelle und alle Spielergebnisse eurer Liga — automatisch vom Verband geholt. Beim Öffnen aktualisiert sich beides von selbst; über \"Jetzt aktualisieren\" holst du dir zusätzlich jederzeit sofort den neuesten Stand. Über die Reiter oben kannst du auch andere Mannschaften des Vereins ansehen."
        : "Die aktuelle Tabelle und alle Spielergebnisse eurer Liga — automatisch vom Verband geholt und beim Öffnen von selbst aktualisiert. Über die Reiter oben kannst du auch die Tabellen der anderen Mannschaften des Vereins ansehen.",
    },
    {
      icon: ShieldCheck,
      titel: "Spielerplanung",
      text: "Sag für jedes Spiel Bescheid, ob du Zeit hast: einfach auf dein Feld tippen, um zwischen offen/zugesagt/abgesagt zu wechseln. Unten siehst du je Spieltag die Zahl der Zusagen — orange bedeutet, dass noch Spieler fehlen. Violett markierte Spalten heißen: Eine Nachbar-Mannschaft spielt am selben Tag, von dort kann also niemand aushelfen.",
    },
    {
      icon: Clock,
      titel: "Schichtplan & Kontaktdaten",
      text: "Wenn du im Schichtsystem arbeitest, kannst du deine Rotation in den Einstellungen hinterlegen (z. B. Woche 1 Früh, Woche 2 Spät, Woche 3 Nacht). In der Spielerplanung sieht deine Mannschaft dann bei jedem Spieltag, welche Schicht du hast — das erspart viel Nachfragen. Ob Schichtplan und Telefonnummer für andere sichtbar sind, entscheidest du selbst.",
    },
    {
      icon: CalendarDays,
      titel: "Kalender",
      text: verwaltet
        ? "Trainings, Spiele und weitere Termine – bei Bedarf direkt in deinen eigenen Kalender exportierbar. Als " + (admin ? "Admin" : "Mannschaftsführer") + " kannst du hier außerdem selbst neue Termine anlegen."
        : "Trainings, Spiele und weitere Termine – bei Bedarf auch direkt in deinen eigenen Kalender (Google/Apple) exportierbar.",
    },
    {
      icon: Users,
      titel: "Kader",
      text: "Die Mannschaftsaufstellung sowie Kontaktdaten der Mitspieler, sofern sie diese sichtbar gemacht haben. Deine eigene Sichtbarkeit stellst du in den Einstellungen ein.",
    },
    {
      icon: Vote,
      titel: "Umfragen & Nachrichten",
      text: verwaltet
        ? "Bei Umfragen einfach abstimmen — oder als " + (admin ? "Admin" : "Mannschaftsführer") + " selbst welche erstellen. Fehlen einer Mannschaft Spieler, fragt die App automatisch bei der darunter liegenden Mannschaft nach; meldet sich dort in drei Tagen niemand, schlägt sie von allein freie Ausweichtermine für eine Spielverlegung zur Abstimmung vor. Im Nachrichten-Postfach schreibst du direkt mit anderen Spielern, nach Mannschaften sortiert."
        : "Bei Umfragen einfach abstimmen — manchmal fragt eine andere Mannschaft nach Aushilfe, manchmal geht es um einen Ausweichtermin für ein Spiel. Im Nachrichten-Postfach schreibst du direkt mit anderen Spielern, nach Mannschaften sortiert.",
    },
    {
      icon: Bell,
      titel: "Benachrichtigungen",
      text: "Über die Glocke oben rechts siehst du auf einen Blick, was neu für dich ist: ungelesene Nachrichten, Umfragen, bei denen deine Stimme noch fehlt, und die nächsten Termine. Zusätzlich schickt dir die App eine E-Mail bei neuen Umfragen, Nachrichten und Terminen — in den Einstellungen legst du selbst fest, worüber du informiert werden möchtest.",
    },
    {
      icon: Trophy,
      titel: "Vereinsturniere",
      text: verwaltet
        ? "Interne Turniere im Einzel (Schweizer System oder Jeder-gegen-jeden) oder Doppel. Zu jedem Turnier entsteht automatisch eine Anmelde-Umfrage und auf Wunsch ein Kalendertermin. Ergebnisse werden satzweise eingetragen, die Tabelle rechnet live mit."
        : "Interne Turniere im Einzel oder Doppel: Über die Anmelde-Umfrage sagst du zu, während des Turniers siehst du Spielplan, deine Partien und die Live-Tabelle.",
    },
  ];

  if (leiter && !admin) {
    schritte.push({
      icon: Shield,
      titel: "Deine Mannschaftsführer-Rechte",
      text: "Als Mannschaftsführer bzw. Stellvertreter hast du zwei zusätzliche Reiter: \"Mannschaften\" (Saison-Links wie Tabelle/Spielplan für eure Mannschaft pflegen) und \"Spieler\" (Spieler eurer Mannschaft anlegen, bearbeiten, Passwort zurücksetzen). Das gilt jeweils nur für deine eigene Mannschaft. Außerdem kannst du Umfragen und Turniere erstellen und im Dashboard bei Spielermangel eine Aushilfe-Anfrage an die darunter liegende Mannschaft starten.",
    });
  }

  if (admin) {
    schritte.push({
      icon: Shield,
      titel: "Deine Admin-Rechte",
      text: "Als Admin hast du vollen Zugriff auf alle Mannschaften: Teams anlegen, Spieler verwalten, Admin-Rechte vergeben, Saison-Links pflegen sowie Umfragen, Turniere und Termine für alle oder einzelne Mannschaften erstellen — über die Reiter \"Mannschaften\" und \"Spieler\". In den Einstellungen kannst du außerdem Neuigkeiten verfassen, die allen Spielern beim nächsten Öffnen der App angezeigt werden.",
    });
  }

  return schritte;
}

function OnboardingTour({ profil, onFertig }) {
  const [schritt, setSchritt] = useState(0);
  const [ladend, setLadend] = useState(false);
  const schritte = baueOnboardingSchritte(profil);
  const istLetzterSchritt = schritt === schritte.length - 1;

  async function abschliessen() {
    setLadend(true);
    await supabase.from("profiles").update({ onboarding_gesehen: true }).eq("id", profil.id);
    setLadend(false);
    onFertig();
  }

  const aktuell = schritte[schritt];
  const Icon = aktuell.icon;

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: COLORS.petrolDark }}>
      <TiltCard tone="paper" className="p-8 shadow-2xl w-full max-w-sm relative">
        <button
          onClick={abschliessen}
          disabled={ladend}
          className="absolute top-4 right-4 text-xs text-gray-400 hover:text-gray-600"
        >
          Beenden
        </button>

        <div className="w-12 h-12 rounded-full flex items-center justify-center mb-4" style={{ background: COLORS.orange }}>
          <Icon size={22} color="white" />
        </div>

        <h2 className="font-bold text-lg mb-2" style={{ color: COLORS.petrolDark, fontFamily: "Oswald, sans-serif" }}>
          {aktuell.titel}
        </h2>
        <p className="text-sm text-gray-500 mb-6 leading-relaxed max-h-[45vh] overflow-y-auto">{aktuell.text}</p>

        <div className="flex items-center justify-center gap-1.5 mb-6">
          {schritte.map((_, i) => (
            <div
              key={i}
              className="h-1.5 rounded-full transition-all"
              style={{ width: i === schritt ? 20 : 6, background: i === schritt ? COLORS.orange : "#E0DED8" }}
            />
          ))}
        </div>

        <div className="flex gap-2">
          {schritt > 0 && (
            <button onClick={() => setSchritt((s) => s - 1)} className="flex-1 py-2.5 rounded-md text-sm font-semibold border">
              Zurück
            </button>
          )}
          <button
            onClick={istLetzterSchritt ? abschliessen : () => setSchritt((s) => s + 1)}
            disabled={ladend}
            className="flex-1 py-2.5 rounded-md text-white text-sm font-semibold"
            style={{ background: COLORS.orange, opacity: ladend ? 0.6 : 1 }}
          >
            {ladend ? "…" : istLetzterSchritt ? "Los geht's!" : "Weiter"}
          </button>
        </div>
      </TiltCard>
    </div>
  );
}

function PasswortAendern({ profil }) {
  const [alt, setAlt] = useState("");
  const [neu, setNeu] = useState("");
  const [wiederholung, setWiederholung] = useState("");
  const [status, setStatus] = useState(null);
  const [ladend, setLadend] = useState(false);

  async function speichern() {
    setStatus(null);
    if (neu.length < 8) return setStatus({ art: "fehler", text: "Das neue Passwort muss mindestens 8 Zeichen haben." });
    if (neu !== wiederholung) return setStatus({ art: "fehler", text: "Die beiden neuen Passwörter stimmen nicht überein." });

    setLadend(true);
    const { error: pruefFehler } = await supabase.auth.signInWithPassword({ email: profil.email, password: alt });
    if (pruefFehler) {
      setLadend(false);
      return setStatus({ art: "fehler", text: "Das aktuelle Passwort ist nicht korrekt." });
    }
    const { error: updateFehler } = await supabase.auth.updateUser({ password: neu });
    setLadend(false);
    if (updateFehler) return setStatus({ art: "fehler", text: updateFehler.message });
    setAlt(""); setNeu(""); setWiederholung("");
    setStatus({ art: "erfolg", text: "Passwort wurde geändert." });
  }

  return (
    <div className="bg-white rounded-lg border p-5 max-w-md">
      <SectionLabel icon={KeyRound}>Passwort ändern</SectionLabel>
      <label className="block text-xs text-gray-500 mb-1">Aktuelles Passwort</label>
      <input type="password" value={alt} onChange={(e) => setAlt(e.target.value)} className="w-full border rounded-md px-3 py-2 mb-3 text-sm" />
      <label className="block text-xs text-gray-500 mb-1">Neues Passwort</label>
      <input type="password" value={neu} onChange={(e) => setNeu(e.target.value)} className="w-full border rounded-md px-3 py-2 mb-3 text-sm" />
      <label className="block text-xs text-gray-500 mb-1">Neues Passwort wiederholen</label>
      <input type="password" value={wiederholung} onChange={(e) => setWiederholung(e.target.value)} className="w-full border rounded-md px-3 py-2 mb-3 text-sm" />
      {status && (
        <p className="text-xs mb-3" style={{ color: status.art === "fehler" ? COLORS.orangeDeep : COLORS.petrol }}>{status.text}</p>
      )}
      <button
        onClick={speichern}
        disabled={ladend}
        className="px-4 py-2 rounded-md text-white text-sm font-semibold"
        style={{ background: COLORS.orange, opacity: ladend ? 0.6 : 1 }}
      >
        {ladend ? "Speichere…" : "Passwort speichern"}
      </button>
    </div>
  );
}

/* ---------- Dashboard ---------- */

function Dashboard({ saison, profil, onOeffneUmfrage, onOeffneNachricht }) {
  const [ladend, setLadend] = useState(true);
  const [eigenerTabellenplatz, setEigenerTabellenplatz] = useState(null);
  const [naechstesSpiel, setNaechstesSpiel] = useState(null);
  const [geburtstag, setGeburtstag] = useState(null);
  const [termine, setTermine] = useState([]);
  const [offeneUmfragen, setOffeneUmfragen] = useState([]);
  const [ungeleseneNachrichten, setUngeleseneNachrichten] = useState([]);

  useEffect(() => {
    if (!saison) return;
    setLadend(true);
    (async () => {
      const [{ data: tabelleZeile }, { data: spiele }, { data: profile }, { data: kalender }, { data: umfragen }, { data: eigeneAntworten }, { data: nachrichten }] = await Promise.all([
        supabase.from("tabelle").select("*").eq("saison_id", saison.id).eq("ist_eigenes_team", true).maybeSingle(),
        supabase.from("verbands_spiele").select("*").eq("saison_id", saison.id).gte("datum", new Date().toISOString()).order("datum").limit(1),
        supabase.from("profiles").select("id, vorname, nachname, geburtstag"),
        supabase.from("kalender_ereignisse").select("*").gte("datum", new Date().toISOString()).order("datum").limit(4),
        supabase.from("umfragen").select("id, titel, anonym").eq("aktiv", true),
        supabase.from("umfrage_antworten").select("umfrage_id").eq("spieler_id", profil.id),
        supabase.from("nachrichten").select("id, von_id").eq("an_id", profil.id).eq("gelesen", false),
      ]);
      setEigenerTabellenplatz(tabelleZeile ?? null);
      setNaechstesSpiel(spiele?.[0] ?? null);
      setGeburtstag(naechsterGeburtstag(profile ?? []));
      setTermine(kalender ?? []);
      const beantwortetIds = new Set((eigeneAntworten ?? []).map((a) => a.umfrage_id));
      setOffeneUmfragen((umfragen ?? []).filter((u) => !beantwortetIds.has(u.id)));
      setUngeleseneNachrichten(nachrichten ?? []);
      setLadend(false);
    })();
  }, [saison, profil.id]);

  if (ladend) return <Leerzustand text="Lade Dashboard…" />;

  const ungeleseneAbsenderAnzahl = new Set(ungeleseneNachrichten.map((n) => n.von_id)).size;

  return (
    <div className="space-y-6">
      <News profil={profil} />

      <div className="grid md:grid-cols-3 gap-4">
        <TiltCard tone="petrol" className="p-5 text-white">
          <SectionLabel icon={Trophy}>Aktuelle Tabelle</SectionLabel>
          {eigenerTabellenplatz ? (
            <>
              <p className="text-3xl font-bold" style={{ fontFamily: "Oswald, sans-serif" }}>Platz {eigenerTabellenplatz.platz}</p>
              <p className="text-sm opacity-80 mt-1">{eigenerTabellenplatz.punkte} Punkte aus {eigenerTabellenplatz.spiele} Spielen</p>
            </>
          ) : (
            <p className="text-sm opacity-80">Noch keine Tabelle hinterlegt — im Reiter "Tabelle" aktualisieren.</p>
          )}
        </TiltCard>

        <TiltCard tone="orange" className="p-5 text-white">
          <SectionLabel icon={CalendarDays}>Nächstes Spiel</SectionLabel>
          {naechstesSpiel ? (
            <>
              <p className="text-lg font-bold" style={{ fontFamily: "Oswald, sans-serif" }}>
                {naechstesSpiel.ist_heimspiel ? naechstesSpiel.gastteam : naechstesSpiel.heimteam}
              </p>
              <p className="text-sm opacity-90 mt-1">
                {wochentagLang(effektivesSpielDatum(naechstesSpiel))}, {formatDatum(effektivesSpielDatum(naechstesSpiel))}
                {uhrzeit(effektivesSpielDatum(naechstesSpiel)) && ` · ${uhrzeit(effektivesSpielDatum(naechstesSpiel))}`}
                {" · "}{naechstesSpiel.ist_heimspiel ? "Heimspiel" : "Auswärts"}
                {naechstesSpiel.verlegt && <span className="ml-1 opacity-80">· verlegt</span>}
              </p>
            </>
          ) : (
            <p className="text-sm opacity-90">Noch kein Spiel terminiert.</p>
          )}
        </TiltCard>

        <TiltCard tone="paper" className="p-5 border">
          <SectionLabel icon={Cake}>Nächster Geburtstag</SectionLabel>
          {geburtstag ? (
            <>
              <p className="text-lg font-bold" style={{ color: COLORS.petrolDark, fontFamily: "Oswald, sans-serif" }}>
                {geburtstag.vorname} {geburtstag.nachname}
              </p>
              <p className="text-sm text-gray-500 mt-1">{formatDatum(geburtstag.next.toISOString())}</p>
            </>
          ) : (
            <p className="text-sm text-gray-400">Keine Geburtstage hinterlegt.</p>
          )}
        </TiltCard>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border p-5">
          <SectionLabel icon={Vote}>
            Offene Umfragen {offeneUmfragen.length > 0 && <span className="ml-1 text-white text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: COLORS.orange }}>{offeneUmfragen.length} neu</span>}
          </SectionLabel>
          {offeneUmfragen.length === 0 ? (
            <p className="text-sm text-gray-400">Keine offenen Umfragen.</p>
          ) : (
            <ul className="space-y-2">
              {offeneUmfragen.map((u) => (
                <li key={u.id}>
                  <button
                    onClick={() => onOeffneUmfrage(u.id)}
                    className="flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900 w-full text-left"
                  >
                    <Vote size={14} style={{ color: COLORS.orange }} />
                    <span className="underline decoration-gray-300">{u.titel}</span>
                    {u.anonym && <HelpCircle size={12} className="text-gray-400 shrink-0" title="Anonyme Umfrage" />}
                    <ChevronRight size={14} className="text-gray-300 ml-auto" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white rounded-lg border p-5">
          <SectionLabel icon={MessageSquare}>
            Nachrichten {ungeleseneNachrichten.length > 0 && <span className="ml-1 text-white text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: COLORS.orange }}>{ungeleseneNachrichten.length} neu</span>}
          </SectionLabel>
          {ungeleseneNachrichten.length === 0 ? (
            <p className="text-sm text-gray-400">Keine neuen Nachrichten.</p>
          ) : (
            <button onClick={() => onOeffneNachricht(null)} className="flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900 w-full text-left">
              <MessageSquare size={14} style={{ color: COLORS.orange }} />
              <span className="underline decoration-gray-300">
                {ungeleseneAbsenderAnzahl === 1 ? "Neue Nachricht ansehen" : `Neue Nachrichten von ${ungeleseneAbsenderAnzahl} Spielern`}
              </span>
              <ChevronRight size={14} className="text-gray-300 ml-auto" />
            </button>
          )}
        </div>

        <div className="bg-white rounded-lg border p-5">
          <SectionLabel icon={CalendarDays}>Anstehende Termine</SectionLabel>
          {termine.length === 0 ? (
            <Leerzustand text="Keine anstehenden Termine." />
          ) : (
            <ul className="space-y-2">
              {termine.map((e) => (
                <li key={e.id} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">{e.titel}</span>
                  <span className="text-xs text-gray-400">{formatDatum(e.datum)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <MannschaftsUebersicht profil={profil} />
    </div>
  );
}

/* ---------- Automatische Eskalation: Aushilfe-Umfrage → Verlegungs-Umfrage ----------

   Ablauf:
   1. Eine Mannschaft bittet die darunter liegende Mannschaft per Umfrage um Aushilfe.
   2. Meldet sich innerhalb von 3 Tagen niemand mit "Ja" (oder haben vorher schon alle
      Angefragten abgesagt), wird die Umfrage automatisch beendet.
   3. Sofort danach entsteht eine neue Umfrage für die eigene Mannschaft mit konkreten
      Ausweichterminen, auf die das Spiel verlegt werden könnte (Mehrfachauswahl).

   Die Terminvorschläge berechnet die App selbst: gleicher Wochentag wie der reguläre
   Spieltag, und nur Tage, an denen keine Vereinsmannschaft ein Spiel und die eigene
   Mannschaft keinen Kalendertermin hat.

   Geprüft wird beim Start der App durch Admins und Mannschaftsführer — nur sie haben
   die nötigen Schreibrechte. */

const AUSHILFE_FRIST_TAGE = 3;
const VERLEGUNG_MAX_VORSCHLAEGE = 5;

function tagesSchluessel(datum) {
  const d = new Date(datum);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function wochentagKurz(datum) {
  return new Date(datum).toLocaleDateString("de-DE", { weekday: "short" });
}

// Freie Ausweichtermine für ein zu verlegendes Spiel finden
async function verlegungsTermineFinden(spiel, mannschaftId) {
  const original = new Date(spiel.datum);
  if (isNaN(original)) return [];

  // Alle Spiele aller Mannschaften in den aktiven Saisons = belegte Tage
  const { data: aktiveSaisons } = await supabase.from("saisons").select("id, mannschaft_id").eq("aktiv", true);
  const saisonIds = (aktiveSaisons ?? []).map((s) => s.id);
  const belegt = new Set();

  if (saisonIds.length > 0) {
    const { data: alleSpiele } = await supabase.from("verbands_spiele").select("datum, verlegt_auf").in("saison_id", saisonIds);
    (alleSpiele ?? []).forEach((s) => { const d = effektivesSpielDatum(s); if (d) belegt.add(tagesSchluessel(d)); });
  }

  // Kalendertermine der eigenen Mannschaft (und vereinsweite Termine) ebenfalls meiden
  const { data: termine } = await supabase.from("kalender_ereignisse").select("datum, mannschaft_id");
  (termine ?? []).forEach((t) => {
    if (!t.datum) return;
    if (t.mannschaft_id && t.mannschaft_id !== mannschaftId) return;
    belegt.add(tagesSchluessel(t.datum));
  });

  const wochentagSpieltag = original.getDay();
  const fruehestens = new Date();
  fruehestens.setDate(fruehestens.getDate() + 7); // mindestens eine Woche Vorlauf
  const von = new Date(Math.max(fruehestens.getTime(), original.getTime() - 28 * 24 * 60 * 60 * 1000));
  const bis = new Date(original.getTime() + 70 * 24 * 60 * 60 * 1000);

  const kandidaten = [];
  for (let tag = new Date(von); tag <= bis; tag.setDate(tag.getDate() + 1)) {
    const wochentag = tag.getDay();
    // Erste Wahl: regulärer Spieltag. Zweite Wahl: Wochenende.
    const rang = wochentag === wochentagSpieltag ? 0 : (wochentag === 6 || wochentag === 0) ? 1 : null;
    if (rang === null) continue;
    if (belegt.has(tagesSchluessel(tag))) continue;
    const kandidat = new Date(tag);
    kandidat.setHours(original.getHours(), original.getMinutes(), 0, 0);
    kandidaten.push({ datum: kandidat, rang, abstand: Math.abs(kandidat.getTime() - original.getTime()) });
  }

  kandidaten.sort((a, b) => a.rang - b.rang || a.abstand - b.abstand);
  return kandidaten
    .slice(0, VERLEGUNG_MAX_VORSCHLAEGE)
    .sort((a, b) => a.datum.getTime() - b.datum.getTime())
    .map((k) => k.datum);
}

function UmfrageEskalation({ profil }) {
  useEffect(() => {
    if (!profil?.ist_admin && !istTeamLeiter(profil)) return;
    let abgebrochen = false;

    (async () => {
      const grenze = new Date(Date.now() - AUSHILFE_FRIST_TAGE * 24 * 60 * 60 * 1000).toISOString();
      const { data: aushilfen } = await supabase
        .from("umfragen")
        .select("*")
        .eq("art", "aushilfe")
        .eq("eskalation_erledigt", false);
      if (abgebrochen || !aushilfen || aushilfen.length === 0) return;

      for (const umfrage of aushilfen) {
        const [{ data: antworten }, { data: ziele }] = await Promise.all([
          supabase.from("umfrage_antworten").select("spieler_id, ausgewaehlte_optionen").eq("umfrage_id", umfrage.id),
          supabase.from("umfrage_ziele").select("spieler_id").eq("umfrage_id", umfrage.id),
        ]);

        const zusagen = (antworten ?? []).filter((a) =>
          (a.ausgewaehlte_optionen ?? []).some((o) => String(o).toLowerCase().startsWith("ja"))
        );

        // Es hat jemand zugesagt → alles gut, keine Eskalation nötig.
        if (zusagen.length > 0) {
          await supabase.from("umfragen").update({ eskalation_erledigt: true }).eq("id", umfrage.id);
          continue;
        }

        const fristAbgelaufen = umfrage.erstellt_am <= grenze;
        const alleHabenAbgesagt =
          (ziele ?? []).length > 0 && (antworten ?? []).length >= (ziele ?? []).length;
        if (!fristAbgelaufen && !alleHabenAbgesagt) continue;

        // Wettlauf vermeiden: nur wer die Markierung setzt, legt die Folge-Umfrage an.
        const { data: markiert } = await supabase
          .from("umfragen")
          .update({ eskalation_erledigt: true, endet_am: new Date().toISOString() })
          .eq("id", umfrage.id)
          .eq("eskalation_erledigt", false)
          .select("id");
        if (!markiert || markiert.length === 0) continue;

        if (!umfrage.bezug_spiel_id || !umfrage.ziel_mannschaft_id) continue;

        const { data: spiel } = await supabase
          .from("verbands_spiele")
          .select("*")
          .eq("id", umfrage.bezug_spiel_id)
          .maybeSingle();
        if (!spiel || !spiel.datum) continue;
        if (new Date(spiel.datum) < new Date()) continue; // Spiel liegt schon in der Vergangenheit

        const termine = await verlegungsTermineFinden(spiel, umfrage.ziel_mannschaft_id);
        const gegner = spiel.ist_heimspiel ? spiel.gastteam : spiel.heimteam;
        const optionen = [
          ...termine.map((t) => `${wochentagKurz(t)}, ${formatDatum(t.toISOString())}`),
          "Keiner der Termine passt mir",
        ];

        const { data: verlegung } = await supabase
          .from("umfragen")
          .insert({
            titel: `Spielverlegung nötig: ${gegner} am ${formatDatum(spiel.datum)}`,
            beschreibung:
              `Für dieses Spiel hat sich aus der darunter liegenden Mannschaft niemand als Aushilfe gemeldet. ` +
              `Deshalb soll das Spiel verlegt werden. ` +
              (termine.length > 0
                ? `Die folgenden Termine sind laut Spielplan und Vereinskalender frei — bitte alle Termine ankreuzen, an denen du kannst (Mehrfachauswahl möglich).`
                : `Es konnten automatisch keine freien Ausweichtermine gefunden werden — bitte meldet euch direkt beim Mannschaftsführer.`),
            optionen,
            mehrfachauswahl: true,
            erstellt_von: profil.id,
            mannschaft_id: umfrage.ziel_mannschaft_id,
            art: "verlegung",
            bezug_spiel_id: spiel.id,
            ziel_mannschaft_id: umfrage.ziel_mannschaft_id,
            eskalation_erledigt: true,
          })
          .select()
          .single();

        if (!verlegung) continue;

        const { data: eigeneSpieler } = await supabase
          .from("profiles")
          .select("id")
          .eq("mannschaft_id", umfrage.ziel_mannschaft_id);
        const empfaengerIds = (eigeneSpieler ?? []).map((s) => s.id);
        if (empfaengerIds.length > 0) {
          await supabase.from("umfrage_ziele").insert(empfaengerIds.map((spieler_id) => ({ umfrage_id: verlegung.id, spieler_id })));
          supabase.functions.invoke("notify-neue-umfrage", {
            body: { titel: verlegung.titel, beschreibung: verlegung.beschreibung, empfaengerIds },
          }); // bewusst nicht awaited
        }
      }
    })();

    return () => { abgebrochen = true; };
  }, [profil?.id]);

  return null;
}

/* ---------- Mannschaftsübersicht: nächstes Spiel & Zusagen aller Mannschaften ---------- */

function MannschaftsUebersicht({ profil }) {
  const [uebersicht, setUebersicht] = useState([]);
  const [ladend, setLadend] = useState(true);
  const [sendenLadendId, setSendenLadendId] = useState(null);
  const [gesendetIds, setGesendetIds] = useState([]);

  async function laden() {
    setLadend(true);
    const { data: mannschaften } = await supabase
      .from("mannschaften")
      .select("*")
      .order("hierarchie_stufe", { ascending: true, nullsFirst: false });
    const liste = mannschaften ?? [];

    const ergebnisse = await Promise.all(
      liste.map(async (m) => {
        const { data: saison } = await supabase
          .from("saisons")
          .select("id")
          .eq("mannschaft_id", m.id)
          .eq("aktiv", true)
          .maybeSingle();
        if (!saison) return { mannschaft: m, spiel: null, jaAnzahl: 0 };

        const { data: spiel } = await supabase
          .from("verbands_spiele")
          .select("*")
          .eq("saison_id", saison.id)
          .gte("datum", new Date().toISOString())
          .order("datum")
          .limit(1)
          .maybeSingle();
        if (!spiel) return { mannschaft: m, spiel: null, jaAnzahl: 0 };

        const { data: meldungen } = await supabase.from("spielerplanung_meldungen").select("status").eq("spiel_id", spiel.id);
        const jaAnzahl = (meldungen ?? []).filter((x) => x.status === "ja").length;
        return { mannschaft: m, spiel, jaAnzahl };
      })
    );

    setUebersicht(ergebnisse);
    setLadend(false);
  }

  useEffect(() => { laden(); }, []);

  async function umfrageAnUntereSenden(eintrag, untereMannschaft) {
    setSendenLadendId(eintrag.mannschaft.id);
    const gegner = eintrag.spiel.ist_heimspiel ? eintrag.spiel.gastteam : eintrag.spiel.heimteam;
    const datumText = formatDatum(eintrag.spiel.datum);
    const frist = new Date(Date.now() + AUSHILFE_FRIST_TAGE * 24 * 60 * 60 * 1000);

    const { data: neueUmfrage, error } = await supabase
      .from("umfragen")
      .insert({
        titel: `Aushilfe gesucht: ${eintrag.mannschaft.name} braucht Spieler`,
        beschreibung: `Für das Spiel gegen ${gegner} am ${datumText} werden noch Spieler gebraucht. Hast du an dem Tag Zeit auszuhelfen? (Die Umfrage endet automatisch am ${formatDatum(frist.toISOString())}.)`,
        optionen: ["Ja, ich kann aushelfen", "Nein, leider nicht"],
        mehrfachauswahl: false,
        erstellt_von: profil.id,
        art: "aushilfe",
        bezug_spiel_id: eintrag.spiel.id,
        ziel_mannschaft_id: eintrag.mannschaft.id,
        endet_am: frist.toISOString(),
      })
      .select()
      .single();

    if (!error && neueUmfrage) {
      const { data: spielerUnten } = await supabase.from("profiles").select("id").eq("mannschaft_id", untereMannschaft.id);
      if (spielerUnten && spielerUnten.length > 0) {
        await supabase.from("umfrage_ziele").insert(spielerUnten.map((s) => ({ umfrage_id: neueUmfrage.id, spieler_id: s.id })));
        supabase.functions.invoke("notify-neue-umfrage", {
          body: { titel: neueUmfrage.titel, empfaengerIds: spielerUnten.map((s) => s.id) },
        }); // bewusst nicht awaited
      }
      setGesendetIds((prev) => [...prev, eintrag.mannschaft.id]);
    }
    setSendenLadendId(null);
  }

  if (ladend) return <Leerzustand text="Lade Mannschaftsübersicht…" />;
  if (uebersicht.length === 0) return null;

  return (
    <div className="bg-white rounded-lg border p-5">
      <SectionLabel icon={Users}>Nächste Spiele aller Mannschaften</SectionLabel>
      <div className="space-y-3">
        {uebersicht.map((eintrag) => {
          const { mannschaft, spiel, jaAnzahl } = eintrag;
          const benoetigt = mannschaft.benoetigte_spieler ?? 4;
          const fehlend = spiel ? Math.max(0, benoetigt - jaAnzahl) : 0;
          const untereMannschaft = mannschaft.hierarchie_stufe
            ? uebersicht.find((e) => e.mannschaft.hierarchie_stufe === mannschaft.hierarchie_stufe + 1)?.mannschaft
            : null;

          return (
            <div key={mannschaft.id} className="border rounded-md p-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="font-medium text-sm" style={{ color: COLORS.anthracite }}>{mannschaft.name}</span>
                {spiel && (
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-semibold"
                    style={fehlend > 0 ? { background: COLORS.orange, color: "white" } : { background: "#E4F2EE", color: COLORS.petrol }}
                  >
                    {jaAnzahl}/{benoetigt} zugesagt
                  </span>
                )}
              </div>
              {spiel ? (
                <p className="text-xs text-gray-500 mt-1">
                  {formatDatum(spiel.datum)} · gegen {spiel.ist_heimspiel ? spiel.gastteam : spiel.heimteam}
                </p>
              ) : (
                <p className="text-xs text-gray-400 mt-1">Kein anstehendes Spiel terminiert.</p>
              )}

              {spiel && fehlend > 0 && profil.ist_admin && (
                untereMannschaft ? (
                  gesendetIds.includes(mannschaft.id) ? (
                    <p className="text-xs mt-2" style={{ color: COLORS.petrol }}>Umfrage an {untereMannschaft.name} verschickt.</p>
                  ) : (
                    <>
                    <button
                      onClick={() => umfrageAnUntereSenden(eintrag, untereMannschaft)}
                      disabled={sendenLadendId === mannschaft.id}
                      className="text-xs mt-2 px-3 py-1.5 rounded-md text-white font-semibold"
                      style={{ background: COLORS.orangeDeep, opacity: sendenLadendId === mannschaft.id ? 0.6 : 1 }}
                    >
                      {sendenLadendId === mannschaft.id ? "Sende…" : `Umfrage an ${untereMannschaft.name} senden`}
                    </button>
                    <p className="text-[11px] text-gray-400 mt-1 flex items-start gap-1">
                      <Mail size={11} className="mt-0.5 shrink-0" />
                      <span>Alle Spieler der {untereMannschaft.name} bekommen die Anfrage zusätzlich per E-Mail.</span>
                    </p>
                    </>
                  )
                ) : (
                  <p className="text-xs mt-2 text-gray-400">Keine tiefere Mannschaft hinterlegt, die aushelfen könnte.</p>
                )
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Tabelle ---------- */

function Tabelle({ saison, profil }) {
  const [zeilen, setZeilen] = useState([]);
  const [ladend, setLadend] = useState(true);
  const [aktualisiertLadend, setAktualisiertLadend] = useState(false);
  const [fehler, setFehler] = useState(null);

  async function laden(still = false) {
    if (!still) setLadend(true);
    const { data } = await supabase.from("tabelle").select("*").eq("saison_id", saison.id).order("platz");
    setZeilen(data ?? []);
    setLadend(false);
  }

  async function aktualisieren({ automatisch = false } = {}) {
    if (!automatisch) setFehler(null);
    autoAktualisierungMerken(`tabelle-${saison.id}`);
    setAktualisiertLadend(true);
    const { data, error } = await supabase.functions.invoke("fetch-tabelle", { body: { saisonId: saison.id } });
    setAktualisiertLadend(false);
    if (error || data?.error) {
      // Beim automatischen Abruf im Hintergrund keine Fehlermeldung zeigen —
      // die bereits vorhandenen Daten bleiben einfach stehen.
      if (!automatisch) setFehler(await echteFehlermeldung(error, data));
      return;
    }
    laden(true);
  }

  useEffect(() => {
    if (!saison) return;
    let abgebrochen = false;
    (async () => {
      await laden();
      if (abgebrochen) return;
      if (autoAktualisierungFaellig(`tabelle-${saison.id}`)) aktualisieren({ automatisch: true });
    })();
    return () => { abgebrochen = true; };
  }, [saison]);

  const aktualisiertAm = zeilen[0]?.aktualisiert_am;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-gray-500 flex-wrap gap-2">
        <span>
          {saison.tabellen_url ? (
            <a href={saison.tabellen_url} target="_blank" rel="noreferrer" className="underline" style={{ color: COLORS.petrol }}>
              Quelle: tischtennislive.de
            </a>
          ) : (
            <span>Kein Tabellen-Link hinterlegt (siehe Einstellungen)</span>
          )}
        </span>
        <div className="flex items-center gap-3">
          {aktualisiertLadend ? (
            <span>Aktualisiere…</span>
          ) : (
            aktualisiertAm && <span>Aktualisiert: {new Date(aktualisiertAm).toLocaleString("de-DE")}</span>
          )}
          {darfMannschaftVerwalten(profil, saison.mannschaft_id) && (
            <button
              onClick={() => aktualisieren()}
              className="px-3 py-1 rounded-md text-white text-xs font-semibold"
              style={{ background: COLORS.orange, opacity: aktualisiertLadend ? 0.6 : 1 }}
              disabled={aktualisiertLadend}
            >
              {aktualisiertLadend ? "Lädt…" : "Jetzt aktualisieren"}
            </button>
          )}
        </div>
      </div>

      {fehler && <p className="text-xs" style={{ color: COLORS.orangeDeep }}>{fehler}</p>}

      {ladend ? (
        <Leerzustand text="Lade Tabelle…" />
      ) : zeilen.length === 0 ? (
        <Leerzustand text={profil.ist_admin ? 'Noch keine Tabelle vorhanden — oben auf "Jetzt aktualisieren" klicken.' : "Noch keine Tabelle vorhanden."} />
      ) : (
        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead style={{ background: COLORS.petrolDark }}>
              <tr className="text-white text-left">
                <th className="p-3 font-medium">#</th>
                <th className="p-3 font-medium">Mannschaft</th>
                <th className="p-3 font-medium text-center">Spiele</th>
                <th className="p-3 font-medium text-center">Punkte</th>
              </tr>
            </thead>
            <tbody>
              {zeilen.map((t) => (
                <tr key={t.id} className="border-t" style={t.ist_eigenes_team ? { background: "#FCEEE7" } : {}}>
                  <td className="p-3">{t.platz}</td>
                  <td className="p-3 font-medium" style={t.ist_eigenes_team ? { color: COLORS.orangeDeep } : {}}>{t.team}</td>
                  <td className="p-3 text-center">{t.spiele}</td>
                  <td className="p-3 text-center font-semibold">{t.punkte}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ---------- Spielerplanung ---------- */

function Spielerplanung({ saison, profil }) {
  const [runde, setRunde] = useState("Hinrunde");
  const [spiele, setSpiele] = useState([]);
  const [spieler, setSpieler] = useState([]);
  const [meldungen, setMeldungen] = useState({}); // { [spielId]: { [spielerId]: status } }
  const [benoetigteSpieler, setBenoetigteSpieler] = useState(4);
  const [ueberschneidungen, setUeberschneidungen] = useState({}); // { [datumTag]: [{mannschaftName, gegner, istHeimspiel}] }
  const [ladend, setLadend] = useState(true);
  const [aktualisiertLadend, setAktualisiertLadend] = useState(false);
  const [fehler, setFehler] = useState(null);
  const [verlegung, setVerlegung] = useState(null); // { spiel, datum, grund }
  const [verlegungLadend, setVerlegungLadend] = useState(false);
  const [schreibschutzAus, setSchreibschutzAus] = useState(false);
  const [gesetztVon, setGesetztVon] = useState({}); // { "spielId:spielerId": { id, vorname } }
  const schreibschutzTimer = useRef(null);

  const darfPlanen = darfMannschaftVerwalten(profil, saison.mannschaft_id);
  const [mannschaftsName, setMannschaftsName] = useState("TTV 97 Kamenz");

  useEffect(() => {
    if (!saison.mannschaft_id) return;
    supabase.from("mannschaften").select("name").eq("id", saison.mannschaft_id).maybeSingle()
      .then(({ data }) => { if (data?.name) setMannschaftsName(`TTV 97 Kamenz ${data.name}`); });
  }, [saison.mannschaft_id]);

  // Der Schreibschutz greift nach fünf Minuten ohne Eintrag wieder von selbst,
  // damit er nicht versehentlich dauerhaft offen bleibt.
  const SCHREIBSCHUTZ_DAUER_MS = 5 * 60 * 1000;

  function schreibschutzZeitVerlaengern() {
    if (schreibschutzTimer.current) clearTimeout(schreibschutzTimer.current);
    schreibschutzTimer.current = setTimeout(() => setSchreibschutzAus(false), SCHREIBSCHUTZ_DAUER_MS);
  }

  function schreibschutzUmschalten() {
    if (schreibschutzAus) {
      if (schreibschutzTimer.current) clearTimeout(schreibschutzTimer.current);
      setSchreibschutzAus(false);
      return;
    }
    setSchreibschutzAus(true);
    schreibschutzZeitVerlaengern();
  }

  useEffect(() => () => { if (schreibschutzTimer.current) clearTimeout(schreibschutzTimer.current); }, []);

  function verlegungOeffnen(spiel) {
    setFehler(null);
    setVerlegung({
      spiel,
      // Vorhandenen Ersatztermin für das Eingabefeld aufbereiten (lokale Zeit, ohne Sekunden)
      datum: spiel.verlegt_auf ? new Date(spiel.verlegt_auf).toISOString().slice(0, 16) : "",
      grund: spiel.verlegt_grund ?? "",
    });
  }

  async function verlegungSpeichern(mitTermin) {
    setFehler(null);
    if (mitTermin && !verlegung.datum) return setFehler("Bitte einen neuen Termin angeben.");
    setVerlegungLadend(true);

    const neuerTermin = mitTermin ? new Date(verlegung.datum).toISOString() : null;
    const { error } = await supabase
      .from("verbands_spiele")
      .update({
        verlegt: true,
        verlegt_auf: neuerTermin,
        verlegt_grund: verlegung.grund.trim() || null,
        verlegt_von: profil.id,
        verlegt_am: new Date().toISOString(),
      })
      .eq("id", verlegung.spiel.id);

    if (error) {
      setVerlegungLadend(false);
      return setFehler(error.message);
    }

    // Bisherige Rückmeldungen gelten für den alten Termin und werden zurückgesetzt,
    // damit niemand fälschlich als verfügbar gezählt wird.
    await supabase.from("spielerplanung_meldungen").delete().eq("spiel_id", verlegung.spiel.id);

    if (neuerTermin) {
      supabase.functions.invoke("notify-spielverlegung", {
        body: {
          spielId: verlegung.spiel.id,
          neuerTermin,
          altesDatum: verlegung.spiel.datum,
          grund: verlegung.grund.trim() || null,
          mannschaftId: saison.mannschaft_id,
        },
      }); // bewusst nicht awaited
    }

    setVerlegungLadend(false);
    setVerlegung(null);
    laden();
  }

  async function verlegungAufheben() {
    setVerlegungLadend(true);
    await supabase
      .from("verbands_spiele")
      .update({ verlegt: false, verlegt_auf: null, verlegt_grund: null, verlegt_von: null, verlegt_am: null })
      .eq("id", verlegung.spiel.id);
    setVerlegungLadend(false);
    setVerlegung(null);
    laden();
  }

  async function laden() {
    setLadend(true);
    const spielerQuery = saison.mannschaft_id
      ? supabase.from("profiles").select("*").eq("mannschaft_id", saison.mannschaft_id).order("nachname")
      : supabase.from("profiles").select("*").order("nachname");
    const [{ data: spieleDaten }, { data: spielerDaten }, { data: meldungenDaten }] = await Promise.all([
      supabase.from("verbands_spiele").select("*").eq("saison_id", saison.id).eq("runde", runde).order("datum"),
      spielerQuery,
      supabase.from("spielerplanung_meldungen").select("*").eq("saison_id", saison.id),
    ]);
    setSpiele(spieleDaten ?? []);
    setSpieler(spielerDaten ?? []);
    const map = {};
    (spieleDaten ?? []).forEach((s) => { map[s.id] = {}; (spielerDaten ?? []).forEach((sp) => { map[s.id][sp.id] = "offen"; }); });
    const herkunft = {};
    (meldungenDaten ?? []).forEach((m) => {
      if (map[m.spiel_id]) map[m.spiel_id][m.spieler_id] = m.status;
      if (m.gesetzt_von) {
        const person = (spielerDaten ?? []).find((sp) => sp.id === m.gesetzt_von);
        herkunft[`${m.spiel_id}:${m.spieler_id}`] = { id: m.gesetzt_von, vorname: person?.vorname ?? "Mannschaftsführung" };
      }
    });
    setMeldungen(map);
    setGesetztVon(herkunft);

    if (saison.mannschaft_id) {
      const { data: mannschaft } = await supabase.from("mannschaften").select("benoetigte_spieler, hierarchie_stufe").eq("id", saison.mannschaft_id).single();
      setBenoetigteSpieler(mannschaft?.benoetigte_spieler ?? 4);

      // Terminüberschneidungen mit direkten Nachbar-Mannschaften prüfen (1.↔2., 2.↔3. usw.) —
      // wichtig, weil Mannschaften bei Spielermangel oft bei der Nachbar-Mannschaft aushelfen.
      if (mannschaft?.hierarchie_stufe != null) {
        const { data: alleMannschaften } = await supabase.from("mannschaften").select("id, name, hierarchie_stufe");
        const nachbarn = (alleMannschaften ?? []).filter(
          (m) => m.hierarchie_stufe != null && Math.abs(m.hierarchie_stufe - mannschaft.hierarchie_stufe) === 1
        );

        const eintraege = {};
        for (const nachbar of nachbarn) {
          const { data: nachbarSaison } = await supabase.from("saisons").select("id").eq("mannschaft_id", nachbar.id).eq("aktiv", true).maybeSingle();
          if (!nachbarSaison) continue;
          const { data: nachbarSpiele } = await supabase
            .from("verbands_spiele")
            .select("datum, heimteam, gastteam, ist_heimspiel")
            .eq("saison_id", nachbarSaison.id)
            .eq("runde", runde);
          (nachbarSpiele ?? []).forEach((s) => {
            if (!s.datum) return;
            const tag = s.datum.slice(0, 10);
            if (!eintraege[tag]) eintraege[tag] = [];
            eintraege[tag].push({
              mannschaftName: nachbar.name,
              gegner: s.ist_heimspiel ? s.gastteam : s.heimteam,
              istHeimspiel: s.ist_heimspiel,
            });
          });
        }
        setUeberschneidungen(eintraege);
      } else {
        setUeberschneidungen({});
      }
    }

    setLadend(false);
  }

  useEffect(() => { if (saison) laden(); }, [saison, runde]);

  async function aktualisieren() {
    setFehler(null);
    setAktualisiertLadend(true);
    const { data, error } = await supabase.functions.invoke("fetch-spielplan", { body: { saisonId: saison.id, runde } });
    setAktualisiertLadend(false);
    if (error || data?.error) {
      setFehler(await echteFehlermeldung(error, data));
      return;
    }
    laden();
  }

  async function toggle(spielId, spielerId) {
    const fremdeZeile = spielerId !== profil.id;
    // Für andere Spieler darf nur die Mannschaftsführung eintragen, und auch nur
    // bei aufgehobenem Schreibschutz — sonst passiert das versehentlich beim Scrollen.
    if (fremdeZeile && !(darfPlanen && schreibschutzAus)) return;

    const order = { offen: "ja", ja: "nein", nein: "offen" };
    const neuerStatus = order[meldungen[spielId]?.[spielerId] ?? "offen"];

    const aktualisierteMeldungenFuerSpiel = { ...meldungen[spielId], [spielerId]: neuerStatus };
    setMeldungen((prev) => ({ ...prev, [spielId]: aktualisierteMeldungenFuerSpiel }));
    setGesetztVon((prev) => ({
      ...prev,
      [`${spielId}:${spielerId}`]: fremdeZeile ? { id: profil.id, vorname: profil.vorname } : null,
    }));

    await supabase.from("spielerplanung_meldungen").upsert(
      {
        saison_id: saison.id,
        spiel_id: spielId,
        spieler_id: spielerId,
        status: neuerStatus,
        aktualisiert_am: new Date().toISOString(),
        // Nachvollziehbar halten, wer eine fremde Rückmeldung gesetzt hat
        gesetzt_von: fremdeZeile ? profil.id : null,
      },
      { onConflict: "spiel_id,spieler_id" }
    );

    if (fremdeZeile) schreibschutzZeitVerlaengern();

    const jaAnzahl = Object.values(aktualisierteMeldungenFuerSpiel).filter((v) => v === "ja").length;
    if (neuerStatus === "nein" || jaAnzahl < benoetigteSpieler) {
      const spielerName = spieler.find((s) => s.id === spielerId);
      supabase.functions.invoke("notify-spielplan-warnung", {
        body: {
          spielId,
          spielerName: spielerName ? `${spielerName.vorname} ${spielerName.nachname}` : null,
          neuerStatus,
          anzahlJa: jaAnzahl,
        },
      }); // bewusst nicht awaited – E-Mail-Versand soll die Oberfläche nicht blockieren
    }
  }

  function countJa(spielId) {
    return Object.values(meldungen[spielId] ?? {}).filter((v) => v === "ja").length;
  }

  if (ladend) return <Leerzustand text="Lade Spielerplanung…" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-2">
          {["Hinrunde", "Rückrunde"].map((r) => (
            <button
              key={r}
              onClick={() => setRunde(r)}
              className="px-4 py-1.5 rounded-full text-sm font-semibold transition"
              style={
                runde === r
                  ? { background: COLORS.orange, color: "white" }
                  : { background: "#fff", color: COLORS.anthracite, border: "1px solid #ddd" }
              }
            >
              {r}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <SpieleExportMenu spiele={spiele} mannschaftName={mannschaftsName} profil={profil} />
          {darfMannschaftVerwalten(profil, saison.mannschaft_id) && (
            <button
              onClick={aktualisieren}
              className="px-3 py-1.5 rounded-md text-white text-xs font-semibold"
              style={{ background: COLORS.orange, opacity: aktualisiertLadend ? 0.6 : 1 }}
              disabled={aktualisiertLadend}
            >
              {aktualisiertLadend ? "Lädt…" : "Jetzt aktualisieren"}
            </button>
          )}
        </div>
      </div>
      {fehler && <p className="text-xs" style={{ color: COLORS.orangeDeep }}>{fehler}</p>}

      <p className="text-xs text-gray-400 flex items-center gap-1 landscape:hidden md:hidden">
        <HelpCircle size={12} className="shrink-0" />
        Tipp: Im Querformat siehst du mehr Spieltage gleichzeitig — dreh dein Handy zum Planen am besten quer.
      </p>

      {spiele.length === 0 ? (
        <Leerzustand text={`Noch keine Spiele für die ${runde} hinterlegt.`} />
      ) : (
        <>
          <div className="bg-white rounded-lg border overflow-auto max-h-[75vh]">
            {darfPlanen && (
              <div
                className="flex flex-wrap items-center justify-between gap-2 p-3 border-b"
                style={{ background: schreibschutzAus ? "#FBE2DA" : COLORS.paper }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {schreibschutzAus ? <Unlock size={15} style={{ color: COLORS.orangeDeep }} /> : <Lock size={15} className="text-gray-400" />}
                  <p className="text-xs" style={{ color: schreibschutzAus ? COLORS.orangeDeep : "#6b7280" }}>
                    {schreibschutzAus
                      ? "Schreibschutz aufgehoben — du kannst jetzt für deine Spieler eintragen. Jeder Eintrag wird mit deinem Namen gekennzeichnet."
                      : "Schreibschutz aktiv — du kannst nur für dich selbst eintragen."}
                  </p>
                </div>
                <button
                  onClick={schreibschutzUmschalten}
                  className="text-xs px-3 py-1.5 rounded-md font-semibold shrink-0"
                  style={schreibschutzAus
                    ? { background: COLORS.orangeDeep, color: "white" }
                    : { border: `1px solid ${COLORS.petrol}`, color: COLORS.petrol }}
                >
                  {schreibschutzAus ? "Wieder sperren" : "Schreibschutz aufheben"}
                </button>
              </div>
            )}

            {verlegung && (
              <div className="p-4 border-b" style={{ background: COLORS.paper }}>
                <div className="flex items-center gap-2 mb-2">
                  <CalendarClock size={16} style={{ color: COLORS.konflikt }} />
                  <p className="font-semibold text-sm" style={{ color: COLORS.anthracite }}>
                    Spiel verlegen: {verlegung.spiel.ist_heimspiel ? verlegung.spiel.gastteam : verlegung.spiel.heimteam}
                  </p>
                </div>
                <p className="text-xs text-gray-500 mb-3">
                  Ursprünglich am {wochentagLang(verlegung.spiel.datum)}, {formatDatum(verlegung.spiel.datum)}{uhrzeit(verlegung.spiel.datum) ? ` um ${uhrzeit(verlegung.spiel.datum)}` : ""}. Solange kein Ersatztermin feststeht,
                  ist die Spalte gesperrt und niemand kann sich eintragen. Sobald du einen Termin einträgst,
                  wird die Spalte wieder freigegeben — bereits gegebene Rückmeldungen werden dabei zurückgesetzt,
                  weil sie sich auf den alten Termin bezogen.
                </p>
                <div className="grid sm:grid-cols-2 gap-3 mb-3">
                  <div className="min-w-0">
                    <label className="block text-xs text-gray-500 mb-1">Neuer Termin</label>
                    <input
                      type="datetime-local"
                      value={verlegung.datum}
                      onChange={(e) => setVerlegung({ ...verlegung, datum: e.target.value })}
                      style={{ width: "100%", minWidth: 0, maxWidth: "100%", boxSizing: "border-box", WebkitAppearance: "none", appearance: "none" }}
                      className="w-full border rounded-md px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="min-w-0">
                    <label className="block text-xs text-gray-500 mb-1">Grund (optional)</label>
                    <input
                      value={verlegung.grund}
                      onChange={(e) => setVerlegung({ ...verlegung, grund: e.target.value })}
                      placeholder="z. B. zu wenige Spieler"
                      className="w-full border rounded-md px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-gray-400 mb-2 flex items-start gap-1">
                  <Mail size={11} className="mt-0.5 shrink-0" />
                  <span>Sobald du einen neuen Termin ansetzt, bekommt deine Mannschaft automatisch eine E-Mail mit dem alten und dem neuen Termin.</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => verlegungSpeichern(true)}
                    disabled={verlegungLadend}
                    className="px-4 py-2 rounded-md text-white text-sm font-semibold"
                    style={{ background: COLORS.orange, opacity: verlegungLadend ? 0.6 : 1 }}
                  >
                    Neuen Termin ansetzen
                  </button>
                  <button
                    onClick={() => verlegungSpeichern(false)}
                    disabled={verlegungLadend}
                    className="px-4 py-2 rounded-md text-sm font-semibold border"
                    style={{ borderColor: COLORS.konflikt, color: COLORS.konflikt }}
                  >
                    Nur als verlegt markieren
                  </button>
                  {verlegung.spiel.verlegt && (
                    <button onClick={verlegungAufheben} disabled={verlegungLadend} className="px-4 py-2 rounded-md text-sm border">
                      Verlegung aufheben
                    </button>
                  )}
                  <button onClick={() => setVerlegung(null)} className="px-4 py-2 rounded-md text-sm border">
                    Abbrechen
                  </button>
                </div>
              </div>
            )}

            <table className="w-full text-sm min-w-[640px]">
              <thead className="sticky top-0 z-20">
                <tr style={{ background: COLORS.petrolDark }} className="text-white">
                  <th
                    className="p-3 text-left font-medium sticky left-0 z-30"
                    style={{ background: COLORS.petrolDark }}
                  >
                    Spieler
                  </th>
                  {spiele.map((s) => {
                    const tag = effektivesSpielDatum(s)?.slice(0, 10);
                    const parallel = (tag && ueberschneidungen[tag]) || [];
                    const hatUeberschneidung = parallel.length > 0;
                    const gesperrt = spielGesperrt(s);
                    const kopfStil = gesperrt
                      ? { background: "#4A4A44", borderBottom: "3px solid #6b6b63" }
                      : hatUeberschneidung
                      ? { background: COLORS.konflikt, borderBottom: `3px solid ${COLORS.konfliktHell}` }
                      : {};
                    return (
                      <th
                        key={s.id}
                        className="p-3 text-center font-medium min-w-[128px]"
                        style={{ background: COLORS.petrolDark, ...kopfStil }}
                      >
                        <div className="flex items-center justify-center gap-1">
                          <span style={s.verlegt && s.verlegt_auf ? { textDecoration: "line-through", opacity: 0.6 } : {}}>
                            {wochentagLang(s.datum)}, {formatDatum(s.datum)}
                          </span>
                          {hatUeberschneidung && !gesperrt && <CalendarClock size={13} />}
                        </div>
                        {!s.verlegt_auf && uhrzeit(s.datum) && (
                          <div className="text-[11px] font-normal opacity-80">{uhrzeit(s.datum)}</div>
                        )}
                        {s.verlegt && s.verlegt_auf && (
                          <div className="text-[11px] font-semibold mt-0.5">
                            → {wochentagLang(s.verlegt_auf)}, {formatDatum(s.verlegt_auf)}
                            {uhrzeit(s.verlegt_auf) && <span className="block font-normal opacity-90">{uhrzeit(s.verlegt_auf)}</span>}
                          </div>
                        )}
                        {gesperrt && <div className="text-[10px] font-semibold mt-0.5">verlegt · Termin offen</div>}
                        <div className="text-[11px] font-normal opacity-80">
                          <span
                            className="inline-block px-1.5 py-0.5 rounded-full text-[10px] font-semibold mb-0.5"
                            style={s.ist_heimspiel
                              ? { background: "rgba(255,255,255,0.18)" }
                              : { background: "rgba(226,99,43,0.85)" }}
                          >
                            {s.ist_heimspiel ? "Heim" : "Auswärts"}
                          </span>
                          <span className="block">{s.ist_heimspiel ? s.gastteam : s.heimteam}</span>
                        </div>
                        {hatUeberschneidung && !gesperrt && (
                          <div className="text-[10px] font-semibold mt-1 leading-tight">
                            parallel: {parallel.map((u) => u.mannschaftName).join(", ")}
                          </div>
                        )}
                        {darfPlanen && (
                          <button
                            onClick={() => verlegungOeffnen(s)}
                            className="text-[10px] font-normal underline mt-1 opacity-80"
                          >
                            {s.verlegt ? "Verlegung ändern" : "verlegen"}
                          </button>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {spieler.map((sp) => (
                  <tr key={sp.id} className="border-t">
                    <td className="p-3 font-medium sticky left-0 z-10 bg-white">
                      <div className="flex items-center gap-2">
                        <Avatar person={sp} groesse={28} />
                        <span className="whitespace-nowrap">{sp.vorname} {sp.nachname}</span>
                      </div>
                    </td>
                    {spiele.map((s) => {
                      const status = meldungen[s.id]?.[sp.id] ?? "offen";
                      const gesperrt = spielGesperrt(s);
                      const fremdeZeile = sp.id !== profil.id;
                      const darfSetzen = !gesperrt && (!fremdeZeile || (darfPlanen && schreibschutzAus));
                      const eigeneZeile = darfSetzen; // steuert Klickbarkeit und Deckkraft
                      const herkunft = gesetztVon[`${s.id}:${sp.id}`];
                      const tag = effektivesSpielDatum(s)?.slice(0, 10);
                      const hatUeberschneidung = tag && ueberschneidungen[tag]?.length > 0;
                      const schicht = schichtSichtbarFuer(sp, profil) ? schichtFuerDatum(sp, s.datum) : null;
                      const schichtStil = schicht ? SCHICHT_STIL[schicht] : null;
                      const style =
                        status === "ja"
                          ? { background: "#DDF0EA", color: COLORS.petrol }
                          : status === "nein"
                          ? { background: "#FBE2DA", color: COLORS.orangeDeep }
                          : { background: "#F1F1EF", color: "#999" };
                      return (
                        <td
                          key={s.id}
                          className="p-2 text-center"
                          style={gesperrt ? { background: "#EFEFEC" } : hatUeberschneidung ? { background: COLORS.konfliktHell } : {}}
                        >
                          <button
                            onClick={() => toggle(s.id, sp.id)}
                            disabled={!eigeneZeile}
                            className="w-full py-1.5 rounded-md text-xs font-semibold flex items-center justify-center gap-1"
                            style={
                              gesperrt
                                ? { background: "#E3E3DF", color: "#8a8a82", cursor: "default" }
                                : { ...style, opacity: eigeneZeile ? 1 : 0.7, cursor: eigeneZeile ? "pointer" : "default" }
                            }
                          >
                            {gesperrt && <CalendarClock size={13} />}
                            {!gesperrt && status === "ja" && <Check size={13} />}
                            {!gesperrt && status === "nein" && <X size={13} />}
                            {!gesperrt && status === "offen" && <HelpCircle size={13} />}
                            {gesperrt ? "verlegt" : status === "ja" ? "Kann" : status === "nein" ? "Kann nicht" : "Offen"}
                          </button>
                          {herkunft && !gesperrt && (
                            <span className="block text-[9px] text-gray-400 mt-0.5 leading-tight">
                              von {herkunft.vorname} eingetragen
                            </span>
                          )}
                          {schichtStil && (
                            <span
                              className="mt-1 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold"
                              style={{ background: schichtStil.background, color: schichtStil.color }}
                              title={`${sp.vorname} hat in dieser Woche ${schicht}`}
                            >
                              <Clock size={9} /> {schichtStil.kuerzel}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t">
                  <td className="p-3 text-xs font-semibold text-gray-500 sticky left-0 z-10 bg-white">Zusagen</td>
                  {spiele.map((s) => {
                    const ja = countJa(s.id);
                    const kritisch = ja < benoetigteSpieler;
                    const tag = s.datum?.slice(0, 10);
                    const hatUeberschneidung = tag && ueberschneidungen[tag]?.length > 0;
                    return (
                      <td key={s.id} className="p-2 text-center" style={hatUeberschneidung ? { background: COLORS.konfliktHell } : {}}>
                        <div
                          className="mx-auto w-fit px-2 py-1 rounded-md text-xs font-bold flex items-center gap-1"
                          style={kritisch ? { background: COLORS.orange, color: "white" } : { background: "#E4F2EE", color: COLORS.petrol }}
                        >
                          {kritisch && <AlertTriangle size={12} />}
                          {ja}/{spieler.length} zugesagt
                        </div>
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            </table>
          </div>

          {spiele.some((s) => countJa(s.id) < benoetigteSpieler) && (
            <div className="flex items-start gap-2 p-3 rounded-md text-sm" style={{ background: "#FBE2DA", color: COLORS.orangeDeep }}>
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">Zu wenige Zusagen</p>
                <p className="text-xs mt-0.5">
                  Mindestens ein Spiel hat aktuell weniger als {benoetigteSpieler} Zusagen (benötigte Spieleranzahl für diese Liga). Alle Spieler wurden bzw. werden per E-Mail informiert.
                </p>
              </div>
            </div>
          )}

          {spiele.some((s) => s.datum && ueberschneidungen[s.datum.slice(0, 10)]?.length > 0) && (
            <div
              className="rounded-md text-sm overflow-hidden"
              style={{ background: COLORS.konfliktHell, color: COLORS.konfliktDunkel, border: `1px solid ${COLORS.konflikt}` }}
            >
              <div className="flex items-center gap-2 px-3 py-2 font-semibold text-white" style={{ background: COLORS.konflikt }}>
                <CalendarClock size={16} className="shrink-0" />
                Terminüberschneidung mit Nachbar-Mannschaft
              </div>
              <div className="p-3 space-y-2">
                <p className="text-xs opacity-80">
                  An diesen Tagen spielt eine Nachbar-Mannschaft gleichzeitig — Aushilfen von dort stehen euch also nicht zur Verfügung.
                  Die betroffenen Spalten in der Tabelle sind violett hinterlegt.
                </p>
                {spiele
                  .filter((s) => s.datum && ueberschneidungen[s.datum.slice(0, 10)]?.length > 0)
                  .map((s) => (
                    <div key={s.id} className="text-xs rounded-md bg-white/70 p-2">
                      <p className="font-semibold">{formatDatum(s.datum)}</p>
                      <p className="mt-0.5">
                        Eigenes Spiel {s.ist_heimspiel ? "(Heimspiel)" : "(Auswärtsspiel)"} gegen {s.ist_heimspiel ? s.gastteam : s.heimteam}
                      </p>
                      {ueberschneidungen[s.datum.slice(0, 10)].map((u, i) => (
                        <p key={i} className="mt-0.5 flex items-start gap-1">
                          <CalendarClock size={11} className="mt-0.5 shrink-0" />
                          <span>
                            <span className="font-semibold">{u.mannschaftName}</span> spielt ebenfalls —{" "}
                            {u.istHeimspiel ? "Heimspiel" : "Auswärtsspiel"} gegen {u.gegner}
                          </span>
                        </p>
                      ))}
                    </div>
                  ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-4 text-[11px] text-gray-400">
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm inline-block" style={{ background: COLORS.orange }} /> zu wenige Zusagen
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm inline-block" style={{ background: COLORS.konflikt }} /> Terminüberschneidung
            </span>
            <span className="flex items-center gap-1">
              <Clock size={11} /> Schicht des Spielers in dieser Woche
            </span>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- Ergebnisse ---------- */

function Ergebnisse({ saison, profil }) {
  const [runde, setRunde] = useState("Hinrunde");
  const [spiele, setSpiele] = useState([]);
  const [ladend, setLadend] = useState(true);
  const [aktualisiertLadend, setAktualisiertLadend] = useState(false);
  const [fehler, setFehler] = useState(null);

  const [zuletztAktualisiert, setZuletztAktualisiert] = useState(null);
  const autoSchluessel = saison ? `spielplan-${saison.id}-${runde}` : null;

  async function laden(still = false) {
    if (!still) setLadend(true);
    const { data } = await supabase.from("verbands_spiele").select("*").eq("saison_id", saison.id).eq("runde", runde).order("datum");
    setSpiele(data ?? []);
    setLadend(false);
  }

  async function aktualisieren({ automatisch = false } = {}) {
    if (!automatisch) setFehler(null);
    autoAktualisierungMerken(autoSchluessel);
    setAktualisiertLadend(true);
    const { data, error } = await supabase.functions.invoke("fetch-spielplan", { body: { saisonId: saison.id, runde } });
    setAktualisiertLadend(false);
    setZuletztAktualisiert(letzterAbrufZeitpunkt(autoSchluessel));
    if (error || data?.error) {
      // Beim automatischen Abruf im Hintergrund bewusst still bleiben.
      if (!automatisch) setFehler(await echteFehlermeldung(error, data));
      return;
    }
    laden(true);
  }

  useEffect(() => {
    if (!saison) return;
    let abgebrochen = false;
    setZuletztAktualisiert(letzterAbrufZeitpunkt(autoSchluessel));
    (async () => {
      await laden();
      if (abgebrochen) return;
      if (autoAktualisierungFaellig(autoSchluessel)) aktualisieren({ automatisch: true });
    })();
    return () => { abgebrochen = true; };
  }, [saison, runde]);

  function ergebnisInfo(spiel) {
    if (!spiel.ergebnis) return { text: "noch nicht gespielt", ton: "offen" };
    const teile = spiel.ergebnis.split(":").map((t) => parseInt(t.trim(), 10));
    if (teile.length !== 2 || teile.some(isNaN)) return { text: spiel.ergebnis, ton: "offen" };
    const [heimPunkte, gastPunkte] = teile;
    const eigenePunkte = spiel.ist_heimspiel ? heimPunkte : gastPunkte;
    const gegnerPunkte = spiel.ist_heimspiel ? gastPunkte : heimPunkte;
    const ton = eigenePunkte > gegnerPunkte ? "sieg" : eigenePunkte < gegnerPunkte ? "niederlage" : "unentschieden";
    return { text: spiel.ergebnis, ton };
  }

  const tonFarben = {
    sieg: { background: "#DDF0EA", color: COLORS.petrol },
    niederlage: { background: "#FBE2DA", color: COLORS.orangeDeep },
    unentschieden: { background: "#F1F1EF", color: "#777" },
    offen: { background: "#F1F1EF", color: "#999" },
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-2">
          {["Hinrunde", "Rückrunde"].map((r) => (
            <button
              key={r}
              onClick={() => setRunde(r)}
              className="px-4 py-1.5 rounded-full text-sm font-semibold transition"
              style={
                runde === r
                  ? { background: COLORS.orange, color: "white" }
                  : { background: "#fff", color: COLORS.anthracite, border: "1px solid #ddd" }
              }
            >
              {r}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <SpieleExportMenu spiele={spiele} mannschaftName="TTV 97 Kamenz" profil={profil} />
          {aktualisiertLadend ? (
            <span>Aktualisiere…</span>
          ) : (
            zuletztAktualisiert && <span>Aktualisiert: {zuletztAktualisiert.toLocaleString("de-DE")}</span>
          )}
          {darfMannschaftVerwalten(profil, saison.mannschaft_id) && (
            <button
              onClick={() => aktualisieren()}
              className="px-3 py-1.5 rounded-md text-white text-xs font-semibold"
              style={{ background: COLORS.orange, opacity: aktualisiertLadend ? 0.6 : 1 }}
              disabled={aktualisiertLadend}
            >
              {aktualisiertLadend ? "Lädt…" : "Jetzt aktualisieren"}
            </button>
          )}
        </div>
      </div>
      {fehler && <p className="text-xs" style={{ color: COLORS.orangeDeep }}>{fehler}</p>}

      {ladend ? (
        <Leerzustand text="Lade Ergebnisse…" />
      ) : spiele.length === 0 ? (
        <Leerzustand text={`Noch keine Spiele für die ${runde} hinterlegt.`} />
      ) : (
        <div className="bg-white rounded-lg border divide-y">
          {spiele.map((s) => {
            const info = ergebnisInfo(s);
            return (
              <div key={s.id} className="flex items-center gap-4 p-4">
                <div className="flex-1">
                  <p className="font-medium text-sm" style={{ color: COLORS.anthracite }}>
                    {s.heimteam} <span className="text-gray-400 font-normal">vs</span> {s.gastteam}
                  </p>
                  <p className="text-xs text-gray-400">
                    {wochentagLang(effektivesSpielDatum(s))}, {formatDatum(effektivesSpielDatum(s))}
                    {uhrzeit(effektivesSpielDatum(s)) && ` · ${uhrzeit(effektivesSpielDatum(s))}`}
                    {" · "}{s.ist_heimspiel ? "Heimspiel" : "Auswärts"}
                    {s.verlegt && (
                      <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: COLORS.konfliktHell, color: COLORS.konfliktDunkel }}>
                        {s.verlegt_auf ? "verlegt" : "verlegt · Termin offen"}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {info.ton === "offen" && effektivesSpielDatum(s) && !spielGesperrt(s) && (
                    <KalenderExportMenu ereignis={spielAlsTermin(s, "TTV 97 Kamenz")} />
                  )}
                  <span className="text-sm font-bold px-3 py-1.5 rounded-md" style={tonFarben[info.ton]}>
                    {info.text}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function isoZuDatetimeLocal(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function zuIcsDatum(iso) {
  return new Date(iso).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function ereignisEndeOderPlusEineStunde(e) {
  return e.datum_ende ?? new Date(new Date(e.datum).getTime() + 60 * 60 * 1000).toISOString();
}

function icsHerunterladen(e) {
  icsDateiHerunterladen([e], e.titel);
}

/* ---------- Spiele in den eigenen Kalender ----------
   Aus Verbandsspielen werden Kalendereinträge gebaut: ein Spiel einzeln oder
   die ganze Saison als eine Datei. Verlegte Spiele wandern automatisch auf
   ihren neuen Termin, Spiele ohne Ersatztermin bleiben außen vor. */

function spielAlsTermin(spiel, mannschaftName) {
  const datum = effektivesSpielDatum(spiel);
  const gegner = spiel.ist_heimspiel ? spiel.gastteam : spiel.heimteam;
  return {
    id: `spiel-${spiel.id}`,
    titel: `${mannschaftName ?? "TTV 97 Kamenz"}: ${spiel.ist_heimspiel ? "Heim" : "Auswärts"} gegen ${gegner}`,
    datum,
    // Ein Punktspiel dauert erfahrungsgemäß rund drei Stunden
    datum_ende: new Date(new Date(datum).getTime() + 3 * 60 * 60 * 1000).toISOString(),
    ort: spiel.ist_heimspiel ? "Heimspielstätte" : gegner,
  };
}

function icsInhalt(termine) {
  const zeilen = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TTV 97 Kamenz//Mannschafts-App//DE",
  ];
  termine.forEach((t) => {
    zeilen.push(
      "BEGIN:VEVENT",
      `UID:${t.id}@ttv97-kamenz`,
      `DTSTAMP:${zuIcsDatum(new Date().toISOString())}`,
      `DTSTART:${zuIcsDatum(t.datum)}`,
      `DTEND:${zuIcsDatum(t.datum_ende ?? ereignisEndeOderPlusEineStunde(t))}`,
      `SUMMARY:${String(t.titel).replace(/\n/g, " ")}`,
      ...(t.ort ? [`LOCATION:${String(t.ort).replace(/\n/g, " ")}`] : []),
      "END:VEVENT"
    );
  });
  zeilen.push("END:VCALENDAR");
  return zeilen.join("\r\n");
}

function icsDateiHerunterladen(termine, dateiname) {
  const blob = new Blob([icsInhalt(termine)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${dateiname.replace(/[^\w äöüÄÖÜß-]/g, "")}.ics`;
  link.click();
  URL.revokeObjectURL(url);
}

function googleKalenderLink(e) {
  const start = zuIcsDatum(e.datum);
  const ende = zuIcsDatum(ereignisEndeOderPlusEineStunde(e));
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: e.titel,
    dates: `${start}/${ende}`,
    ...(e.ort ? { location: e.ort } : {}),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function SpieleExportMenu({ spiele, mannschaftName, profil }) {
  const [offen, setOffen] = useState(false);
  const [token, setToken] = useState(profil?.kalender_token ?? null);
  const [erstellt, setErstellt] = useState(false);

  // Nur Spiele mit gültigem Termin — verlegte ohne Ersatztermin bringen im Kalender nichts
  const termine = (spiele ?? [])
    .filter((s) => effektivesSpielDatum(s) && !spielGesperrt(s))
    .map((s) => spielAlsTermin(s, mannschaftName));

  if (termine.length === 0) return null;

  const aboAdresse = token ? `${KALENDER_FEED_BASIS}?token=${token}`.replace(/^https:/, "webcal:") : null;

  async function aboEinrichten() {
    const neuerWert = crypto.randomUUID();
    const { error } = await supabase.from("profiles").update({ kalender_token: neuerWert }).eq("id", profil.id);
    if (error) return;
    setToken(neuerWert);
    setErstellt(true); // der eigentliche Abo-Klick folgt gleich als zweiter Schritt
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOffen((o) => !o)}
        className="text-xs px-3 py-1.5 rounded-md font-semibold border flex items-center gap-1"
        style={{ borderColor: COLORS.petrol, color: COLORS.petrol }}
      >
        <CalendarPlus size={13} /> In meinen Kalender
      </button>
      {offen && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOffen(false)} />
          <div className="absolute right-0 mt-1 bg-white border rounded-md shadow-lg z-40 text-xs w-[280px] overflow-hidden">

            {/* Weg 1: dauerhaftes Abo — Änderungen kommen automatisch nach */}
            <div className="px-3 py-2.5">
              <p className="font-semibold mb-0.5" style={{ color: COLORS.anthracite }}>Dauerhaft abonnieren</p>
              <p className="text-[10px] text-gray-500 mb-2">
                Empfohlen: Verlegungen und neue Termine landen automatisch im Kalender. Die Einträge lassen
                sich dann nicht selbst bearbeiten — daran erkennst du, dass es wirklich ein Abo ist.
              </p>
              {aboAdresse ? (
                <a
                  href={aboAdresse}
                  onClick={() => setOffen(false)}
                  className="inline-block px-3 py-1.5 rounded-md text-white font-semibold"
                  style={{ background: COLORS.orange }}
                >
                  {erstellt ? "Jetzt abonnieren →" : "Abo öffnen"}
                </a>
              ) : (
                <button
                  onClick={aboEinrichten}
                  className="px-3 py-1.5 rounded-md text-white font-semibold"
                  style={{ background: COLORS.orange }}
                >
                  Abo einrichten
                </button>
              )}
            </div>

            {/* Weg 2: einmaliger Export — feste Kopie im eigenen Kalender */}
            <div className="px-3 py-2.5 border-t">
              <p className="font-semibold mb-0.5" style={{ color: COLORS.anthracite }}>Einmalig übernehmen</p>
              <p className="text-[10px] text-gray-500 mb-2">
                Legt eine feste Kopie in deinem Kalender an, die du selbst bearbeiten kannst. Spätere
                Verlegungen musst du dann von Hand nachtragen.
              </p>
              <button
                onClick={() => { icsDateiHerunterladen(termine, "TTV 97 Kamenz Spielplan"); setOffen(false); }}
                className="px-3 py-1.5 rounded-md font-semibold border"
                style={{ borderColor: COLORS.petrol, color: COLORS.petrol }}
              >
                Alle {termine.length} Spiele laden
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function KalenderExportMenu({ ereignis }) {
  const [offen, setOffen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOffen((o) => !o)} className="text-gray-400 hover:text-gray-600" title="Zum eigenen Kalender hinzufügen">
        <CalendarPlus size={16} />
      </button>
      {offen && (
        <div className="absolute right-0 mt-1 bg-white border rounded-md shadow-lg z-10 text-xs whitespace-nowrap overflow-hidden">
          <a
            href={googleKalenderLink(ereignis)}
            target="_blank"
            rel="noreferrer"
            onClick={() => setOffen(false)}
            className="block px-3 py-2 hover:bg-gray-50"
            style={{ color: COLORS.anthracite }}
          >
            Google Kalender
          </a>
          <button
            onClick={() => { icsHerunterladen(ereignis); setOffen(false); }}
            className="block w-full text-left px-3 py-2 hover:bg-gray-50"
            style={{ color: COLORS.anthracite }}
          >
            Apple / Outlook (.ics)
          </button>
        </div>
      )}
    </div>
  );
}

function Kalender({ profil }) {
  const [ereignisse, setEreignisse] = useState([]);
  const [mannschaften, setMannschaften] = useState([]);
  const [ladend, setLadend] = useState(true);
  const [form, setForm] = useState({ titel: "", datum: "", uhrzeit: "", dauerMinuten: 90, dauerMinutenEigen: 60, datumEnde: "", typ: "termin", zeitraum: false, perMail: true, mannschaftId: profil.ist_admin ? "" : (profil.mannschaft_id ?? "") });
  const [fehler, setFehler] = useState(null);

  const [bearbeitenId, setBearbeitenId] = useState(null);
  const [bearbeitenForm, setBearbeitenForm] = useState({ titel: "", datum: "", datumEnde: "", typ: "termin", mannschaftId: "" });

  async function laden() {
    setLadend(true);
    const [{ data }, { data: m }] = await Promise.all([
      supabase.from("kalender_ereignisse").select("*").order("datum"),
      supabase.from("mannschaften").select("*"),
    ]);
    setEreignisse(data ?? []);
    setMannschaften(sortiereMannschaften(m));
    setLadend(false);
  }

  useEffect(() => { laden(); }, []);

  async function anlegen() {
    setFehler(null);
    if (!form.titel || !form.datum || !form.uhrzeit) return setFehler("Titel, Datum und Uhrzeit sind Pflichtfelder.");
    if (form.zeitraum && !form.datumEnde) return setFehler("Bitte ein Enddatum für den Zeitraum angeben.");

    const effektiveDauerMinuten = form.dauerMinuten === "eigene" ? form.dauerMinutenEigen : form.dauerMinuten;

    const start = new Date(`${form.datum}T${form.uhrzeit}`);
    const ende = form.zeitraum
      ? new Date(form.datumEnde)
      : new Date(start.getTime() + Number(effektiveDauerMinuten) * 60000);

    const { error } = await supabase.from("kalender_ereignisse").insert({
      titel: form.titel,
      datum: start.toISOString(),
      datum_ende: ende.toISOString(),
      typ: form.typ,
      mannschaft_id: form.mannschaftId || null,
      erstellt_von: profil.id,
    });
    if (error) return setFehler(error.message);
    if (form.perMail) {
      supabase.functions.invoke("notify-kalender-eintrag", {
        body: { titel: form.titel, datum: start.toISOString(), typ: form.typ, mannschaftId: form.mannschaftId || null },
      }); // bewusst nicht awaited
    }
    setForm({ titel: "", datum: "", uhrzeit: "", dauerMinuten: 90, dauerMinutenEigen: 60, datumEnde: "", typ: "termin", zeitraum: false, perMail: true, mannschaftId: profil.ist_admin ? "" : (profil.mannschaft_id ?? "") });
    laden();
  }

  function bearbeitenStarten(e) {
    setBearbeitenId(e.id);
    setBearbeitenForm({
      titel: e.titel,
      datum: isoZuDatetimeLocal(e.datum),
      datumEnde: isoZuDatetimeLocal(e.datum_ende),
      typ: e.typ,
      mannschaftId: e.mannschaft_id ?? "",
    });
  }

  async function bearbeitenSpeichern() {
    if (!bearbeitenForm.titel || !bearbeitenForm.datum) return;
    await supabase
      .from("kalender_ereignisse")
      .update({
        titel: bearbeitenForm.titel,
        datum: new Date(bearbeitenForm.datum).toISOString(),
        datum_ende: bearbeitenForm.datumEnde ? new Date(bearbeitenForm.datumEnde).toISOString() : null,
        typ: bearbeitenForm.typ,
        mannschaft_id: bearbeitenForm.mannschaftId || null,
      })
      .eq("id", bearbeitenId);
    setBearbeitenId(null);
    laden();
  }

  const [loeschenBestaetigungId, setLoeschenBestaetigungId] = useState(null);

  async function loeschen(id) {
    if (loeschenBestaetigungId !== id) {
      setLoeschenBestaetigungId(id);
      return;
    }
    setLoeschenBestaetigungId(null);
    await supabase.from("kalender_ereignisse").delete().eq("id", id);
    laden();
  }

  const iconFor = { training: Users, spiel: Trophy, lehrgang: GraduationCap, termin: CalendarDays, vereinstreffen: Users, turnier: Trophy };

  return (
    <div className="space-y-4">
      {(profil.ist_admin || istTeamLeiter(profil)) && (
        <div className="bg-white rounded-lg border p-4">
          <SectionLabel icon={Plus}>Neuen Termin anlegen</SectionLabel>
          <div className="grid sm:grid-cols-2 gap-2 mb-2">
            <input placeholder="Titel" value={form.titel} onChange={(e) => setForm({ ...form, titel: e.target.value })} className="border rounded-md px-3 py-2 text-sm sm:col-span-2" />

            <div>
              <label className="block text-xs text-gray-400 mb-1">Datum</label>
              <input type="date" style={{ width: "100%", minWidth: 0, maxWidth: "100%", boxSizing: "border-box", WebkitAppearance: "none", appearance: "none" }} value={form.datum} onChange={(e) => setForm({ ...form, datum: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Uhrzeit</label>
              <input type="time" value={form.uhrzeit} onChange={(e) => setForm({ ...form, uhrzeit: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" />
            </div>

            {!form.zeitraum && (
              <div>
                <label className="block text-xs text-gray-400 mb-1">Dauer</label>
                <select
                  value={[30, 45, 60, 90, 120, 180, 240, 480].includes(form.dauerMinuten) ? form.dauerMinuten : "eigene"}
                  onChange={(e) => {
                    if (e.target.value === "eigene") {
                      setForm({ ...form, dauerMinuten: "eigene" });
                    } else {
                      setForm({ ...form, dauerMinuten: Number(e.target.value) });
                    }
                  }}
                  className="w-full border rounded-md px-3 py-2 text-sm"
                >
                  <option value={30}>30 Minuten</option>
                  <option value={45}>45 Minuten</option>
                  <option value={60}>1 Stunde</option>
                  <option value={90}>1,5 Stunden</option>
                  <option value={120}>2 Stunden</option>
                  <option value={180}>3 Stunden</option>
                  <option value={240}>4 Stunden</option>
                  <option value={480}>8 Stunden</option>
                  <option value="eigene">Eigene Dauer…</option>
                </select>
                {form.dauerMinuten === "eigene" && (
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      type="number"
                      min={1}
                      placeholder="Stunden"
                      onChange={(e) => setForm((f) => ({ ...f, dauerMinutenEigen: Number(e.target.value) * 60 }))}
                      className="w-full border rounded-md px-3 py-2 text-sm"
                    />
                    <span className="text-xs text-gray-400 shrink-0">Stunden</span>
                  </div>
                )}
              </div>
            )}
            <div>
              <label className="block text-xs text-gray-400 mb-1">Typ</label>
              <select value={form.typ} onChange={(e) => setForm({ ...form, typ: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm">
                <option value="training">Training</option>
                <option value="spiel">Spiel</option>
                <option value="lehrgang">Lehrgang</option>
                <option value="vereinstreffen">Vereinstreffen</option>
                <option value="turnier">Turnier</option>
                <option value="termin">Sonstiger Termin</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Sichtbar für</label>
              {profil.ist_admin ? (
                <select value={form.mannschaftId} onChange={(e) => setForm({ ...form, mannschaftId: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm">
                  <option value="">Alle Mannschaften</option>
                  {mannschaften.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              ) : (
                <p className="text-sm text-gray-500 border rounded-md px-3 py-2 bg-gray-50">
                  {mannschaften.find((m) => m.id === profil.mannschaft_id)?.name ?? "Nur deine Mannschaft"}
                </p>
              )}
            </div>

            <label className="flex items-center gap-2 text-sm sm:col-span-2 mt-1">
              <input
                type="checkbox"
                checked={form.zeitraum}
                onChange={(e) => setForm({ ...form, zeitraum: e.target.checked, datumEnde: e.target.checked ? form.datumEnde : "" })}
              />
              Zeitraum (geht über mehrere Tage, z. B. ein Lehrgang) — statt Dauer
            </label>

            {form.zeitraum && (
              <div className="sm:col-span-2">
                <label className="block text-xs text-gray-400 mb-1">Ende (Datum & Uhrzeit)</label>
                <input type="datetime-local" value={form.datumEnde} onChange={(e) => setForm({ ...form, datumEnde: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" />
              </div>
            )}

            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={form.perMail} onChange={(e) => setForm({ ...form, perMail: e.target.checked })} />
              Alle Spieler per E-Mail über diesen Termin informieren
              <span className="block text-[11px] text-gray-400 font-normal">
                Spieler, die Termin-E-Mails abgeschaltet haben, erhalten keine.
              </span>
            </label>
          </div>
          {fehler && <p className="text-xs mb-2" style={{ color: COLORS.orangeDeep }}>{fehler}</p>}
          <button onClick={anlegen} className="px-4 py-2 rounded-md text-white text-sm font-semibold" style={{ background: COLORS.orange }}>
            Termin anlegen
          </button>
        </div>
      )}

      {ladend ? (
        <Leerzustand text="Lade Kalender…" />
      ) : ereignisse.length === 0 ? (
        <Leerzustand text="Noch keine Termine eingetragen." />
      ) : (
        <div className="bg-white rounded-lg border divide-y">
          {ereignisse.map((e) => {
            const Icon = iconFor[e.typ] || CalendarDays;

            if (bearbeitenId === e.id) {
              return (
                <div key={e.id} className="p-4 space-y-2">
                  <input
                    value={bearbeitenForm.titel}
                    onChange={(ev) => setBearbeitenForm({ ...bearbeitenForm, titel: ev.target.value })}
                    className="w-full border rounded-md px-3 py-2 text-sm"
                  />
                  <div className="grid sm:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Beginn</label>
                      <input
                        type="datetime-local"
                        value={bearbeitenForm.datum}
                        onChange={(ev) => setBearbeitenForm({ ...bearbeitenForm, datum: ev.target.value })}
                        className="w-full border rounded-md px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Ende (optional)</label>
                      <input
                        type="datetime-local"
                        value={bearbeitenForm.datumEnde}
                        onChange={(ev) => setBearbeitenForm({ ...bearbeitenForm, datumEnde: ev.target.value })}
                        className="w-full border rounded-md px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                  <select
                    value={bearbeitenForm.typ}
                    onChange={(ev) => setBearbeitenForm({ ...bearbeitenForm, typ: ev.target.value })}
                    className="w-full border rounded-md px-3 py-2 text-sm"
                  >
                    <option value="training">Training</option>
                    <option value="spiel">Spiel</option>
                    <option value="lehrgang">Lehrgang</option>
                    <option value="vereinstreffen">Vereinstreffen</option>
                    <option value="turnier">Turnier</option>
                    <option value="termin">Sonstiger Termin</option>
                  </select>
                  <select
                    value={bearbeitenForm.mannschaftId}
                    onChange={(ev) => setBearbeitenForm({ ...bearbeitenForm, mannschaftId: ev.target.value })}
                    className="w-full border rounded-md px-3 py-2 text-sm"
                  >
                    <option value="">Alle Mannschaften</option>
                    {mannschaften.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                  <div className="flex gap-2 pt-1">
                    <button onClick={bearbeitenSpeichern} className="px-3 py-1.5 rounded-md text-white text-xs font-semibold" style={{ background: COLORS.orange }}>
                      Speichern
                    </button>
                    <button onClick={() => setBearbeitenId(null)} className="px-3 py-1.5 rounded-md text-xs border">
                      Abbrechen
                    </button>
                  </div>
                </div>
              );
            }

            const zeitraum =
              e.datum_ende && new Date(e.datum_ende).toDateString() !== new Date(e.datum).toDateString()
                ? `${formatDatum(e.datum)} – ${formatDatum(e.datum_ende)}`
                : formatDatum(e.datum);
            const mannschaftName = e.mannschaft_id ? mannschaften.find((m) => m.id === e.mannschaft_id)?.name : null;

            return (
              <div key={e.id} className="flex items-center gap-4 p-4">
                <div className="w-10 h-10 rounded-md flex items-center justify-center shrink-0" style={{ background: COLORS.petrolDark }}>
                  <Icon size={18} color="white" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-sm" style={{ color: COLORS.anthracite }}>{e.titel}</p>
                  <p className="text-xs text-gray-400">{zeitraum}{mannschaftName ? ` · nur ${mannschaftName}` : ""}</p>
                </div>
                {loeschenBestaetigungId === e.id ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-gray-500">Löschen?</span>
                    <button onClick={() => loeschen(e.id)} className="text-xs px-2 py-1 rounded-md text-white" style={{ background: COLORS.orangeDeep }}>
                      Ja
                    </button>
                    <button onClick={() => setLoeschenBestaetigungId(null)} className="text-xs px-2 py-1 rounded-md border">
                      Nein
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 shrink-0">
                    <KalenderExportMenu ereignis={e} />
                    {darfMannschaftVerwalten(profil, e.mannschaft_id) && (
                      <>
                        <button onClick={() => bearbeitenStarten(e)} className="text-gray-400 hover:text-gray-600">
                          <Pencil size={16} />
                        </button>
                        <button onClick={() => loeschen(e.id)} className="text-gray-400" style={{ color: COLORS.orangeDeep }}>
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------- Kader ---------- */

function Kader({ saison, profil }) {
  const [spieler, setSpieler] = useState([]);
  const [info, setInfo] = useState(null);
  const [ladend, setLadend] = useState(true);
  const [aktualisiertLadend, setAktualisiertLadend] = useState(false);
  const [fehler, setFehler] = useState(null);

  async function laden() {
    setLadend(true);
    const spielerQuery = saison.mannschaft_id
      ? supabase.from("profiles").select("*").eq("mannschaft_id", saison.mannschaft_id).order("nachname")
      : supabase.from("profiles").select("*").order("nachname");
    const [{ data: spielerDaten }, { data: infoDaten }] = await Promise.all([
      spielerQuery,
      supabase.from("mannschaft_info").select("*").eq("saison_id", saison.id).maybeSingle(),
    ]);
    setSpieler(spielerDaten ?? []);
    setInfo(infoDaten ?? null);
    setLadend(false);
  }

  useEffect(() => { if (saison) laden(); }, [saison]);

  async function aktualisieren() {
    setFehler(null);
    setAktualisiertLadend(true);
    const { data, error } = await supabase.functions.invoke("fetch-mannschaft", { body: { saisonId: saison.id } });
    setAktualisiertLadend(false);
    if (error || data?.error) {
      setFehler(await echteFehlermeldung(error, data));
      return;
    }
    laden();
  }

  if (ladend) return <Leerzustand text="Lade Kader…" />;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border p-5">
        <div className="flex items-center justify-between mb-3">
          <SectionLabel icon={Users}>Mannschafts-Infos (Verband)</SectionLabel>
          {darfMannschaftVerwalten(profil, saison.mannschaft_id) && (
            <button onClick={aktualisieren} className="text-xs px-3 py-1 rounded-md text-white font-semibold" style={{ background: COLORS.orange, opacity: aktualisiertLadend ? 0.6 : 1 }} disabled={aktualisiertLadend}>
              {aktualisiertLadend ? "Lädt…" : "Jetzt aktualisieren"}
            </button>
          )}
        </div>
        {fehler && <p className="text-xs mb-3" style={{ color: COLORS.orangeDeep }}>{fehler}</p>}
        {info ? (
          <>
            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-400 text-xs block">Mannschaftsführer</span>{info.mannschaftsfuehrer ?? "–"}</div>
              <div><span className="text-gray-400 text-xs block">Vertretung</span>{info.vertretung ?? "–"}</div>
              <div><span className="text-gray-400 text-xs block">Sportstätte</span>{info.sportstaette ?? "–"}</div>
              <div><span className="text-gray-400 text-xs block">Spieltag</span>{info.spieltag ?? "–"}</div>
            </div>
            {info.aufstellung_freigegeben && info.spieler && info.spieler.length > 0 ? (
              <div className="mt-4">
                <p className="text-xs text-gray-400 mb-2">Offizielle Aufstellung laut Verband:</p>
                <div className="divide-y border rounded-md">
                  {info.spieler.map((sp, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span className="text-gray-400 w-6">{sp.position}.</span>
                      <span className="flex-1">{sp.name}</span>
                      {sp.lpz && <span className="text-xs text-gray-400">LPZ {sp.lpz}</span>}
                    </div>
                  ))}
                </div>
              </div>
            ) : !info.aufstellung_freigegeben ? (
              <div className="flex items-start gap-2 p-3 rounded-md text-sm mt-4" style={{ background: "#F1F1EF", color: "#777" }}>
                <HelpCircle size={16} className="mt-0.5 shrink-0" />
                Der Verband hat die Aufstellungsliste für diese Saison noch nicht freigegeben. Bis dahin gilt die intern gepflegte Liste unten.
              </div>
            ) : null}
          </>
        ) : (
          <Leerzustand text={profil.ist_admin ? 'Noch keine Mannschafts-Infos hinterlegt — oben auf "Jetzt aktualisieren" klicken.' : "Noch keine Mannschafts-Infos hinterlegt."} />
        )}
      </div>

      {spieler.length === 0 ? (
        <Leerzustand text="Noch keine Spieler angelegt." />
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {spieler.map((s) => (
            <div key={s.id} className="bg-white rounded-lg border p-4 flex items-center gap-3">
              <Avatar person={s} groesse={40} />
              <div>
                <p className="font-medium text-sm" style={{ color: COLORS.anthracite }}>{s.vorname} {s.nachname}</p>
                <p className="text-xs" style={{ color: s.rang === "Mannschaftsführer" ? COLORS.orange : "#999" }}>{s.rang}</p>
                {s.kontakt_sichtbar && (
                  <div className="text-xs text-gray-400 mt-1">
                    {s.telefon_handy && <div>📱 {s.telefon_handy}</div>}
                    {s.telefon_festnetz && <div>☎️ {s.telefon_festnetz}</div>}
                    <div>✉️ {s.email}</div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Nachrichten-Generator für Einmalpasswort (WhatsApp/E-Mail) ---------- */

const APP_URL = "https://derkeili.github.io/ttv-kamenz-dashboard/";

function zugangsNachrichtText(vorname, email, passwort, art = "neu") {
  const einleitung =
    art === "reset"
      ? `dein Passwort für die TTV 97 Kamenz App wurde zurückgesetzt. Die neuen Daten haben wir dir auch schon
per E-Mail an ${email} geschickt — hier nochmal zum Nachschauen:`
      : `dein Zugang zur TTV 97 Kamenz App ist bereit. Die Daten haben wir dir auch schon
per E-Mail an ${email} geschickt — hier nochmal zum Nachschauen:`;

  return `Hallo ${vorname},

${einleitung}

E-Mail: ${email}
${art === "reset" ? "Neues Passwort" : "Einmalpasswort"}: ${passwort}

Anmelden hier: ${APP_URL}
Beim nächsten Login wirst du gebeten, dir ein eigenes Passwort zu vergeben.

Tipp: Du kannst dir die App wie eine normale App aufs Handy legen:
– iPhone: Seite in Safari öffnen → Teilen-Symbol → "Zum Home-Bildschirm"
– Android: Seite in Chrome öffnen → Menü (⋮) → "Zum Startbildschirm hinzufügen"

Sportliche Grüße
TTV 97 Kamenz e.V.`;
}

function ZugangsNachricht({ vorname, email, passwort, onAbschliessen, art = "neu" }) {
  const [kopiert, setKopiert] = useState(false);
  const text = zugangsNachrichtText(vorname, email, passwort, art);

  function kopieren() {
    navigator.clipboard?.writeText(text);
    setKopiert(true);
    setTimeout(() => setKopiert(false), 2000);
  }

  return (
    <div className="mt-4 p-3 rounded-md text-sm" style={{ background: "#DDF0EA", color: COLORS.petrol }}>
      <p className="font-semibold mb-1">
        {art === "reset"
          ? "Passwort zurückgesetzt — die neuen Daten sind bereits per E-Mail unterwegs."
          : "Zugang angelegt — die Zugangsdaten sind bereits per E-Mail unterwegs."}
      </p>
      <p className="text-xs mb-3 opacity-90">
        An {email} ist das Passwort automatisch rausgegangen. Du kannst denselben Text zusätzlich über
        WhatsApp oder einen anderen Messenger weitergeben — etwa wenn die E-Mail im Spam landet oder
        jemand seine Adresse selten abruft. Im Text steht, dass die Daten auch per E-Mail gekommen sind.
      </p>
      <p className="mb-2">
        {art === "reset" ? "Neues Passwort" : "Einmalpasswort"}: <strong className="font-mono">{passwort}</strong>
      </p>
      <textarea readOnly value={text} rows={8} className="w-full border rounded-md px-2 py-2 text-xs font-mono bg-white text-gray-700" />
      <div className="flex flex-wrap gap-2 mt-2">
        <button onClick={kopieren} className="text-xs px-3 py-1.5 rounded-md text-white font-semibold" style={{ background: COLORS.orange }}>
          {kopiert ? "Kopiert ✓" : "Text kopieren"}
        </button>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(text)}`}
          target="_blank"
          rel="noreferrer"
          className="text-xs px-3 py-1.5 rounded-md border font-semibold"
          style={{ color: COLORS.anthracite }}
        >
          In WhatsApp öffnen
        </a>
        <a
          href={`mailto:${email}?subject=${encodeURIComponent("Dein Zugang zur TTV 97 Kamenz App")}&body=${encodeURIComponent(text)}`}
          className="text-xs px-3 py-1.5 rounded-md border font-semibold"
          style={{ color: COLORS.anthracite }}
        >
          Per E-Mail öffnen
        </a>
        {onAbschliessen && (
          <button onClick={onAbschliessen} className="text-xs px-3 py-1.5 rounded-md font-semibold ml-auto" style={{ color: COLORS.petrol, textDecoration: "underline" }}>
            Anlegen abschließen
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------- Mannschaftsverwaltung (Teams + Saison-Links, nur Admin) ---------- */

function Mannschaftsverwaltung({ profil, saisons, onSaisonsGeaendert }) {
  const [mannschaften, setMannschaften] = useState([]);
  const [spielerListe, setSpielerListe] = useState([]);
  const [ladend, setLadend] = useState(true);

  const [neueMannschaft, setNeueMannschaft] = useState("");
  const [neueMannschaftVerbandsname, setNeueMannschaftVerbandsname] = useState("");
  const [neueMannschaftBenoetigteSpieler, setNeueMannschaftBenoetigteSpieler] = useState(4);
  const [neueMannschaftStufe, setNeueMannschaftStufe] = useState("");
  const [mannschaftFehler, setMannschaftFehler] = useState(null);
  const [bearbeiteMannschaftId, setBearbeiteMannschaftId] = useState(null);
  const [bearbeiteMannschaftName, setBearbeiteMannschaftName] = useState("");
  const [bearbeiteMannschaftVerbandsname, setBearbeiteMannschaftVerbandsname] = useState("");
  const [bearbeiteMannschaftBenoetigteSpieler, setBearbeiteMannschaftBenoetigteSpieler] = useState(4);
  const [bearbeiteMannschaftStufe, setBearbeiteMannschaftStufe] = useState("");
  const [mannschaftLoeschenBestaetigung, setMannschaftLoeschenBestaetigung] = useState(null);

  const [ausgewaehlteMannschaftId, setAusgewaehlteMannschaftId] = useState(profil.ist_admin ? "" : (profil.mannschaft_id ?? ""));
  const [neueBezeichnung, setNeueBezeichnung] = useState("");
  const [saisonFehler, setSaisonFehler] = useState(null);

  async function ladenAlles() {
    setLadend(true);
    const [{ data: m }, { data: s }] = await Promise.all([
      supabase.from("mannschaften").select("*"),
      supabase.from("profiles").select("*").order("nachname"),
    ]);
    const sortiert = sortiereMannschaften(m);
    if (m) setMannschaften(sortiert);
    if (s) setSpielerListe(s);
    if (profil.ist_admin) setAusgewaehlteMannschaftId((aktuell) => aktuell || sortiert[0]?.id || "");
    setLadend(false);
  }

  useEffect(() => { ladenAlles(); }, []);

  function spielerAnzahl(mannschaftId) {
    return spielerListe.filter((s) => s.mannschaft_id === mannschaftId).length;
  }

  async function mannschaftAnlegen() {
    setMannschaftFehler(null);
    if (!neueMannschaft.trim()) return;
    const { error } = await supabase.from("mannschaften").insert({
      name: neueMannschaft.trim(),
      verband_name: neueMannschaftVerbandsname.trim() || null,
      benoetigte_spieler: Number(neueMannschaftBenoetigteSpieler) || 4,
      hierarchie_stufe: neueMannschaftStufe ? Number(neueMannschaftStufe) : null,
    });
    if (error) return setMannschaftFehler(error.message);
    setNeueMannschaft("");
    setNeueMannschaftVerbandsname("");
    setNeueMannschaftBenoetigteSpieler(4);
    setNeueMannschaftStufe("");
    ladenAlles();
  }

  function mannschaftBearbeitenStarten(m) {
    setBearbeiteMannschaftId(m.id);
    setBearbeiteMannschaftName(m.name);
    setBearbeiteMannschaftVerbandsname(m.verband_name ?? "");
    setBearbeiteMannschaftBenoetigteSpieler(m.benoetigte_spieler ?? 4);
    setBearbeiteMannschaftStufe(m.hierarchie_stufe ?? "");
  }

  async function mannschaftUmbenennen() {
    if (!bearbeiteMannschaftName.trim()) return;
    const { error } = await supabase
      .from("mannschaften")
      .update({
        name: bearbeiteMannschaftName.trim(),
        verband_name: bearbeiteMannschaftVerbandsname.trim() || null,
        benoetigte_spieler: Number(bearbeiteMannschaftBenoetigteSpieler) || 4,
        hierarchie_stufe: bearbeiteMannschaftStufe ? Number(bearbeiteMannschaftStufe) : null,
      })
      .eq("id", bearbeiteMannschaftId);
    if (error) return setMannschaftFehler(error.message);
    setBearbeiteMannschaftId(null);
    ladenAlles();
  }

  async function mannschaftLoeschen(m) {
    setMannschaftFehler(null);
    if (spielerAnzahl(m.id) > 0) {
      return setMannschaftFehler(`"${m.name}" hat noch ${spielerAnzahl(m.id)} zugeordnete Spieler — bitte diese zuerst einem anderen Team zuordnen oder löschen.`);
    }
    if (mannschaftLoeschenBestaetigung !== m.id) {
      setMannschaftLoeschenBestaetigung(m.id);
      return;
    }
    setMannschaftLoeschenBestaetigung(null);
    const { error } = await supabase.from("mannschaften").delete().eq("id", m.id);
    if (error) return setMannschaftFehler("Löschen nicht möglich: " + error.message);
    ladenAlles();
  }

  async function updateSaisonField(id, field, value) {
    onSaisonsGeaendert((prev) => prev.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
    await supabase.from("saisons").update({ [field]: value }).eq("id", id);
  }

  async function saisonMannschaftZuordnen(saisonId) {
    if (!ausgewaehlteMannschaftId) return;
    await supabase.from("saisons").update({ mannschaft_id: ausgewaehlteMannschaftId }).eq("id", saisonId);
    const { data: alle } = await supabase.from("saisons").select("*").order("erstellt_am", { ascending: false });
    onSaisonsGeaendert(alle ?? []);
  }

  async function neueSaisonAnlegen() {
    setSaisonFehler(null);
    if (!neueBezeichnung.trim()) return;
    if (!ausgewaehlteMannschaftId) return setSaisonFehler("Bitte zuerst eine Mannschaft auswählen.");
    await supabase.from("saisons").update({ aktiv: false }).eq("mannschaft_id", ausgewaehlteMannschaftId);
    const { error } = await supabase.from("saisons").insert({ bezeichnung: neueBezeichnung, aktiv: true, mannschaft_id: ausgewaehlteMannschaftId });
    if (error) return setSaisonFehler(error.message);
    setNeueBezeichnung("");
    const { data: alle } = await supabase.from("saisons").select("*").order("erstellt_am", { ascending: false });
    onSaisonsGeaendert(alle ?? []);
  }

  const linkFelder = [
    { key: "tabellen_url", label: "Tabellen-Link", hinweis: "Tabelle → Aktuelle Tabelle" },
    { key: "mannschaft_url", label: "Mannschafts-Link (Aufstellung)", hinweis: "Mannschaften → eure Mannschaft" },
    { key: "spielplan_hinrunde_url", label: "Spielplan-Link Hinrunde", hinweis: "Spielplan → Vorrunde" },
    { key: "spielplan_rueckrunde_url", label: "Spielplan-Link Rückrunde", hinweis: "Spielplan → Rückrunde" },
  ];

  const saisonsFuerMannschaft = saisons.filter((s) => s.mannschaft_id === ausgewaehlteMannschaftId);
  const unzugeordneteSaisons = saisons.filter((s) => !s.mannschaft_id);

  if (ladend) return <Leerzustand text="Lade Mannschaften…" />;

  return (
    <div className="space-y-4 max-w-2xl">
      {profil.ist_admin && (
      <div className="bg-white rounded-lg border p-5">
        <SectionLabel icon={Users}>Mannschaften</SectionLabel>
        <div className="space-y-2 mb-3">
          {mannschaften.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-2 py-2 border-b last:border-b-0">
              {bearbeiteMannschaftId === m.id ? (
                <div className="flex-1 space-y-2">
                  <input value={bearbeiteMannschaftName} onChange={(e) => setBearbeiteMannschaftName(e.target.value)} placeholder="Name intern, z. B. 3. Mannschaft" className="w-full border rounded-md px-2 py-1 text-sm" />
                  <input value={bearbeiteMannschaftVerbandsname} onChange={(e) => setBearbeiteMannschaftVerbandsname(e.target.value)} placeholder="Exakter Name beim Verband, z. B. TTV 97 Kamenz 3" className="w-full border rounded-md px-2 py-1 text-sm" />
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Benötigte Spieler pro Spiel</label>
                    <input type="number" min={1} max={10} value={bearbeiteMannschaftBenoetigteSpieler} onChange={(e) => setBearbeiteMannschaftBenoetigteSpieler(e.target.value)} className="w-full border rounded-md px-2 py-1 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Rangstufe (1 = höchste Mannschaft)</label>
                    <input type="number" min={1} max={10} value={bearbeiteMannschaftStufe} onChange={(e) => setBearbeiteMannschaftStufe(e.target.value)} placeholder="z. B. 3 für die 3. Mannschaft" className="w-full border rounded-md px-2 py-1 text-sm" />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={mannschaftUmbenennen} className="text-xs px-2 py-1 rounded-md text-white" style={{ background: COLORS.orange }}>Speichern</button>
                    <button onClick={() => setBearbeiteMannschaftId(null)} className="text-xs px-2 py-1 rounded-md border">Abbrechen</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="text-sm">
                    <span className="font-medium" style={{ color: COLORS.anthracite }}>{m.name}</span>
                    <span className="text-xs text-gray-400 ml-2">{spielerAnzahl(m.id)} Spieler</span>
                    <div className="text-xs text-gray-400">
                      {m.verband_name ? `Verband: ${m.verband_name}` : "Kein Verbands-Name hinterlegt"}
                      {" · "}{m.benoetigte_spieler ?? 4} Spieler pro Spiel benötigt
                      {m.hierarchie_stufe ? ` · Rangstufe ${m.hierarchie_stufe}` : " · keine Rangstufe"}
                    </div>
                  </div>
                  {mannschaftLoeschenBestaetigung === m.id ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-gray-500">Wirklich löschen?</span>
                      <button onClick={() => mannschaftLoeschen(m)} className="text-xs px-2 py-1 rounded-md text-white" style={{ background: COLORS.orangeDeep }}>Ja, löschen</button>
                      <button onClick={() => setMannschaftLoeschenBestaetigung(null)} className="text-xs px-2 py-1 rounded-md border">Abbrechen</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 shrink-0">
                      <button onClick={() => mannschaftBearbeitenStarten(m)} className="text-gray-400 hover:text-gray-600"><Pencil size={15} /></button>
                      <button
                        onClick={() => mannschaftLoeschen(m)}
                        className={spielerAnzahl(m.id) > 0 ? "text-gray-300 cursor-not-allowed" : ""}
                        style={spielerAnzahl(m.id) === 0 ? { color: COLORS.orangeDeep } : {}}
                        title={spielerAnzahl(m.id) > 0 ? "Nur löschbar, wenn keine Spieler zugeordnet sind" : "Löschen"}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
          {mannschaften.length === 0 && <p className="text-sm text-gray-400">Noch keine Mannschaft angelegt.</p>}
        </div>
        {mannschaftFehler && <p className="text-xs mb-3" style={{ color: COLORS.orangeDeep }}>{mannschaftFehler}</p>}
        <div className="space-y-2">
          <input value={neueMannschaft} onChange={(e) => setNeueMannschaft(e.target.value)} placeholder="Name intern, z. B. 2. Mannschaft" className="w-full border rounded-md px-3 py-2 text-sm" />
          <input value={neueMannschaftVerbandsname} onChange={(e) => setNeueMannschaftVerbandsname(e.target.value)} placeholder="Exakter Name beim Verband, z. B. TTV 97 Kamenz 2" className="w-full border rounded-md px-3 py-2 text-sm" />
          <div>
            <label className="block text-xs text-gray-400 mb-1">Benötigte Spieler pro Spiel</label>
            <input type="number" min={1} max={10} value={neueMannschaftBenoetigteSpieler} onChange={(e) => setNeueMannschaftBenoetigteSpieler(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Rangstufe (1 = höchste Mannschaft)</label>
            <input type="number" min={1} max={10} value={neueMannschaftStufe} onChange={(e) => setNeueMannschaftStufe(e.target.value)} placeholder="z. B. 3 für die 3. Mannschaft" className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <button onClick={mannschaftAnlegen} className="px-4 py-2 rounded-md text-white text-sm font-semibold" style={{ background: COLORS.petrol }}>Mannschaft anlegen</button>
        </div>
      </div>
      )}

      <div className="bg-white rounded-lg border p-5">
        <SectionLabel icon={CalendarDays}>Saison-Links</SectionLabel>
        {profil.ist_admin ? (
          <select value={ausgewaehlteMannschaftId} onChange={(e) => setAusgewaehlteMannschaftId(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm mb-4">
            <option value="">Mannschaft wählen…</option>
            {mannschaften.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        ) : (
          <p className="text-sm text-gray-500 mb-4">
            Saison-Links für <strong>{mannschaften.find((m) => m.id === profil.mannschaft_id)?.name}</strong>
          </p>
        )}

        {unzugeordneteSaisons.length > 0 && profil.ist_admin && (
          <div className="mb-4 p-3 border rounded-md">
            <p className="text-xs text-gray-500 mb-2">Nicht zugeordnete Saisons — bitte der oben gewählten Mannschaft zuweisen:</p>
            {unzugeordneteSaisons.map((s) => (
              <div key={s.id} className="flex items-center justify-between text-sm py-1">
                <span>Saison {s.bezeichnung}</span>
                <button
                  onClick={() => saisonMannschaftZuordnen(s.id)}
                  disabled={!ausgewaehlteMannschaftId}
                  className="text-xs px-3 py-1.5 rounded-md text-white font-semibold"
                  style={{ background: COLORS.orange, opacity: ausgewaehlteMannschaftId ? 1 : 0.5 }}
                >
                  Zuordnen
                </button>
              </div>
            ))}
          </div>
        )}

        {ausgewaehlteMannschaftId && (
          <>
            <div className="space-y-4">
              {saisonsFuerMannschaft.map((s) => (
                <div key={s.id} className="border rounded-md p-4" style={s.aktiv ? { borderColor: COLORS.orange } : {}}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-semibold text-sm" style={{ color: COLORS.anthracite }}>Saison {s.bezeichnung}</span>
                    {s.aktiv && <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full text-white" style={{ background: COLORS.orange }}>aktiv</span>}
                  </div>
                  <div className="space-y-3">
                    {linkFelder.map((f) => (
                      <div key={f.key}>
                        <label className="block text-xs text-gray-500 mb-1">{f.label} <span className="text-gray-300">({f.hinweis})</span></label>
                        <input defaultValue={s[f.key] ?? ""} onBlur={(e) => updateSaisonField(s.id, f.key, e.target.value)} placeholder="https://bautzen.tischtennislive.de/…" className="w-full border rounded-md px-3 py-2 text-sm" />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {saisonsFuerMannschaft.length === 0 && <Leerzustand text="Noch keine Saison für diese Mannschaft angelegt." />}
            </div>
            {saisonFehler && <p className="text-xs mt-3" style={{ color: COLORS.orangeDeep }}>{saisonFehler}</p>}
            <div className="flex gap-2 mt-4 pt-4 border-t">
              <input value={neueBezeichnung} onChange={(e) => setNeueBezeichnung(e.target.value)} placeholder="z. B. 2027/2028" className="flex-1 border rounded-md px-3 py-2 text-sm" />
              <button onClick={neueSaisonAnlegen} className="px-4 py-2 rounded-md text-white text-sm font-semibold" style={{ background: COLORS.petrol }}>Neue Saison anlegen</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- Spielerverwaltung (Spieler, Kontakt-Import, Passwort-Reset — nur Admin) ---------- */

function Spielerverwaltung({ profil }) {
  const [mannschaften, setMannschaften] = useState([]);
  const [spielerListe, setSpielerListe] = useState([]);
  const [kontakte, setKontakte] = useState([]);
  const [form, setForm] = useState({ vorname: "", nachname: "", geburtstag: "", email: "", telefonHandy: "", telefonFestnetz: "", rang: "Spieler", mannschaftId: profil.ist_admin ? "" : (profil.mannschaft_id ?? "") });
  const [einmalpasswort, setEinmalpasswort] = useState(null);
  const [erstellterSpieler, setErstellterSpieler] = useState(null);
  const [fehler, setFehler] = useState(null);
  const [ladend, setLadend] = useState(false);
  const [bearbeitenKontaktId, setBearbeitenKontaktId] = useState(null);

  const [bearbeiteSpielerId, setBearbeiteSpielerId] = useState(null);
  const [bearbeiteSpielerForm, setBearbeiteSpielerForm] = useState(null);
  const [spielerBearbeitenFehler, setSpielerBearbeitenFehler] = useState(null);
  const [spielerBearbeitenLadend, setSpielerBearbeitenLadend] = useState(false);
  const [spielerLoeschenBestaetigung, setSpielerLoeschenBestaetigung] = useState(null);
  const [listenFehler, setListenFehler] = useState(null);
  const [spielerLoeschenLadend, setSpielerLoeschenLadend] = useState(false);

  const [zurueckgesetztFuerId, setZurueckgesetztFuerId] = useState(null);
  const [zurueckgesetztesPasswort, setZurueckgesetztesPasswort] = useState(null);
  const [resetLadendId, setResetLadendId] = useState(null);

  const [spielerFilter, setSpielerFilter] = useState("alle"); // "alle" | "unzugeordnet" | mannschaftId

  const sichtbareSpieler = profil.ist_admin ? spielerListe : spielerListe.filter((s) => s.mannschaft_id === profil.mannschaft_id);
  const gefilterteSpieler =
    spielerFilter === "alle" ? sichtbareSpieler
    : spielerFilter === "unzugeordnet" ? sichtbareSpieler.filter((s) => !s.mannschaft_id)
    : sichtbareSpieler.filter((s) => s.mannschaft_id === spielerFilter);
  const sichtbareMannschaften = profil.ist_admin ? mannschaften : mannschaften.filter((m) => m.id === profil.mannschaft_id);

  async function ladenAlles() {
    const [{ data: m }, { data: s }, { data: k }] = await Promise.all([
      supabase.from("mannschaften").select("*"),
      supabase.from("profiles").select("*").order("nachname"),
      supabase.from("spieler_kontakte").select("*").eq("aktiviert", false).order("nachname"),
    ]);
    if (m) setMannschaften(sortiereMannschaften(m));
    if (s) setSpielerListe(s);
    if (k) setKontakte(k);
  }

  useEffect(() => { ladenAlles(); }, []);

  function spielerBearbeitenStarten(s) {
    setSpielerBearbeitenFehler(null);
    setBearbeiteSpielerId(s.id);
    setBearbeiteSpielerForm({
      vorname: s.vorname,
      nachname: s.nachname,
      geburtstag: s.geburtstag ?? "",
      email: s.email,
      rang: s.rang,
      // Bereits vorhandene "keine Mannschaft" als bewusste Auswahl darstellen,
      // damit sie sich von "noch nichts gewählt" unterscheidet
      mannschaftId: s.mannschaft_id ?? (profil.ist_admin ? "ohne" : ""),
      istAdmin: s.ist_admin ?? false,
    });
  }

  async function spielerBearbeitenSpeichern() {
    setSpielerBearbeitenFehler(null);
    setSpielerBearbeitenLadend(true);
    const { data, error } = await supabase.functions.invoke("update-spieler", {
      body: {
        spielerId: bearbeiteSpielerId,
        ...bearbeiteSpielerForm,
        mannschaftId: bearbeiteSpielerForm.mannschaftId === "ohne" ? null : bearbeiteSpielerForm.mannschaftId,
      },
    });
    setSpielerBearbeitenLadend(false);
    if (error || data?.error) {
      setSpielerBearbeitenFehler(await echteFehlermeldung(error, data));
      return;
    }
    setBearbeiteSpielerId(null);
    ladenAlles();
  }

  async function spielerLoeschen(spielerId) {
    if (spielerLoeschenBestaetigung !== spielerId) {
      setSpielerLoeschenBestaetigung(spielerId);
      return;
    }
    setSpielerLoeschenLadend(true);
    const { data, error } = await supabase.functions.invoke("delete-spieler", { body: { spielerId } });
    setSpielerLoeschenLadend(false);
    setSpielerLoeschenBestaetigung(null);
    if (error || data?.error) {
      const meldung = await echteFehlermeldung(error, data);
      setFehler(meldung);
      setListenFehler(meldung); // direkt an der Spielerliste anzeigen, nicht nur oben am Formular
      return;
    }
    setListenFehler(null);
    ladenAlles();
  }

  function generierePasswort() {
    const zeichen = "ABCDEFGHKLMNPQRSTUVWXYZ23456789";
    return Array.from({ length: 10 }, () => zeichen[Math.floor(Math.random() * zeichen.length)]).join("");
  }

  async function passwortZuruecksetzen(spieler) {
    setResetLadendId(spieler.id);
    setZurueckgesetztFuerId(null);
    const neu = generierePasswort();
    const { data, error } = await supabase.functions.invoke("reset-spieler-passwort", {
      body: { spielerId: spieler.id, neuesPasswort: neu },
    });
    setResetLadendId(null);
    if (error || data?.error) {
      setFehler(await echteFehlermeldung(error, data));
      return;
    }
    setZurueckgesetztFuerId(spieler.id);
    setZurueckgesetztesPasswort(neu);
  }

  function kontaktUebernehmen(k) {
    setBearbeitenKontaktId(k.id);
    setForm({
      vorname: k.vorname,
      nachname: k.nachname,
      geburtstag: k.geburtstag ?? "",
      email: k.email ?? "",
      telefonHandy: k.telefon_handy ?? "",
      telefonFestnetz: k.telefon_festnetz ?? "",
      rang: "Spieler",
      mannschaftId: profil.ist_admin ? "" : (profil.mannschaft_id ?? ""),
    });
    setEinmalpasswort(null);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function spielerAnlegen() {
    setFehler(null);
    if (!form.vorname || !form.nachname || !form.email || !form.mannschaftId) {
      return setFehler("Bitte alle Pflichtfelder ausfüllen: Vorname, Nachname, E-Mail und Mannschaft. Auch 'Nicht zugewiesen' ist eine gültige Auswahl.");
    }
    setLadend(true);
    const einmalig = generierePasswort();

    const { data, error } = await supabase.functions.invoke("create-spieler", {
      body: {
        vorname: form.vorname,
        nachname: form.nachname,
        geburtstag: form.geburtstag,
        email: form.email,
        telefonHandy: form.telefonHandy,
        telefonFestnetz: form.telefonFestnetz,
        rang: form.rang,
        mannschaftId: form.mannschaftId === "ohne" ? null : form.mannschaftId,
        einmalpasswort: einmalig,
      },
    });

    setLadend(false);
    if (error || data?.error) {
      setFehler(await echteFehlermeldung(error, data));
      return;
    }
    setEinmalpasswort(einmalig);
    setErstellterSpieler({ vorname: form.vorname, email: form.email });

    if (bearbeitenKontaktId) {
      await supabase.from("spieler_kontakte").update({ aktiviert: true }).eq("id", bearbeitenKontaktId);
      setBearbeitenKontaktId(null);
    }

    setForm({ vorname: "", nachname: "", geburtstag: "", email: "", telefonHandy: "", telefonFestnetz: "", rang: "Spieler", mannschaftId: form.mannschaftId });
    ladenAlles();
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <KuendigungsAntraege profil={profil} onErledigt={ladenAlles} />

      {kontakte.length > 0 && (
        <div className="bg-white rounded-lg border p-5">
          <SectionLabel icon={Users}>Importierte Kontakte ({kontakte.length})</SectionLabel>
          <p className="text-xs text-gray-500 mb-3">Aus dem Telefonverzeichnis importiert, noch ohne App-Zugang. Klick auf „Übernehmen", um das Formular unten vorauszufüllen.</p>
          <div className="divide-y">
            {kontakte.map((k) => (
              <div key={k.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <span>{k.vorname} {k.nachname}</span>
                  <span className="text-xs text-gray-400 ml-2">{k.telefon_handy || k.telefon_festnetz || "keine Nummer"}</span>
                </div>
                <button onClick={() => kontaktUebernehmen(k)} className="text-xs px-3 py-1.5 rounded-md text-white font-semibold" style={{ background: COLORS.petrol }}>
                  Übernehmen
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border p-5">
        <SectionLabel icon={UserPlus}>Neuen Spieler anlegen</SectionLabel>
        {mannschaften.length === 0 && (
          <p className="text-xs mb-3" style={{ color: COLORS.orangeDeep }}>
            Noch keine Mannschaft vorhanden — bitte zuerst im Reiter „Mannschaften" eine anlegen.
          </p>
        )}
        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <div className="min-w-0">
            <label className="block text-xs text-gray-400 mb-1">Vorname *</label>
            <input placeholder="Vorname" value={form.vorname} onChange={(e) => setForm({ ...form, vorname: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div className="min-w-0">
            <label className="block text-xs text-gray-400 mb-1">Nachname *</label>
            <input placeholder="Nachname" value={form.nachname} onChange={(e) => setForm({ ...form, nachname: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div className="min-w-0 overflow-hidden">
            <label className="block text-xs text-gray-400 mb-1">Geburtsdatum</label>
            <input type="date" style={{ width: "100%", minWidth: 0, maxWidth: "100%", boxSizing: "border-box", WebkitAppearance: "none", appearance: "none" }} value={form.geburtstag} onChange={(e) => setForm({ ...form, geburtstag: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div className="min-w-0">
            <label className="block text-xs text-gray-400 mb-1">E-Mail *</label>
            <input placeholder="E-Mail" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div className="min-w-0">
            <label className="block text-xs text-gray-400 mb-1">Handynummer</label>
            <input placeholder="optional" value={form.telefonHandy} onChange={(e) => setForm({ ...form, telefonHandy: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div className="min-w-0">
            <label className="block text-xs text-gray-400 mb-1">Festnetznummer</label>
            <input placeholder="optional" value={form.telefonFestnetz} onChange={(e) => setForm({ ...form, telefonFestnetz: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div className="min-w-0">
            <label className="block text-xs text-gray-400 mb-1">Rolle</label>
            <select value={form.rang} onChange={(e) => setForm({ ...form, rang: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm">
              <option>Mannschaftsführer</option>
              <option>stellv. Mannschaftsführer</option>
              <option>Spieler</option>
              <option>Ersatz</option>
            </select>
          </div>
          <div className="min-w-0">
            <label className="block text-xs text-gray-400 mb-1">Mannschaft *</label>
            <select value={form.mannschaftId} onChange={(e) => setForm({ ...form, mannschaftId: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm">
              <option value="">Mannschaft wählen…</option>
              {sichtbareMannschaften.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              {profil.ist_admin && <option value="ohne">Nicht zugewiesen</option>}
            </select>
          </div>
        </div>
        <p className="text-xs text-gray-400 mb-3">Hinweis: Ob Telefonnummer und E-Mail für andere Spieler sichtbar sind, entscheidet jeder Spieler selbst in seinen Einstellungen.</p>
        {fehler && <p className="text-xs mb-3" style={{ color: COLORS.orangeDeep }}>{fehler}</p>}
        <button onClick={spielerAnlegen} disabled={ladend} className="px-4 py-2 rounded-md text-white text-sm font-semibold" style={{ background: COLORS.orange, opacity: ladend ? 0.6 : 1 }}>
          {ladend ? "Lege an…" : "Spieler anlegen"}
        </button>

        {einmalpasswort && erstellterSpieler && (
          <ZugangsNachricht
            vorname={erstellterSpieler.vorname}
            email={erstellterSpieler.email}
            passwort={einmalpasswort}
            onAbschliessen={() => { setEinmalpasswort(null); setErstellterSpieler(null); }}
          />
        )}
      </div>

      <div className="bg-white rounded-lg border p-5">
        <SectionLabel icon={Users}>{profil.ist_admin ? "Alle Spieler" : "Spieler meiner Mannschaft"}</SectionLabel>
        {profil.ist_admin && (
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              onClick={() => setSpielerFilter("alle")}
              className="px-3 py-1.5 rounded-full text-xs font-semibold"
              style={spielerFilter === "alle" ? { background: COLORS.orange, color: "white" } : { background: "#fff", border: "1px solid #ddd" }}
            >
              Alle
            </button>
            {sichtbareMannschaften.map((m) => (
              <button
                key={m.id}
                onClick={() => setSpielerFilter(m.id)}
                className="px-3 py-1.5 rounded-full text-xs font-semibold"
                style={spielerFilter === m.id ? { background: COLORS.orange, color: "white" } : { background: "#fff", border: "1px solid #ddd" }}
              >
                {m.name}
              </button>
            ))}
            <button
              onClick={() => setSpielerFilter("unzugeordnet")}
              className="px-3 py-1.5 rounded-full text-xs font-semibold"
              style={spielerFilter === "unzugeordnet" ? { background: COLORS.orange, color: "white" } : { background: "#fff", border: "1px solid #ddd" }}
            >
              Nicht zugewiesen
            </button>
          </div>
        )}
        {(() => {
          const offen = gefilterteSpieler.filter((s) => s.muss_passwort_aendern);
          if (offen.length === 0) return null;
          return (
            <p className="text-xs mb-3 p-2 rounded-md" style={{ background: "#FBE2DA", color: COLORS.orangeDeep }}>
              {offen.length === 1
                ? `${offen[0].vorname} ${offen[0].nachname} hat sich noch nie angemeldet und nutzt weiterhin das Einmalpasswort.`
                : `${offen.length} Spieler haben sich noch nie angemeldet: ${offen.map((s) => s.vorname).join(", ")}. Sie nutzen weiterhin ihr Einmalpasswort.`}
            </p>
          );
        })()}

        {listenFehler && (
          <p className="text-xs mb-3 p-2 rounded-md" style={{ background: "#FBE2DA", color: COLORS.orangeDeep }}>{listenFehler}</p>
        )}
        <div className="divide-y">
          {gefilterteSpieler.map((s) => {
            if (bearbeiteSpielerId === s.id) {
              return (
                <div key={s.id} className="py-3 space-y-2">
                  <div className="grid sm:grid-cols-2 gap-2">
                    <div className="min-w-0">
                      <label className="block text-xs text-gray-400 mb-1">Vorname</label>
                      <input value={bearbeiteSpielerForm.vorname} onChange={(e) => setBearbeiteSpielerForm({ ...bearbeiteSpielerForm, vorname: e.target.value })} placeholder="Vorname" className="w-full border rounded-md px-3 py-2 text-sm" />
                    </div>
                    <div className="min-w-0">
                      <label className="block text-xs text-gray-400 mb-1">Nachname</label>
                      <input value={bearbeiteSpielerForm.nachname} onChange={(e) => setBearbeiteSpielerForm({ ...bearbeiteSpielerForm, nachname: e.target.value })} placeholder="Nachname" className="w-full border rounded-md px-3 py-2 text-sm" />
                    </div>
                    <div className="min-w-0 overflow-hidden">
                      <label className="block text-xs text-gray-400 mb-1">Geburtsdatum</label>
                      <input type="date" style={{ width: "100%", minWidth: 0, maxWidth: "100%", boxSizing: "border-box", WebkitAppearance: "none", appearance: "none" }} value={bearbeiteSpielerForm.geburtstag} onChange={(e) => setBearbeiteSpielerForm({ ...bearbeiteSpielerForm, geburtstag: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" />
                    </div>
                    <div className="min-w-0">
                      <label className="block text-xs text-gray-400 mb-1">E-Mail</label>
                      <input value={bearbeiteSpielerForm.email} onChange={(e) => setBearbeiteSpielerForm({ ...bearbeiteSpielerForm, email: e.target.value })} placeholder="E-Mail" className="w-full border rounded-md px-3 py-2 text-sm" />
                    </div>
                    <div className="min-w-0">
                      <label className="block text-xs text-gray-400 mb-1">Rolle</label>
                      <select value={bearbeiteSpielerForm.rang} onChange={(e) => setBearbeiteSpielerForm({ ...bearbeiteSpielerForm, rang: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm">
                        <option>Mannschaftsführer</option>
                        <option>stellv. Mannschaftsführer</option>
                        <option>Spieler</option>
                        <option>Ersatz</option>
                      </select>
                    </div>
                    <div className="min-w-0">
                      <label className="block text-xs text-gray-400 mb-1">Mannschaft</label>
                      <select value={bearbeiteSpielerForm.mannschaftId} onChange={(e) => setBearbeiteSpielerForm({ ...bearbeiteSpielerForm, mannschaftId: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm">
                        <option value="">Mannschaft wählen…</option>
                        {sichtbareMannschaften.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                        {profil.ist_admin && <option value="ohne">Nicht zugewiesen</option>}
                      </select>
                    </div>
                  </div>
                  {profil.ist_admin && (
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={bearbeiteSpielerForm.istAdmin}
                        onChange={(e) => setBearbeiteSpielerForm({ ...bearbeiteSpielerForm, istAdmin: e.target.checked })}
                      />
                      Administrator-Rechte (voller Zugriff auf alle Mannschaften)
                    </label>
                  )}
                  {spielerBearbeitenFehler && <p className="text-xs" style={{ color: COLORS.orangeDeep }}>{spielerBearbeitenFehler}</p>}
                  <div className="flex gap-2">
                    <button onClick={spielerBearbeitenSpeichern} disabled={spielerBearbeitenLadend} className="px-3 py-1.5 rounded-md text-white text-xs font-semibold" style={{ background: COLORS.orange, opacity: spielerBearbeitenLadend ? 0.6 : 1 }}>
                      {spielerBearbeitenLadend ? "Speichere…" : "Speichern"}
                    </button>
                    <button onClick={() => setBearbeiteSpielerId(null)} className="px-3 py-1.5 rounded-md text-xs border">Abbrechen</button>
                  </div>
                </div>
              );
            }

            return (
              <div key={s.id} className="py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Avatar person={s} groesse={32} />
                    <div className="min-w-0">
                      <span className="text-sm">{s.vorname} {s.nachname}</span>
                      <span className="text-xs text-gray-400 ml-2">{s.rang}</span>
                      {!s.mannschaft_id && (
                        <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full ml-2" style={{ background: "#F1F1EF", color: "#999" }}>
                          Nicht zugewiesen
                        </span>
                      )}
                      {s.ist_admin && (
                        <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full text-white ml-2" style={{ background: COLORS.orange }}>
                          Admin
                        </span>
                      )}
                      {/* Zeigt, wer sich noch nie selbst angemeldet und ein eigenes Passwort vergeben hat */}
                      {s.muss_passwort_aendern ? (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full ml-2 inline-flex items-center gap-1"
                          style={{ background: "#FBE2DA", color: COLORS.orangeDeep }}
                          title="Nutzt noch das Einmalpasswort — hat sich also noch nicht selbst angemeldet"
                        >
                          <KeyRound size={9} /> noch nicht angemeldet
                        </span>
                      ) : (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full ml-2 inline-flex items-center gap-1"
                          style={{ background: "#DDF0EA", color: COLORS.petrol }}
                          title="Hat sich angemeldet und ein eigenes Passwort vergeben"
                        >
                          <Check size={9} /> aktiv
                        </span>
                      )}
                    </div>
                  </div>
                  {spielerLoeschenBestaetigung === s.id ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-gray-500">Löschen?</span>
                      <button onClick={() => spielerLoeschen(s.id)} disabled={spielerLoeschenLadend} className="text-xs px-2 py-1 rounded-md text-white" style={{ background: COLORS.orangeDeep }}>
                        {spielerLoeschenLadend ? "…" : "Ja"}
                      </button>
                      <button onClick={() => setSpielerLoeschenBestaetigung(null)} className="text-xs px-2 py-1 rounded-md border">Nein</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 shrink-0">
                      <button onClick={() => passwortZuruecksetzen(s)} disabled={resetLadendId === s.id} className="text-xs underline" style={{ color: COLORS.petrol }}>
                        {resetLadendId === s.id ? "…" : "Passwort zurücksetzen"}
                      </button>
                      <button onClick={() => spielerBearbeitenStarten(s)} className="text-gray-400 hover:text-gray-600"><Pencil size={15} /></button>
                      <button onClick={() => spielerLoeschen(s.id)} style={{ color: COLORS.orangeDeep }}><Trash2 size={15} /></button>
                    </div>
                  )}
                </div>
                {zurueckgesetztFuerId === s.id && (
                  <ZugangsNachricht
                    art="reset"
                    vorname={s.vorname}
                    email={s.email}
                    passwort={zurueckgesetztesPasswort}
                    onAbschliessen={() => { setZurueckgesetztFuerId(null); setZurueckgesetztesPasswort(null); }}
                  />
                )}
              </div>
            );
          })}
          {gefilterteSpieler.length === 0 && <p className="text-sm text-gray-400">Keine Spieler in dieser Auswahl.</p>}
        </div>
      </div>
    </div>
  );
}

/* ---------- Umfragen ---------- */

function Umfragen({ profil, zielUmfrageId }) {
  const [umfragen, setUmfragen] = useState([]);
  const [antwortenNachUmfrage, setAntwortenNachUmfrage] = useState({});
  const [zieleNachUmfrage, setZieleNachUmfrage] = useState({}); // { [umfrageId]: spielerId[] } – leer = "alle"
  const [spielerListe, setSpielerListe] = useState([]);
  const [mannschaften, setMannschaften] = useState([]);
  const [ladend, setLadend] = useState(true);

  const [form, setForm] = useState({
    titel: "", beschreibung: "", optionen: ["", ""], mehrfachauswahl: false, anonym: false,
    empfaenger: profil.ist_admin ? "alle" : "mannschaft",
    einzelneIds: [], mannschaftId: profil.ist_admin ? "" : (profil.mannschaft_id ?? ""), endetAm: "",
  });
  const [fehler, setFehler] = useState(null);
  const [speichernLadend, setSpeichernLadend] = useState(false);

  async function laden() {
    setLadend(true);
    const [{ data: umfragenDaten }, { data: antwortenDaten }, { data: spielerDaten }, { data: zieleDaten }, { data: mannschaftenDaten }] = await Promise.all([
      supabase.from("umfragen").select("*").eq("aktiv", true).order("erstellt_am", { ascending: false }),
      supabase.from("umfrage_antworten").select("umfrage_id, spieler_id, ausgewaehlte_optionen"),
      supabase.from("profiles").select("id, vorname, nachname"),
      supabase.from("umfrage_ziele").select("umfrage_id, spieler_id"),
      supabase.from("mannschaften").select("*"),
    ]);
    setUmfragen(umfragenDaten ?? []);
    setSpielerListe(spielerDaten ?? []);
    setMannschaften(sortiereMannschaften(mannschaftenDaten));
    const antwortenGruppiert = {};
    (antwortenDaten ?? []).forEach((a) => {
      if (!antwortenGruppiert[a.umfrage_id]) antwortenGruppiert[a.umfrage_id] = [];
      antwortenGruppiert[a.umfrage_id].push(a);
    });
    setAntwortenNachUmfrage(antwortenGruppiert);
    const zieleGruppiert = {};
    (zieleDaten ?? []).forEach((z) => {
      if (!zieleGruppiert[z.umfrage_id]) zieleGruppiert[z.umfrage_id] = [];
      zieleGruppiert[z.umfrage_id].push(z.spieler_id);
    });
    setZieleNachUmfrage(zieleGruppiert);
    setLadend(false);
  }

  useEffect(() => { laden(); }, []);

  useEffect(() => {
    if (!zielUmfrageId || ladend) return;
    const element = document.getElementById(`umfrage-${zielUmfrageId}`);
    if (element) element.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [zielUmfrageId, ladend]);

  async function abstimmen(umfrageId, mehrfachauswahl, gewaehlt) {
    await supabase.from("umfrage_antworten").upsert(
      { umfrage_id: umfrageId, spieler_id: profil.id, ausgewaehlte_optionen: gewaehlt, beantwortet_am: new Date().toISOString() },
      { onConflict: "umfrage_id,spieler_id" }
    );
    laden();
  }

  // Aus einer Verlegungs-Umfrage heraus einen Termin verbindlich ansetzen.
  // Das betroffene Spiel wird auf den neuen Termin gelegt und die Umfrage beendet.
  async function terminAnsetzen(umfrage, datumTag) {
    if (!umfrage.bezug_spiel_id) return setFehler("Zu dieser Umfrage ist kein Spiel hinterlegt.");
    setFehler(null);

    const { data: spiel } = await supabase
      .from("verbands_spiele")
      .select("*")
      .eq("id", umfrage.bezug_spiel_id)
      .maybeSingle();
    if (!spiel) return setFehler("Das zugehörige Spiel wurde nicht gefunden.");

    // Anspielzeit vom ursprünglichen Termin übernehmen
    const ursprung = new Date(spiel.datum);
    const [jahr, monat, tag] = datumTag.split("-").map(Number);
    const neuerTermin = new Date(jahr, monat - 1, tag, ursprung.getHours(), ursprung.getMinutes(), 0, 0);

    const bestaetigt = window.confirm(
      `Spiel gegen ${spiel.ist_heimspiel ? spiel.gastteam : spiel.heimteam} verbindlich auf ` +
      `${neuerTermin.toLocaleString("de-DE", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })} Uhr legen?\n\n` +
      `Bitte nur bestätigen, wenn der Termin mit dem Gegner abgesprochen ist. ` +
      `Die bisherigen Rückmeldungen zu diesem Spiel werden zurückgesetzt.`
    );
    if (!bestaetigt) return;

    const { error } = await supabase
      .from("verbands_spiele")
      .update({
        verlegt: true,
        verlegt_auf: neuerTermin.toISOString(),
        verlegt_grund: "Neuer Termin aus der Umfrage",
        verlegt_von: profil.id,
        verlegt_am: new Date().toISOString(),
      })
      .eq("id", spiel.id);
    if (error) return setFehler(error.message);

    await supabase.from("spielerplanung_meldungen").delete().eq("spiel_id", spiel.id);
    await supabase.from("umfragen").update({ endet_am: new Date().toISOString() }).eq("id", umfrage.id);

    supabase.functions.invoke("notify-spielverlegung", {
      body: {
        spielId: spiel.id,
        neuerTermin: neuerTermin.toISOString(),
        altesDatum: spiel.datum,
        grund: "Termin aus der Umfrage übernommen",
        mannschaftId: umfrage.ziel_mannschaft_id ?? umfrage.mannschaft_id ?? null,
      },
    }); // bewusst nicht awaited

    laden();
  }

  async function beenden(umfrageId) {
    await supabase.from("umfragen").update({ endet_am: new Date().toISOString() }).eq("id", umfrageId);
    laden();
  }

  async function loeschen(umfrageId) {
    await supabase.from("umfragen").delete().eq("id", umfrageId);
    laden();
  }

  function optionHinzufuegen() {
    setForm((f) => ({ ...f, optionen: [...f.optionen, ""] }));
  }
  function optionAendern(i, wert) {
    setForm((f) => ({ ...f, optionen: f.optionen.map((o, idx) => (idx === i ? wert : o)) }));
  }
  function optionEntfernen(i) {
    setForm((f) => ({ ...f, optionen: f.optionen.filter((_, idx) => idx !== i) }));
  }

  async function umfrageErstellen() {
    setFehler(null);
    const optionenBereinigt = form.optionen.map((o) => o.trim()).filter(Boolean);
    if (!form.titel.trim()) return setFehler("Bitte einen Titel eingeben.");
    if (optionenBereinigt.length < 2) return setFehler("Bitte mindestens 2 Antwortoptionen angeben.");
    if (form.empfaenger === "einzeln" && form.einzelneIds.length === 0) return setFehler("Bitte mindestens einen Spieler auswählen.");
    if (form.empfaenger === "mannschaft" && !form.mannschaftId) return setFehler("Bitte eine Mannschaft auswählen.");

    // Team-Leiter müssen (wegen der Datenbank-Berechtigung) immer ihre eigene Mannschaft als
    // Bezug hinterlegen, auch wenn sie einzelne Spieler auswählen. Die eigentliche Sichtbarkeit
    // steuern trotzdem weiterhin die einzelnen Ziel-Einträge unten.
    const mannschaftIdFuerInsert = form.empfaenger === "mannschaft"
      ? form.mannschaftId
      : (!profil.ist_admin ? profil.mannschaft_id : null);

    setSpeichernLadend(true);
    const { data: neueUmfrage, error } = await supabase
      .from("umfragen")
      .insert({
        titel: form.titel.trim(),
        beschreibung: form.beschreibung.trim() || null,
        optionen: optionenBereinigt,
        mehrfachauswahl: form.mehrfachauswahl,
        anonym: form.anonym,
        erstellt_von: profil.id,
        mannschaft_id: mannschaftIdFuerInsert,
        endet_am: form.endetAm ? new Date(form.endetAm).toISOString() : null,
      })
      .select()
      .single();

    if (error) {
      setSpeichernLadend(false);
      return setFehler(error.message);
    }

    let empfaengerIds = null;
    if (form.empfaenger === "einzeln") {
      empfaengerIds = form.einzelneIds;
    } else if (form.empfaenger === "mannschaft") {
      const { data: teamSpieler } = await supabase.from("profiles").select("id").eq("mannschaft_id", form.mannschaftId);
      empfaengerIds = (teamSpieler ?? []).map((s) => s.id);
    }

    if (empfaengerIds) {
      await supabase.from("umfrage_ziele").insert(empfaengerIds.map((spieler_id) => ({ umfrage_id: neueUmfrage.id, spieler_id })));
    }

    supabase.functions.invoke("notify-neue-umfrage", {
      body: { titel: form.titel.trim(), beschreibung: form.beschreibung.trim() || null, empfaengerIds },
    }); // bewusst nicht awaited

    setSpeichernLadend(false);
    setForm({
      titel: "", beschreibung: "", optionen: ["", ""], mehrfachauswahl: false, anonym: false,
      empfaenger: profil.ist_admin ? "alle" : "mannschaft",
      einzelneIds: [], mannschaftId: profil.ist_admin ? "" : (profil.mannschaft_id ?? ""), endetAm: "",
    });
    laden();
  }

  if (ladend) return <Leerzustand text="Lade Umfragen…" />;

  return (
    <div className="space-y-4 max-w-2xl">
      {(profil.ist_admin || istTeamLeiter(profil)) && (
        <div className="bg-white rounded-lg border p-5">
          <SectionLabel icon={Vote}>Neue Umfrage erstellen</SectionLabel>
          <input
            placeholder="Titel"
            value={form.titel}
            onChange={(e) => setForm({ ...form, titel: e.target.value })}
            className="w-full border rounded-md px-3 py-2 text-sm mb-3"
          />
          <textarea
            placeholder="Beschreibung (optional)"
            value={form.beschreibung}
            onChange={(e) => setForm({ ...form, beschreibung: e.target.value })}
            className="w-full border rounded-md px-3 py-2 text-sm mb-3"
            rows={2}
          />
          <label className="block text-xs text-gray-500 mb-1">Antwortoptionen</label>
          <div className="space-y-2 mb-2">
            {form.optionen.map((o, i) => (
              <div key={i} className="flex gap-2">
                <input
                  value={o}
                  onChange={(e) => optionAendern(i, e.target.value)}
                  placeholder={`Option ${i + 1}`}
                  className="flex-1 border rounded-md px-3 py-2 text-sm"
                />
                {form.optionen.length > 2 && (
                  <button onClick={() => optionEntfernen(i)} className="px-2 text-gray-400">
                    <X size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button onClick={optionHinzufuegen} className="text-xs mb-4" style={{ color: COLORS.petrol }}>
            + weitere Option
          </button>

          <label className="flex items-center gap-2 text-sm mb-4">
            <input type="checkbox" checked={form.mehrfachauswahl} onChange={(e) => setForm({ ...form, mehrfachauswahl: e.target.checked })} />
            Mehrfachauswahl erlauben
          </label>

          <label className="flex items-center gap-2 text-sm mb-4">
            <input type="checkbox" checked={form.anonym} onChange={(e) => setForm({ ...form, anonym: e.target.checked })} />
            Anonym (niemand sieht, wer wie abgestimmt hat — nur das Gesamtergebnis)
          </label>

          <label className="block text-xs text-gray-500 mb-1">Empfänger</label>
          <div className="flex gap-2 mb-3">
            {profil.ist_admin && (
              <button
                onClick={() => setForm({ ...form, empfaenger: "alle" })}
                className="px-3 py-1.5 rounded-full text-sm font-semibold"
                style={form.empfaenger === "alle" ? { background: COLORS.orange, color: "white" } : { background: "#fff", border: "1px solid #ddd" }}
              >
                Alle Spieler
              </button>
            )}
            <button
              onClick={() => setForm({ ...form, empfaenger: "einzeln" })}
              className="px-3 py-1.5 rounded-full text-sm font-semibold"
              style={form.empfaenger === "einzeln" ? { background: COLORS.orange, color: "white" } : { background: "#fff", border: "1px solid #ddd" }}
            >
              Einzelne Spieler
            </button>
            <button
              onClick={() => setForm({ ...form, empfaenger: "mannschaft", mannschaftId: profil.ist_admin ? form.mannschaftId : profil.mannschaft_id })}
              className="px-3 py-1.5 rounded-full text-sm font-semibold"
              style={form.empfaenger === "mannschaft" ? { background: COLORS.orange, color: "white" } : { background: "#fff", border: "1px solid #ddd" }}
            >
              {profil.ist_admin ? "Eine Mannschaft" : "Meine Mannschaft"}
            </button>
          </div>

          {form.empfaenger === "mannschaft" && profil.ist_admin && (
            <select
              value={form.mannschaftId}
              onChange={(e) => setForm({ ...form, mannschaftId: e.target.value })}
              className="w-full border rounded-md px-3 py-2 text-sm mb-3"
            >
              <option value="">Mannschaft wählen…</option>
              {mannschaften.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          )}

          {form.empfaenger === "einzeln" && (
            <div className="grid sm:grid-cols-2 gap-1 mb-3 max-h-40 overflow-y-auto border rounded-md p-2">
              {spielerListe.filter((s) => profil.ist_admin || s.mannschaft_id === profil.mannschaft_id).map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm py-1">
                  <input
                    type="checkbox"
                    checked={form.einzelneIds.includes(s.id)}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        einzelneIds: e.target.checked ? [...f.einzelneIds, s.id] : f.einzelneIds.filter((id) => id !== s.id),
                      }))
                    }
                  />
                  {s.vorname} {s.nachname}
                </label>
              ))}
            </div>
          )}

          <label className="block text-xs text-gray-500 mb-1">
            Endet am (optional — sonst läuft die Umfrage, bis alle abgestimmt haben oder du sie manuell beendest)
          </label>
          <div className="flex gap-2 mb-4">
            <input
              type="datetime-local"
              value={form.endetAm}
              onChange={(e) => setForm({ ...form, endetAm: e.target.value })}
              className="flex-1 border rounded-md px-3 py-2 text-sm"
            />
            {form.endetAm && (
              <button
                type="button"
                onClick={() => setForm({ ...form, endetAm: "" })}
                className="px-3 py-2 rounded-md text-sm border text-gray-500"
              >
                Leeren
              </button>
            )}
          </div>

          <p className="text-xs text-gray-500 mb-3 flex items-start gap-1.5">
            <Mail size={13} className="mt-0.5 shrink-0" />
            <span>
              Alle ausgewählten Spieler bekommen die Umfrage automatisch per E-Mail zugeschickt — außer sie
              haben E-Mails zu Umfragen in ihren Einstellungen abgeschaltet.
            </span>
          </p>

          {fehler && <p className="text-xs mb-3" style={{ color: COLORS.orangeDeep }}>{fehler}</p>}
          <button
            onClick={umfrageErstellen}
            disabled={speichernLadend}
            className="px-4 py-2 rounded-md text-white text-sm font-semibold"
            style={{ background: COLORS.orange, opacity: speichernLadend ? 0.6 : 1 }}
          >
            {speichernLadend ? "Erstelle…" : "Umfrage erstellen"}
          </button>
        </div>
      )}

      {umfragen.length === 0 ? (
        <Leerzustand text="Keine aktiven Umfragen." />
      ) : (
        umfragen.map((u) => {
          const ziele = zieleNachUmfrage[u.id] ?? [];
          const zielAnzahl = ziele.length > 0 ? ziele.length : spielerListe.length;
          return (
            <UmfrageKarte
              key={u.id}
              umfrage={u}
              antworten={antwortenNachUmfrage[u.id] ?? []}
              zielAnzahl={zielAnzahl}
              profil={profil}
              spielerListe={spielerListe}
              hervorgehoben={u.id === zielUmfrageId}
              onAbstimmen={(gewaehlt) => abstimmen(u.id, u.mehrfachauswahl, gewaehlt)}
              onBeenden={() => beenden(u.id)}
              onLoeschen={() => loeschen(u.id)}
              onTerminAnsetzen={terminAnsetzen}
            />
          );
        })
      )}
    </div>
  );
}

// Aus einer Antwortoption wie "Fr, 09.10.2026" das Datum herauslesen
function terminAusOption(option) {
  const treffer = String(option ?? "").match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (!treffer) return null;
  const [, tag, monat, jahr] = treffer;
  return `${jahr}-${monat}-${tag}`;
}

function UmfrageKarte({ umfrage, antworten, zielAnzahl, profil, spielerListe, hervorgehoben, onAbstimmen, onBeenden, onLoeschen, onTerminAnsetzen }) {
  const eigeneAntwort = antworten.find((a) => a.spieler_id === profil.id);
  const [auswahl, setAuswahl] = useState(eigeneAntwort?.ausgewaehlte_optionen ?? []);
  const [loeschenBestaetigen, setLoeschenBestaetigen] = useState(false);

  const zeitAbgelaufen = Boolean(umfrage.endet_am) && new Date(umfrage.endet_am) <= new Date();
  const alleAbgestimmt = zielAnzahl > 0 && antworten.length >= zielAnzahl;
  const istBeendet = zeitAbgelaufen || alleAbgestimmt;

  const zeigeErgebnis = istBeendet || Boolean(eigeneAntwort);

  function toggle(index) {
    if (umfrage.mehrfachauswahl) {
      setAuswahl((prev) => (prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]));
    } else {
      setAuswahl([index]);
    }
  }

  const gesamtStimmen = antworten.length;

  return (
    <div id={`umfrage-${umfrage.id}`} className="bg-white rounded-lg border p-5" style={hervorgehoben ? { boxShadow: `0 0 0 2px ${COLORS.orange}` } : {}}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Vote size={16} style={{ color: COLORS.orange }} />
          <h3 className="font-semibold text-sm" style={{ color: COLORS.anthracite }}>{umfrage.titel}</h3>
          {umfrage.art === "verlegung" && (
            <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full text-white flex items-center gap-1" style={{ background: COLORS.konflikt }}>
              <CalendarClock size={10} /> Verlegung
            </span>
          )}
          {umfrage.art === "aushilfe" && (
            <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ background: "#FBE2DA", color: COLORS.orangeDeep }}>
              Aushilfe
            </span>
          )}
          {istBeendet && (
            <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full text-white" style={{ background: COLORS.anthracite }}>
              Beendet
            </span>
          )}
        </div>
        {profil.ist_admin && (
          <div className="flex items-center gap-3 shrink-0">
            {loeschenBestaetigen ? (
              <>
                <span className="text-xs text-gray-500">Wirklich löschen?</span>
                <button onClick={onLoeschen} className="text-xs px-2 py-1 rounded-md text-white" style={{ background: COLORS.orangeDeep }}>
                  Ja
                </button>
                <button onClick={() => setLoeschenBestaetigen(false)} className="text-xs px-2 py-1 rounded-md border">
                  Nein
                </button>
              </>
            ) : (
              <>
                {!istBeendet && (
                  <button onClick={onBeenden} className="text-xs underline" style={{ color: COLORS.petrol }}>
                    Jetzt beenden
                  </button>
                )}
                <button onClick={() => setLoeschenBestaetigen(true)} className="text-xs underline" style={{ color: COLORS.orangeDeep }}>
                  Löschen
                </button>
              </>
            )}
          </div>
        )}
      </div>
      {umfrage.beschreibung && <p className="text-sm text-gray-500 mb-3">{umfrage.beschreibung}</p>}
      {!istBeendet && umfrage.endet_am && (
        <p className="text-xs text-gray-400 mb-2">Endet am {formatDatum(umfrage.endet_am)}</p>
      )}
      {!istBeendet && zielAnzahl > 0 && (
        <p className="text-xs mb-2" style={{ color: COLORS.orange }}>
          {antworten.length} von {zielAnzahl} haben abgestimmt — noch {zielAnzahl - antworten.length} ausstehend
        </p>
      )}

      {umfrage.anonym ? (
        <p className="text-xs mb-2 flex items-center gap-1" style={{ color: "#999" }}>
          <HelpCircle size={12} /> Anonyme Umfrage — niemand sieht, wer wie abgestimmt hat.
        </p>
      ) : (
        <p className="text-xs mb-2 flex items-center gap-1" style={{ color: "#999" }}>
          <HelpCircle size={12} /> Nicht anonym — dein Name wird bei deiner Antwort angezeigt.
        </p>
      )}

      {zeigeErgebnis ? (
        <div className="space-y-2">
          {umfrage.optionen.map((option, i) => {
            const stimmenderIds = antworten.filter((a) => a.ausgewaehlte_optionen.includes(i)).map((a) => a.spieler_id);
            const stimmenFuerOption = stimmenderIds.length;
            const prozent = gesamtStimmen === 0 ? 0 : Math.round((stimmenFuerOption / gesamtStimmen) * 100);
            const istEigene = eigeneAntwort?.ausgewaehlte_optionen.includes(i);
            const namen = !umfrage.anonym
              ? stimmenderIds
                  .map((id) => spielerListe.find((s) => s.id === id))
                  .filter(Boolean)
                  .map((s) => `${s.vorname} ${s.nachname}`)
              : [];
            return (
              <div key={i}>
                <div className="flex justify-between text-xs mb-1">
                  <span style={istEigene ? { color: COLORS.orangeDeep, fontWeight: 600 } : { color: COLORS.anthracite }}>
                    {option} {istEigene && "✓"}
                  </span>
                  <span className="text-gray-400">{stimmenFuerOption} · {prozent}%</span>
                </div>
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${prozent}%`, background: COLORS.petrol }} />
                </div>
                {namen.length > 0 && <p className="text-[11px] text-gray-400 mt-1">{namen.join(", ")}</p>}
                {umfrage.art === "verlegung" && darfMannschaftVerwalten(profil, umfrage.mannschaft_id) && terminAusOption(option) && (
                  <button
                    onClick={() => onTerminAnsetzen?.(umfrage, terminAusOption(option))}
                    className="text-[11px] font-semibold mt-1 underline"
                    style={{ color: COLORS.konflikt }}
                  >
                    Diesen Termin ansetzen
                  </button>
                )}
              </div>
            );
          })}
          <p className="text-xs text-gray-400 pt-1">{gesamtStimmen} Stimme(n) insgesamt</p>
        </div>
      ) : (
        <div className="space-y-2">
          {umfrage.optionen.map((option, i) => (
            <label key={i} className="flex items-center gap-2 text-sm p-2 rounded-md border cursor-pointer" style={auswahl.includes(i) ? { borderColor: COLORS.orange, background: "#FCEEE7" } : {}}>
              <input type={umfrage.mehrfachauswahl ? "checkbox" : "radio"} checked={auswahl.includes(i)} onChange={() => toggle(i)} />
              {option}
            </label>
          ))}
          <button
            onClick={() => onAbstimmen(auswahl)}
            disabled={auswahl.length === 0}
            className="px-4 py-2 rounded-md text-white text-sm font-semibold mt-2"
            style={{ background: COLORS.orange, opacity: auswahl.length === 0 ? 0.5 : 1 }}
          >
            Abstimmen
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------- Nachrichten ---------- */

function Nachrichten({ profil, zielSpielerId }) {
  const [spielerListe, setSpielerListe] = useState([]);
  const [mannschaften, setMannschaften] = useState([]);
  const [nachrichten, setNachrichten] = useState([]);
  const [ladend, setLadend] = useState(true);
  const [partnerId, setPartnerId] = useState(zielSpielerId ?? null);
  const [entwurf, setEntwurf] = useState("");
  const [sendenLadend, setSendenLadend] = useState(false);
  const [mannschaftsFilter, setMannschaftsFilter] = useState("alle"); // "alle" | "unzugeordnet" | mannschaftId

  async function laden() {
    setLadend(true);
    const [{ data: spielerDaten }, { data: nachrichtenDaten }, { data: mannschaftenDaten }] = await Promise.all([
      supabase.from("profiles").select("id, vorname, nachname, mannschaft_id, avatar_url").neq("id", profil.id).order("nachname"),
      supabase.from("nachrichten").select("*").or(`von_id.eq.${profil.id},an_id.eq.${profil.id}`).order("gesendet_am"),
      supabase.from("mannschaften").select("id, name, hierarchie_stufe"),
    ]);
    setSpielerListe(spielerDaten ?? []);
    setNachrichten(nachrichtenDaten ?? []);
    setMannschaften(sortiereMannschaften(mannschaftenDaten));
    setLadend(false);
  }

  useEffect(() => { laden(); }, []);

  useEffect(() => {
    if (zielSpielerId) setPartnerId(zielSpielerId);
  }, [zielSpielerId]);

  // Ungelesene Nachrichten im offenen Gespräch als gelesen markieren
  useEffect(() => {
    if (!partnerId) return;
    const ungelesen = nachrichten.filter((n) => n.von_id === partnerId && n.an_id === profil.id && !n.gelesen);
    if (ungelesen.length === 0) return;
    (async () => {
      await supabase.from("nachrichten").update({ gelesen: true }).in("id", ungelesen.map((n) => n.id));
      setNachrichten((prev) => prev.map((n) => (ungelesen.some((u) => u.id === n.id) ? { ...n, gelesen: true } : n)));
    })();
  }, [partnerId, nachrichten, profil.id]);

  async function senden() {
    if (!entwurf.trim() || !partnerId) return;
    setSendenLadend(true);
    const inhaltZuSenden = entwurf.trim();
    const { error } = await supabase.from("nachrichten").insert({
      von_id: profil.id,
      an_id: partnerId,
      inhalt: inhaltZuSenden,
    });
    setSendenLadend(false);
    if (!error) {
      setEntwurf("");
      laden();
      supabase.functions.invoke("notify-neue-nachricht", {
        body: { empfaengerId: partnerId, absenderName: `${profil.vorname} ${profil.nachname}`, inhalt: inhaltZuSenden },
      }); // bewusst nicht awaited
    }
  }

  function konversationMit(spielerId) {
    return nachrichten.filter((n) => n.von_id === spielerId || n.an_id === spielerId);
  }

  function ungeleseneVon(spielerId) {
    return nachrichten.filter((n) => n.von_id === spielerId && n.an_id === profil.id && !n.gelesen).length;
  }

  if (ladend) return <Leerzustand text="Lade Nachrichten…" />;

  const partner = spielerListe.find((s) => s.id === partnerId);
  const sortiertNachAktivitaet = [...spielerListe].sort((a, b) => {
    const letzteA = konversationMit(a.id).at(-1)?.gesendet_am ?? "";
    const letzteB = konversationMit(b.id).at(-1)?.gesendet_am ?? "";
    return letzteB.localeCompare(letzteA);
  });

  // Gesprächsansicht
  if (partner) {
    const verlauf = konversationMit(partner.id);
    return (
      <div className="bg-white rounded-lg border flex flex-col" style={{ height: "70vh" }}>
        <div className="flex items-center gap-3 p-4 border-b">
          <button onClick={() => setPartnerId(null)} className="text-gray-400 hover:text-gray-600">
            <ArrowLeft size={18} />
          </button>
          <Avatar person={partner} groesse={32} />
          <p className="font-semibold text-sm" style={{ color: COLORS.anthracite }}>{partner.vorname} {partner.nachname}</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {verlauf.length === 0 ? (
            <p className="text-sm text-gray-400 text-center mt-8">Noch keine Nachrichten — schreib die erste!</p>
          ) : (
            verlauf.map((n) => {
              const eigene = n.von_id === profil.id;
              return (
                <div key={n.id} className={`flex ${eigene ? "justify-end" : "justify-start"}`}>
                  <div
                    className="max-w-[75%] rounded-lg px-3 py-2 text-sm"
                    style={eigene ? { background: COLORS.orange, color: "white" } : { background: "#F1F1EF", color: COLORS.anthracite }}
                  >
                    <p>{n.inhalt}</p>
                    <p className="text-[10px] mt-1 opacity-70">{new Date(n.gesendet_am).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>
        <p className="text-[11px] text-gray-400 px-3 pt-3 flex items-start gap-1.5">
          <Mail size={12} className="mt-0.5 shrink-0" />
          <span>{partner.vorname} bekommt eine E-Mail, dass eine neue Nachricht wartet — höchstens einmal pro Stunde.</span>
        </p>
        <div className="flex items-center gap-2 p-3 border-t">
          <input
            value={entwurf}
            onChange={(e) => setEntwurf(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && senden()}
            placeholder="Nachricht schreiben…"
            className="flex-1 border rounded-md px-3 py-2 text-sm"
          />
          <button
            onClick={senden}
            disabled={sendenLadend || !entwurf.trim()}
            className="w-10 h-10 rounded-md flex items-center justify-center text-white shrink-0"
            style={{ background: COLORS.orange, opacity: sendenLadend || !entwurf.trim() ? 0.5 : 1 }}
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    );
  }

  // Übersicht aller Spieler / Unterhaltungen — nach Mannschaften gruppiert
  function spielerZeile(s) {
    const letzte = konversationMit(s.id).at(-1);
    const ungelesen = ungeleseneVon(s.id);
    return (
      <button
        key={s.id}
        onClick={() => setPartnerId(s.id)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-gray-50"
      >
        <Avatar person={s} groesse={40} />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm" style={{ color: COLORS.anthracite }}>{s.vorname} {s.nachname}</p>
          <p className="text-xs text-gray-400 truncate">{letzte ? letzte.inhalt : "Noch keine Nachrichten"}</p>
        </div>
        {ungelesen > 0 && (
          <span className="text-white text-[10px] px-1.5 py-0.5 rounded-full shrink-0" style={{ background: COLORS.orange }}>
            {ungelesen}
          </span>
        )}
      </button>
    );
  }

  const gefilterteSpieler =
    mannschaftsFilter === "alle" ? sortiertNachAktivitaet
    : mannschaftsFilter === "unzugeordnet" ? sortiertNachAktivitaet.filter((s) => !s.mannschaft_id)
    : sortiertNachAktivitaet.filter((s) => s.mannschaft_id === mannschaftsFilter);

  // Bei "Alle" zusätzlich mit Zwischenüberschriften je Mannschaft gruppieren
  const gruppen =
    mannschaftsFilter === "alle"
      ? [
          ...mannschaften.map((m) => ({
            id: m.id,
            name: m.name,
            spieler: sortiertNachAktivitaet.filter((s) => s.mannschaft_id === m.id),
          })),
          { id: "unzugeordnet", name: "Nicht zugewiesen", spieler: sortiertNachAktivitaet.filter((s) => !s.mannschaft_id) },
        ].filter((g) => g.spieler.length > 0)
      : null;

  const filterKnopf = (wert, beschriftung) => (
    <button
      key={wert}
      onClick={() => setMannschaftsFilter(wert)}
      className="px-3 py-1.5 rounded-full text-xs font-semibold"
      style={mannschaftsFilter === wert ? { background: COLORS.orange, color: "white" } : { background: "#fff", border: "1px solid #ddd" }}
    >
      {beschriftung}
    </button>
  );

  return (
    <div className="max-w-xl space-y-3">
      {mannschaften.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {filterKnopf("alle", "Alle")}
          {mannschaften.map((m) => filterKnopf(m.id, m.name))}
          {spielerListe.some((s) => !s.mannschaft_id) && filterKnopf("unzugeordnet", "Nicht zugewiesen")}
        </div>
      )}

      {spielerListe.length === 0 ? (
        <Leerzustand text="Keine anderen Spieler vorhanden." />
      ) : gruppen ? (
        gruppen.map((g) => (
          <div key={g.id}>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1 px-1">{g.name}</p>
            <div className="bg-white rounded-lg border divide-y">{g.spieler.map(spielerZeile)}</div>
          </div>
        ))
      ) : gefilterteSpieler.length === 0 ? (
        <Leerzustand text="Keine Spieler in dieser Mannschaft." />
      ) : (
        <div className="bg-white rounded-lg border divide-y">{gefilterteSpieler.map(spielerZeile)}</div>
      )}
    </div>
  );
}

/* ---------- Einstellungen (Saison-Verwaltung) ---------- */

function Einstellungen({ profil, onProfilGeaendert }) {
  const [telefonHandy, setTelefonHandy] = useState(profil.telefon_handy ?? "");
  const [telefonFestnetz, setTelefonFestnetz] = useState(profil.telefon_festnetz ?? "");
  const [kontaktSichtbar, setKontaktSichtbar] = useState(profil.kontakt_sichtbar ?? false);
  const [gespeichert, setGespeichert] = useState(false);
  const [speichernLadend, setSpeichernLadend] = useState(false);

  async function kontaktdatenSpeichern() {
    setSpeichernLadend(true);
    const { error } = await supabase
      .from("profiles")
      .update({ telefon_handy: telefonHandy || null, telefon_festnetz: telefonFestnetz || null, kontakt_sichtbar: kontaktSichtbar })
      .eq("id", profil.id);
    setSpeichernLadend(false);
    if (!error) {
      setGespeichert(true);
      onProfilGeaendert?.({ ...profil, telefon_handy: telefonHandy, telefon_festnetz: telefonFestnetz, kontakt_sichtbar: kontaktSichtbar });
      setTimeout(() => setGespeichert(false), 2000);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="bg-white rounded-lg border p-5">
        <SectionLabel icon={Users}>Meine Kontaktdaten</SectionLabel>
        <label className="block text-xs text-gray-500 mb-1">Handynummer</label>
        <input value={telefonHandy} onChange={(e) => setTelefonHandy(e.target.value)} placeholder="z. B. 0152 12345678" className="w-full border rounded-md px-3 py-2 text-sm mb-3" />
        <label className="block text-xs text-gray-500 mb-1">Festnetznummer</label>
        <input value={telefonFestnetz} onChange={(e) => setTelefonFestnetz(e.target.value)} placeholder="z. B. 03578 123456" className="w-full border rounded-md px-3 py-2 text-sm mb-3" />
        <label className="flex items-center gap-2 text-sm mb-4">
          <input type="checkbox" checked={kontaktSichtbar} onChange={(e) => setKontaktSichtbar(e.target.checked)} />
          Telefonnummer und E-Mail für andere Spieler im Kader sichtbar machen
        </label>
        {gespeichert && <p className="text-xs mb-2" style={{ color: COLORS.petrol }}>Gespeichert ✓</p>}
        <button onClick={kontaktdatenSpeichern} disabled={speichernLadend} className="px-4 py-2 rounded-md text-white text-sm font-semibold" style={{ background: COLORS.orange, opacity: speichernLadend ? 0.6 : 1 }}>
          {speichernLadend ? "Speichere…" : "Speichern"}
        </button>
      </div>

      <ProfilbildEinstellungen profil={profil} onProfilGeaendert={onProfilGeaendert} />

      <KalenderAbo profil={profil} onProfilGeaendert={onProfilGeaendert} />

      <EmailEinstellungen profil={profil} onProfilGeaendert={onProfilGeaendert} />

      <SchichtplanEinstellungen profil={profil} onProfilGeaendert={onProfilGeaendert} />

      <div className="bg-white rounded-lg border p-5">
        <SectionLabel icon={GraduationCap}>Einführung</SectionLabel>
        <p className="text-xs text-gray-500 mb-3">
          Die Einführung wird laufend erweitert, wenn neue Funktionen dazukommen. Du kannst sie dir jederzeit noch einmal ansehen.
        </p>
        <button
          onClick={() => onProfilGeaendert?.({ ...profil, onboarding_gesehen: false })}
          className="px-4 py-2 rounded-md text-sm font-semibold border"
          style={{ borderColor: COLORS.petrol, color: COLORS.petrol }}
        >
          Einführung noch einmal ansehen
        </button>
      </div>

      <PasswortAendern profil={profil} />

      <KontoKuendigung profil={profil} />

      {profil.ist_admin && <AenderungshinweisVerwaltung />}
    </div>
  );
}

/* ---------- Profilbild hochladen ---------- */

function ProfilbildEinstellungen({ profil, onProfilGeaendert }) {
  const [ladend, setLadend] = useState(false);
  const [fehler, setFehler] = useState(null);
  const dateiFeld = useRef(null);

  // Vor dem Hochladen verkleinern: aus einem 4-MB-Handyfoto wird so ein
  // quadratischer Ausschnitt von rund 40 KB.
  function verkleinern(datei) {
    return new Promise((fertig, fehlgeschlagen) => {
      const leser = new FileReader();
      leser.onerror = () => fehlgeschlagen(new Error("Datei konnte nicht gelesen werden."));
      leser.onload = () => {
        const bild = new Image();
        bild.onerror = () => fehlgeschlagen(new Error("Das ist kein gültiges Bild."));
        bild.onload = () => {
          const kante = Math.min(bild.width, bild.height);
          const ziel = 400;
          const flaeche = document.createElement("canvas");
          flaeche.width = ziel;
          flaeche.height = ziel;
          const stift = flaeche.getContext("2d");
          // Mittigen quadratischen Ausschnitt nehmen
          stift.drawImage(bild, (bild.width - kante) / 2, (bild.height - kante) / 2, kante, kante, 0, 0, ziel, ziel);
          flaeche.toBlob((b) => (b ? fertig(b) : fehlgeschlagen(new Error("Umwandlung fehlgeschlagen."))), "image/jpeg", 0.85);
        };
        bild.src = leser.result;
      };
      leser.readAsDataURL(datei);
    });
  }

  async function hochladen(e) {
    const datei = e.target.files?.[0];
    if (!datei) return;
    setFehler(null);
    setLadend(true);
    try {
      const verkleinert = await verkleinern(datei);
      const pfad = `${profil.id}/profilbild.jpg`;
      const { error: ladeFehler } = await supabase.storage
        .from("profilbilder")
        .upload(pfad, verkleinert, { upsert: true, contentType: "image/jpeg" });
      if (ladeFehler) throw ladeFehler;

      const { data: { publicUrl } } = supabase.storage.from("profilbilder").getPublicUrl(pfad);
      // Zeitstempel anhängen, damit der Browser das neue Bild nicht aus dem Zwischenspeicher holt
      const adresse = `${publicUrl}?v=${Date.now()}`;
      const { error: profilFehler } = await supabase.from("profiles").update({ avatar_url: adresse }).eq("id", profil.id);
      if (profilFehler) throw profilFehler;
      onProfilGeaendert?.({ ...profil, avatar_url: adresse });
    } catch (f) {
      setFehler(f.message ?? String(f));
    }
    setLadend(false);
    if (dateiFeld.current) dateiFeld.current.value = "";
  }

  async function entfernen() {
    setFehler(null);
    setLadend(true);
    await supabase.storage.from("profilbilder").remove([`${profil.id}/profilbild.jpg`]);
    const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", profil.id);
    setLadend(false);
    if (error) return setFehler(error.message);
    onProfilGeaendert?.({ ...profil, avatar_url: null });
  }

  return (
    <div className="bg-white rounded-lg border p-5">
      <SectionLabel icon={Users}>Mein Profilbild</SectionLabel>
      <p className="text-xs text-gray-500 mb-4">
        Dein Bild erscheint im Kader, im Nachrichten-Postfach und oben rechts in der App. Ohne Bild werden weiterhin deine Initialen angezeigt.
      </p>
      <div className="flex items-center gap-4">
        <Avatar person={profil} groesse={72} />
        <div className="flex flex-col gap-2">
          <input ref={dateiFeld} type="file" accept="image/*" onChange={hochladen} className="hidden" />
          <button
            onClick={() => dateiFeld.current?.click()}
            disabled={ladend}
            className="px-4 py-2 rounded-md text-white text-sm font-semibold"
            style={{ background: COLORS.orange, opacity: ladend ? 0.6 : 1 }}
          >
            {ladend ? "Lade hoch…" : profil.avatar_url ? "Bild ändern" : "Bild auswählen"}
          </button>
          {profil.avatar_url && (
            <button onClick={entfernen} disabled={ladend} className="text-xs text-gray-500 underline text-left">
              Bild entfernen
            </button>
          )}
        </div>
      </div>
      {fehler && <p className="text-xs mt-3" style={{ color: COLORS.orangeDeep }}>{fehler}</p>}
    </div>
  );
}

/* ---------- Kalender-Abo ----------
   Statt eines einmaligen Exports kann jeder Spieler seinen Kalender dauerhaft
   mit der App verbinden. Verlegungen und neue Termine landen dann von selbst
   im Handy-Kalender. Der Zugang läuft über einen persönlichen, zufälligen
   Schlüssel in der Adresse — jederzeit widerrufbar. */

const KALENDER_FEED_BASIS = `${SUPABASE_URL}/functions/v1/kalender-feed`;

function KalenderAbo({ profil, onProfilGeaendert }) {
  const [ladend, setLadend] = useState(false);
  const [kopiert, setKopiert] = useState(false);
  const [fehler, setFehler] = useState(null);

  const token = profil.kalender_token;
  const adresse = token ? `${KALENDER_FEED_BASIS}?token=${token}` : null;
  const webcalAdresse = adresse ? adresse.replace(/^https:/, "webcal:") : null;

  async function tokenSetzen(neuerWert) {
    setFehler(null);
    setLadend(true);
    const { error } = await supabase.from("profiles").update({ kalender_token: neuerWert }).eq("id", profil.id);
    setLadend(false);
    if (error) return setFehler(error.message);
    onProfilGeaendert?.({ ...profil, kalender_token: neuerWert });
  }

  async function kopieren() {
    try {
      await navigator.clipboard.writeText(adresse);
      setKopiert(true);
      setTimeout(() => setKopiert(false), 2000);
    } catch {
      setFehler("Kopieren hat nicht geklappt — bitte die Adresse von Hand markieren.");
    }
  }

  return (
    <div className="bg-white rounded-lg border p-5">
      <SectionLabel icon={CalendarPlus}>Kalender-Abo</SectionLabel>
      <p className="text-xs text-gray-500 mb-3">
        Verbinde deinen Handy-Kalender dauerhaft mit der App: Spiele deiner Mannschaft und Vereinstermine
        erscheinen dann automatisch — auch wenn ein Spiel später verlegt wird. Anders als beim einmaligen
        Herunterladen musst du nichts nachpflegen.
      </p>

      {adresse ? (
        <>
          <div className="p-2 rounded-md border text-[11px] font-mono break-all mb-3" style={{ background: COLORS.paper }}>
            {adresse}
          </div>
          <div className="flex flex-wrap gap-2 mb-3">
            <a
              href={webcalAdresse}
              className="px-4 py-2 rounded-md text-white text-sm font-semibold"
              style={{ background: COLORS.orange }}
            >
              Jetzt abonnieren
            </a>
            <button onClick={kopieren} className="px-4 py-2 rounded-md text-sm border">
              {kopiert ? "Kopiert ✓" : "Adresse kopieren"}
            </button>
            <button
              onClick={() => tokenSetzen(crypto.randomUUID())}
              disabled={ladend}
              className="px-4 py-2 rounded-md text-sm border"
              title="Erzeugt eine neue Adresse — bestehende Abos hören auf zu funktionieren"
            >
              Adresse erneuern
            </button>
            <button
              onClick={() => tokenSetzen(null)}
              disabled={ladend}
              className="px-4 py-2 rounded-md text-sm border"
              style={{ color: COLORS.orangeDeep }}
            >
              Abo abschalten
            </button>
          </div>
          <details className="text-xs text-gray-500">
            <summary className="cursor-pointer font-medium">So richtest du es ein</summary>
            <ul className="mt-2 space-y-1 list-disc pl-4">
              <li><strong>iPhone:</strong> Auf „Jetzt abonnieren" tippen und bestätigen. Falls nichts passiert: Einstellungen → Apps → Kalender → Accounts → Account hinzufügen → Andere → Kalenderabo, dann die Adresse einfügen.</li>
              <li><strong>Android / Google:</strong> Auf calendar.google.com → Weitere Kalender → Per URL → Adresse einfügen. Über die Handy-App geht es leider nicht.</li>
              <li><strong>Outlook:</strong> Kalender → Kalender hinzufügen → Aus dem Internet abonnieren.</li>
            </ul>
            <p className="mt-2">
              <strong>Woran du erkennst, dass es geklappt hat:</strong> Der Kalender „TTV 97 Kamenz" steht in
              deiner Kalenderliste unter <em>Abonniert</em>, und die Spiele lassen sich nicht bearbeiten oder
              löschen. Landen die Termine dagegen in deinem privaten Kalender und sind änderbar, war es der
              einmalige Export statt des Abos.
            </p>
            <p className="mt-2">
              Kalender fragen die Adresse meist alle paar Stunden ab — Änderungen erscheinen also nicht sofort.
              Behandle die Adresse wie ein Passwort: Wer sie hat, sieht deine Termine. Über „Adresse erneuern" wird sie ungültig.
            </p>
          </details>
        </>
      ) : (
        <button
          onClick={() => tokenSetzen(crypto.randomUUID())}
          disabled={ladend}
          className="px-4 py-2 rounded-md text-white text-sm font-semibold"
          style={{ background: COLORS.orange, opacity: ladend ? 0.6 : 1 }}
        >
          {ladend ? "Erstelle…" : "Kalender-Abo einrichten"}
        </button>
      )}
      {fehler && <p className="text-xs mt-2" style={{ color: COLORS.orangeDeep }}>{fehler}</p>}
    </div>
  );
}

/* ---------- E-Mail-Benachrichtigungen ---------- */

const EMAIL_ARTEN = [
  { feld: "email_umfragen", titel: "Neue Umfragen", text: "Wenn eine Umfrage startet, die dich betrifft — auch Aushilfe-Anfragen und Terminvorschläge zur Spielverlegung." },
  { feld: "email_nachrichten", titel: "Neue Nachrichten", text: "Wenn dir jemand im Postfach schreibt. Höchstens eine Mail pro Stunde und Absender." },
  { feld: "email_termine", titel: "Neue Termine", text: "Wenn ein Training, Spiel oder anderer Termin für deine Mannschaft angelegt wird." },
  { feld: "email_spielplan", titel: "Erinnerungen zur Spielerplanung", text: "Erinnerung, wenn vor einem Spiel deine Rückmeldung noch fehlt. Mannschaftsführer bekommen zusätzlich eine Warnung, wenn zu wenige Spieler zugesagt haben." },
];

function EmailEinstellungen({ profil, onProfilGeaendert }) {
  const [werte, setWerte] = useState(() =>
    Object.fromEntries(EMAIL_ARTEN.map((a) => [a.feld, profil[a.feld] ?? true]))
  );
  const [gespeichert, setGespeichert] = useState(false);
  const [ladend, setLadend] = useState(false);
  const [fehler, setFehler] = useState(null);

  // Erinnerungen zur Spielerplanung betreffen alle Spieler, nicht nur die Mannschaftsführung
  const relevanteArten = EMAIL_ARTEN;

  async function speichern() {
    setFehler(null);
    setLadend(true);
    const { error } = await supabase.from("profiles").update(werte).eq("id", profil.id);
    setLadend(false);
    if (error) return setFehler(error.message);
    onProfilGeaendert?.({ ...profil, ...werte });
    setGespeichert(true);
    setTimeout(() => setGespeichert(false), 2000);
  }

  return (
    <div className="bg-white rounded-lg border p-5">
      <SectionLabel icon={Bell}>E-Mail-Benachrichtigungen</SectionLabel>
      <p className="text-xs text-gray-500 mb-3">
        Die Mails gehen an <span className="font-medium">{profil.email}</span>. Du entscheidest selbst, worüber du informiert wirst.
      </p>
      <div className="space-y-3 mb-4">
        {relevanteArten.map((a) => (
          <label key={a.feld} className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={werte[a.feld]}
              onChange={(e) => setWerte({ ...werte, [a.feld]: e.target.checked })}
              className="mt-1"
            />
            <span>
              <span className="font-medium">{a.titel}</span>
              <span className="block text-xs text-gray-500">{a.text}</span>
            </span>
          </label>
        ))}
      </div>
      {fehler && <p className="text-xs mb-2" style={{ color: COLORS.orangeDeep }}>{fehler}</p>}
      {gespeichert && <p className="text-xs mb-2" style={{ color: COLORS.petrol }}>Gespeichert ✓</p>}
      <button
        onClick={speichern}
        disabled={ladend}
        className="px-4 py-2 rounded-md text-white text-sm font-semibold"
        style={{ background: COLORS.orange, opacity: ladend ? 0.6 : 1 }}
      >
        {ladend ? "Speichere…" : "Speichern"}
      </button>
    </div>
  );
}

/* ---------- Schichtplan im eigenen Profil ---------- */

function SchichtplanEinstellungen({ profil, onProfilGeaendert }) {
  const [aktiv, setAktiv] = useState(Array.isArray(profil.schicht_rotation) && profil.schicht_rotation.length > 0);
  const [rotation, setRotation] = useState(
    Array.isArray(profil.schicht_rotation) && profil.schicht_rotation.length > 0
      ? profil.schicht_rotation
      : ["Frühschicht", "Spätschicht", "Nachtschicht"]
  );
  const [referenzwoche, setReferenzwoche] = useState(profil.schicht_referenzwoche ?? "");
  const [sichtbar, setSichtbar] = useState(profil.schicht_sichtbar ?? false);
  const [hinweis, setHinweis] = useState(profil.schicht_hinweis ?? "");
  const [gespeichert, setGespeichert] = useState(false);
  const [ladend, setLadend] = useState(false);
  const [fehler, setFehler] = useState(null);

  // Vorschau: welche Schicht habe ich in den nächsten Wochen?
  const vorschau = (() => {
    if (!aktiv || !referenzwoche || rotation.length === 0) return [];
    const start = wochenStart(new Date());
    if (!start) return [];
    return Array.from({ length: Math.min(rotation.length, 6) }, (_, i) => {
      const tag = new Date(start);
      tag.setDate(tag.getDate() + i * 7);
      return { tag, schicht: schichtFuerDatum({ schicht_rotation: rotation, schicht_referenzwoche: referenzwoche }, tag) };
    });
  })();

  async function speichern() {
    setFehler(null);
    if (aktiv && !referenzwoche) return setFehler("Bitte die Startwoche angeben, damit die Rotation berechnet werden kann.");
    setLadend(true);
    const werte = aktiv
      ? { schicht_rotation: rotation, schicht_referenzwoche: referenzwoche, schicht_sichtbar: sichtbar, schicht_hinweis: hinweis.trim() || null }
      : { schicht_rotation: null, schicht_referenzwoche: null, schicht_sichtbar: false, schicht_hinweis: null };
    const { error } = await supabase.from("profiles").update(werte).eq("id", profil.id);
    setLadend(false);
    if (error) return setFehler(error.message);
    onProfilGeaendert?.({ ...profil, ...werte });
    setGespeichert(true);
    setTimeout(() => setGespeichert(false), 2000);
  }

  return (
    <div className="bg-white rounded-lg border p-5">
      <SectionLabel icon={Clock}>Mein Schichtplan</SectionLabel>
      <p className="text-xs text-gray-500 mb-3">
        Wenn du im Schichtsystem arbeitest, kannst du deine Rotation hier hinterlegen. In der Spielerplanung
        sieht deine Mannschaft dann direkt bei jedem Spieltag, welche Schicht du in der Woche hast.
      </p>

      <label className="flex items-center gap-2 text-sm mb-3">
        <input type="checkbox" checked={aktiv} onChange={(e) => setAktiv(e.target.checked)} />
        Ich arbeite im Schichtsystem
      </label>

      {aktiv && (
        <>
          <label className="block text-xs text-gray-500 mb-1">Rotation (eine Zeile = eine Woche, danach beginnt sie von vorn)</label>
          <div className="space-y-2 mb-3">
            {rotation.map((wert, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-16 shrink-0">Woche {i + 1}</span>
                <select
                  value={wert}
                  onChange={(e) => setRotation(rotation.map((r, idx) => (idx === i ? e.target.value : r)))}
                  className="flex-1 border rounded-md px-3 py-2 text-sm"
                >
                  {SCHICHT_OPTIONEN.map((o) => <option key={o}>{o}</option>)}
                </select>
                {rotation.length > 1 && (
                  <button
                    onClick={() => setRotation(rotation.filter((_, idx) => idx !== i))}
                    className="text-gray-400 hover:text-gray-600 shrink-0"
                    title="Woche entfernen"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            onClick={() => setRotation([...rotation, "Frühschicht"])}
            className="text-xs mb-4 flex items-center gap-1"
            style={{ color: COLORS.petrol }}
          >
            <Plus size={13} /> Woche hinzufügen
          </button>

          <label className="block text-xs text-gray-500 mb-1">
            Startwoche — in dieser Kalenderwoche gilt „Woche 1" ({rotation[0]})
          </label>
          <input
            type="date"
            style={{ minWidth: 0 }}
            value={referenzwoche}
            onChange={(e) => setReferenzwoche(e.target.value)}
            className="w-full border rounded-md px-3 py-2 text-sm mb-1"
          />
          <p className="text-[11px] text-gray-400 mb-3">
            Ein beliebiger Tag aus dieser Woche genügt — gerechnet wird immer ab Montag.
          </p>

          <label className="block text-xs text-gray-500 mb-1">Zusatzhinweis (optional)</label>
          <input
            value={hinweis}
            onChange={(e) => setHinweis(e.target.value)}
            placeholder="z. B. Nachtschicht endet Freitag früh, abends spielbereit"
            className="w-full border rounded-md px-3 py-2 text-sm mb-3"
          />

          {vorschau.length > 0 && (
            <div className="mb-3">
              <p className="text-xs text-gray-500 mb-1">Vorschau der nächsten Wochen:</p>
              <div className="flex flex-wrap gap-2">
                {vorschau.map(({ tag, schicht }, i) => {
                  const stil = SCHICHT_STIL[schicht] ?? SCHICHT_STIL["Frei"];
                  return (
                    <span key={i} className="px-2 py-1 rounded-md text-[11px] font-semibold" style={{ background: stil.background, color: stil.color }}>
                      ab {tag.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}: {schicht}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm mb-4">
            <input type="checkbox" checked={sichtbar} onChange={(e) => setSichtbar(e.target.checked)} />
            Meinen Schichtplan für meine Mannschaft sichtbar machen
          </label>
        </>
      )}

      {fehler && <p className="text-xs mb-2" style={{ color: COLORS.orangeDeep }}>{fehler}</p>}
      {gespeichert && <p className="text-xs mb-2" style={{ color: COLORS.petrol }}>Gespeichert ✓</p>}
      <button
        onClick={speichern}
        disabled={ladend}
        className="px-4 py-2 rounded-md text-white text-sm font-semibold"
        style={{ background: COLORS.orange, opacity: ladend ? 0.6 : 1 }}
      >
        {ladend ? "Speichere…" : "Schichtplan speichern"}
      </button>
    </div>
  );
}

function AenderungshinweisVerwaltung() {
  const [titel, setTitel] = useState("");
  const [beschreibung, setBeschreibung] = useState("");
  const [gespeichert, setGespeichert] = useState(false);
  const [ladend, setLadend] = useState(false);

  async function anlegen() {
    if (!titel.trim() || !beschreibung.trim()) return;
    setLadend(true);
    const { error } = await supabase.from("app_updates").insert({ titel: titel.trim(), beschreibung: beschreibung.trim() });
    setLadend(false);
    if (!error) {
      setTitel("");
      setBeschreibung("");
      setGespeichert(true);
      setTimeout(() => setGespeichert(false), 2000);
    }
  }

  return (
    <div className="bg-white rounded-lg border p-5">
      <SectionLabel icon={Sparkles}>Neuen Änderungshinweis anlegen</SectionLabel>
      <p className="text-xs text-gray-500 mb-3">Erscheint als Popup bei allen Spielern, die ihn noch nicht gesehen haben.</p>
      <input value={titel} onChange={(e) => setTitel(e.target.value)} placeholder="Titel" className="w-full border rounded-md px-3 py-2 text-sm mb-3" />
      <textarea value={beschreibung} onChange={(e) => setBeschreibung(e.target.value)} placeholder="Beschreibung" rows={3} className="w-full border rounded-md px-3 py-2 text-sm mb-3" />
      {gespeichert && <p className="text-xs mb-2" style={{ color: COLORS.petrol }}>Angelegt ✓</p>}
      <button onClick={anlegen} disabled={ladend} className="px-4 py-2 rounded-md text-white text-sm font-semibold" style={{ background: COLORS.orange, opacity: ladend ? 0.6 : 1 }}>
        {ladend ? "Speichere…" : "Änderungshinweis anlegen"}
      </button>
    </div>
  );
}

/* ---------- Popup: Neue Funktionen ---------- */

function AenderungsPopup({ profil }) {
  const [updates, setUpdates] = useState([]);
  const [sichtbar, setSichtbar] = useState(false);
  const letztePruefungRef = useRef(0);

  async function pruefeUpdates() {
    letztePruefungRef.current = Date.now();
    const [{ data: alle }, { data: gelesen }] = await Promise.all([
      supabase.from("app_updates").select("*").order("erstellt_am", { ascending: false }),
      supabase.from("app_updates_gelesen").select("update_id").eq("spieler_id", profil.id),
    ]);
    const gelesenIds = new Set((gelesen ?? []).map((g) => g.update_id));
    const ungelesen = (alle ?? []).filter((u) => !gelesenIds.has(u.id));
    if (ungelesen.length > 0) {
      setUpdates(ungelesen);
      setSichtbar(true);
    }
  }

  useEffect(() => {
    pruefeUpdates();

    // Erneut prüfen, wenn die Person zur App zurückkehrt (Tab/App wieder sichtbar) —
    // z. B. nach dem Wechsel zu einer anderen App oder Aufwecken des Bildschirms.
    // Mindestabstand von 2 Minuten, damit schnelles Hin- und Herwechseln nicht unnötig oft prüft.
    function beiSichtbarkeitswechsel() {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - letztePruefungRef.current < 2 * 60 * 1000) return;
      pruefeUpdates();
    }

    document.addEventListener("visibilitychange", beiSichtbarkeitswechsel);
    window.addEventListener("focus", beiSichtbarkeitswechsel);
    return () => {
      document.removeEventListener("visibilitychange", beiSichtbarkeitswechsel);
      window.removeEventListener("focus", beiSichtbarkeitswechsel);
    };
  }, [profil.id]);

  async function alsGelesenMarkieren() {
    await supabase.from("app_updates_gelesen").insert(updates.map((u) => ({ update_id: u.id, spieler_id: profil.id })));
    setSichtbar(false);
  }

  if (!sichtbar || updates.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div className="bg-white rounded-lg max-w-md w-full p-6 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles size={20} style={{ color: COLORS.orange }} />
          <h3 className="font-bold" style={{ color: COLORS.anthracite, fontFamily: "Oswald, sans-serif" }}>Neu in der App</h3>
        </div>
        <div className="space-y-4 mb-6">
          {updates.map((u) => (
            <div key={u.id}>
              <p className="font-semibold text-sm mb-1" style={{ color: COLORS.anthracite }}>{u.titel}</p>
              <p className="text-sm text-gray-600">{u.beschreibung}</p>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={alsGelesenMarkieren} className="flex-1 py-2 rounded-md text-white text-sm font-semibold" style={{ background: COLORS.orange }}>
            Gelesen
          </button>
          <button onClick={() => setSichtbar(false)} className="flex-1 py-2 rounded-md text-sm border">
            Später
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Turniere ---------- */

function Turniere({ profil }) {
  const [turniere, setTurniere] = useState([]);
  const [mannschaften, setMannschaften] = useState([]);
  const [ladend, setLadend] = useState(true);
  const [ausgewaehlteId, setAusgewaehlteId] = useState(null);
  const [formOffen, setFormOffen] = useState(false);

  const [form, setForm] = useState({
    titel: "", beschreibung: "", datum: "", typ: "einzel", system: "schweizer_system",
    saetzeProSpiel: 5, poolA: [], poolB: [], mitUmfrage: true, mitKalender: true, mitRueckspiel: false,
  });
  const [fehler, setFehler] = useState(null);
  const [speichernLadend, setSpeichernLadend] = useState(false);

  async function laden() {
    setLadend(true);
    const [{ data: t }, { data: m }] = await Promise.all([
      supabase.from("turniere").select("*").order("erstellt_am", { ascending: false }),
      supabase.from("mannschaften").select("*"),
    ]);
    setTurniere(t ?? []);
    setMannschaften(sortiereMannschaften(m));
    setLadend(false);
  }

  useEffect(() => { laden(); }, []);

  function toggleTeam(feld, mannschaftId) {
    setForm((f) => ({
      ...f,
      [feld]: f[feld].includes(mannschaftId) ? f[feld].filter((id) => id !== mannschaftId) : [...f[feld], mannschaftId],
    }));
  }

  async function turnierErstellen() {
    setFehler(null);
    if (!form.titel.trim()) return setFehler("Bitte einen Titel eingeben.");
    if (form.typ === "doppel" && (form.poolA.length === 0 || form.poolB.length === 0)) {
      return setFehler("Bitte für beide Pools mindestens eine Mannschaft auswählen.");
    }

    setSpeichernLadend(true);

    const { data: neuesTurnier, error } = await supabase
      .from("turniere")
      .insert({
        titel: form.titel.trim(),
        beschreibung: form.beschreibung.trim() || null,
        typ: form.typ,
        system: form.typ === "doppel" ? "rundenturnier" : form.system,
        datum: form.datum || null,
        saetze_pro_spiel: Number(form.saetzeProSpiel),
        doppel_pool_a: form.typ === "doppel" ? form.poolA : null,
        doppel_pool_b: form.typ === "doppel" ? form.poolB : null,
        mit_rueckspiel: form.typ === "doppel" || form.system === "rundenturnier" ? form.mitRueckspiel : false,
        erstellt_von: profil.id,
      })
      .select()
      .single();

    if (error) {
      setSpeichernLadend(false);
      return setFehler(error.message);
    }

    const updates = {};

    if (form.mitUmfrage) {
      const { data: neueUmfrage } = await supabase
        .from("umfragen")
        .insert({
          titel: `Anmeldung: ${form.titel.trim()}`,
          beschreibung: form.datum ? `Termin: ${formatDatum(form.datum)}` : null,
          optionen: ["Ja, ich spiele mit", "Nein"],
          mehrfachauswahl: false,
          erstellt_von: profil.id,
        })
        .select()
        .single();
      if (neueUmfrage) {
        updates.umfrage_id = neueUmfrage.id;
        supabase.functions.invoke("notify-neue-umfrage", { body: { titel: neueUmfrage.titel, empfaengerIds: null } });
      }
    }

    if (form.mitKalender && form.datum) {
      const start = new Date(`${form.datum}T09:00`);
      const ende = new Date(start.getTime() + 4 * 60 * 60000);
      const { data: neuerTermin } = await supabase
        .from("kalender_ereignisse")
        .insert({ titel: form.titel.trim(), datum: start.toISOString(), datum_ende: ende.toISOString(), typ: "turnier", erstellt_von: profil.id })
        .select()
        .single();
      if (neuerTermin) updates.kalender_ereignis_id = neuerTermin.id;
    }

    if (Object.keys(updates).length > 0) {
      await supabase.from("turniere").update(updates).eq("id", neuesTurnier.id);
    }

    setSpeichernLadend(false);
    setFormOffen(false);
    setForm({ titel: "", beschreibung: "", datum: "", typ: "einzel", system: "schweizer_system", saetzeProSpiel: 5, poolA: [], poolB: [], mitUmfrage: true, mitKalender: true, mitRueckspiel: false });
    laden();
  }

  if (ausgewaehlteId) {
    return <TurnierDetail turnierId={ausgewaehlteId} profil={profil} onZurueck={() => { setAusgewaehlteId(null); laden(); }} />;
  }

  const statusLabel = { anmeldung_offen: "Anmeldung offen", laufend: "Läuft", abgeschlossen: "Abgeschlossen" };
  const statusFarbe = {
    anmeldung_offen: { background: "#DDF0EA", color: COLORS.petrol },
    laufend: { background: "#FBE9DA", color: COLORS.orangeDeep },
    abgeschlossen: { background: "#F1F1EF", color: "#777" },
  };

  return (
    <div className="space-y-4 max-w-2xl">
      {darfTurniereVerwalten(profil) && (
        <div className="bg-white rounded-lg border p-5">
          <div className="flex items-center justify-between mb-2">
            <SectionLabel icon={Trophy}>Neues Turnier</SectionLabel>
            <button onClick={() => setFormOffen((v) => !v)} className="text-xs underline" style={{ color: COLORS.petrol }}>
              {formOffen ? "Einklappen" : "Anlegen"}
            </button>
          </div>

          {formOffen && (
            <div className="space-y-3 mt-3">
              <input placeholder="Titel, z. B. Vereinsmeisterschaft 2027" value={form.titel} onChange={(e) => setForm({ ...form, titel: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" />
              <textarea placeholder="Beschreibung (optional)" value={form.beschreibung} onChange={(e) => setForm({ ...form, beschreibung: e.target.value })} rows={2} className="w-full border rounded-md px-3 py-2 text-sm" />
              <div>
                <label className="block text-xs text-gray-400 mb-1">Datum (optional)</label>
                <input type="date" style={{ width: "100%", minWidth: 0, maxWidth: "100%", boxSizing: "border-box", WebkitAppearance: "none", appearance: "none" }} value={form.datum} onChange={(e) => setForm({ ...form, datum: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Turnierart</label>
                <div className="flex gap-2">
                  <button onClick={() => setForm({ ...form, typ: "einzel" })} className="flex-1 px-3 py-2 rounded-md text-sm font-semibold" style={form.typ === "einzel" ? { background: COLORS.orange, color: "white" } : { background: "#fff", border: "1px solid #ddd" }}>
                    Einzel (alle gegen alle)
                  </button>
                  <button onClick={() => setForm({ ...form, typ: "doppel" })} className="flex-1 px-3 py-2 rounded-md text-sm font-semibold" style={form.typ === "doppel" ? { background: COLORS.orange, color: "white" } : { background: "#fff", border: "1px solid #ddd" }}>
                    Doppel (Mannschafts-Mix)
                  </button>
                </div>
              </div>

              {form.typ === "einzel" && (
                <div>
                  <label className="block text-xs text-gray-400 mb-1">System</label>
                  <div className="flex gap-2">
                    <button onClick={() => setForm({ ...form, system: "schweizer_system" })} className="flex-1 px-3 py-2 rounded-md text-sm font-semibold" style={form.system === "schweizer_system" ? { background: COLORS.orange, color: "white" } : { background: "#fff", border: "1px solid #ddd" }}>
                      Schweizer System
                    </button>
                    <button onClick={() => setForm({ ...form, system: "rundenturnier" })} className="flex-1 px-3 py-2 rounded-md text-sm font-semibold" style={form.system === "rundenturnier" ? { background: COLORS.orange, color: "white" } : { background: "#fff", border: "1px solid #ddd" }}>
                      Jeder gegen Jeden
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Schweizer System empfohlen ab ca. 9 Teilnehmern.</p>
                </div>
              )}

              {form.typ === "doppel" && (
                <>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Pool A (ein Partner kommt von hier)</label>
                    <div className="flex flex-wrap gap-2">
                      {mannschaften.map((m) => (
                        <button key={m.id} onClick={() => toggleTeam("poolA", m.id)} className="px-3 py-1.5 rounded-full text-xs font-semibold" style={form.poolA.includes(m.id) ? { background: COLORS.petrol, color: "white" } : { background: "#fff", border: "1px solid #ddd" }}>
                          {m.name}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Pool B (der andere Partner kommt von hier)</label>
                    <div className="flex flex-wrap gap-2">
                      {mannschaften.map((m) => (
                        <button key={m.id} onClick={() => toggleTeam("poolB", m.id)} className="px-3 py-1.5 rounded-full text-xs font-semibold" style={form.poolB.includes(m.id) ? { background: COLORS.petrol, color: "white" } : { background: "#fff", border: "1px solid #ddd" }}>
                          {m.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs text-gray-400 mb-1">Sätze pro Spiel</label>
                <select value={form.saetzeProSpiel} onChange={(e) => setForm({ ...form, saetzeProSpiel: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm">
                  <option value={1}>1 Gewinnsatz (schnelles Spiel)</option>
                  <option value={3}>2 Gewinnsätze</option>
                  <option value={5}>3 Gewinnsätze (Standard)</option>
                </select>
              </div>

              {(form.typ === "doppel" || form.system === "rundenturnier") && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.mitRueckspiel} onChange={(e) => setForm({ ...form, mitRueckspiel: e.target.checked })} />
                  Hin- und Rückspiel (jede Paarung spielt zweimal, mit vertauschten Seiten)
                </label>
              )}

              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.mitUmfrage} onChange={(e) => setForm({ ...form, mitUmfrage: e.target.checked })} />
                Umfrage zur Anmeldung erstellen (an alle Spieler)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.mitKalender} onChange={(e) => setForm({ ...form, mitKalender: e.target.checked })} disabled={!form.datum} />
                Termin in den Kalender eintragen {!form.datum && <span className="text-xs text-gray-400">(braucht ein Datum)</span>}
              </label>

              {fehler && <p className="text-xs" style={{ color: COLORS.orangeDeep }}>{fehler}</p>}
              <p className="text-xs text-gray-500 mb-3 flex items-start gap-1.5">
                <Mail size={13} className="mt-0.5 shrink-0" />
                <span>Zum Turnier entsteht automatisch eine Anmelde-Umfrage — die eingeladenen Spieler bekommen sie auch per E-Mail.</span>
              </p>
              <button onClick={turnierErstellen} disabled={speichernLadend} className="px-4 py-2 rounded-md text-white text-sm font-semibold" style={{ background: COLORS.orange, opacity: speichernLadend ? 0.6 : 1 }}>
                {speichernLadend ? "Lege an…" : "Turnier anlegen"}
              </button>
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-lg border divide-y">
        {ladend ? (
          <div className="p-5"><Leerzustand text="Lade Turniere…" /></div>
        ) : turniere.length === 0 ? (
          <div className="p-5"><Leerzustand text="Noch keine Turniere angelegt." /></div>
        ) : (
          turniere.map((t) => (
            <button key={t.id} onClick={() => setAusgewaehlteId(t.id)} className="w-full text-left p-4 hover:bg-gray-50 flex items-center justify-between gap-3">
              <div>
                <p className="font-medium text-sm" style={{ color: COLORS.anthracite }}>{t.titel}</p>
                <p className="text-xs text-gray-400">
                  {t.typ === "doppel" ? "Doppel" : t.system === "schweizer_system" ? "Einzel · Schweizer System" : "Einzel · Jeder gegen Jeden"}
                  {t.datum ? ` · ${formatDatum(t.datum)}` : ""}
                </p>
              </div>
              <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0" style={statusFarbe[t.status]}>{statusLabel[t.status]}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function TurnierDetail({ turnierId, profil, onZurueck }) {
  const [turnier, setTurnier] = useState(null);
  const [teilnehmer, setTeilnehmer] = useState([]);
  const [alleSpieler, setAlleSpieler] = useState([]);
  const [paare, setPaare] = useState([]);
  const [spiele, setSpiele] = useState([]);
  const [umfrageJaIds, setUmfrageJaIds] = useState([]);
  const [ladend, setLadend] = useState(true);
  const [aktionLadend, setAktionLadend] = useState(false);
  const [fehler, setFehler] = useState(null);
  const [neuerTeilnehmerId, setNeuerTeilnehmerId] = useState("");

  const darf = darfTurniereVerwalten(profil) && turnier?.status !== "abgeschlossen";

  async function laden() {
    setLadend(true);
    const { data: t } = await supabase.from("turniere").select("*").eq("id", turnierId).single();
    setTurnier(t);

    const [{ data: tn }, { data: sp }, { data: pa }, { data: sl }] = await Promise.all([
      supabase.from("turnier_teilnehmer").select("*").eq("turnier_id", turnierId),
      supabase.from("turnier_spiele").select("*").eq("turnier_id", turnierId).order("runde"),
      supabase.from("turnier_paare").select("*").eq("turnier_id", turnierId),
      supabase.from("profiles").select("id, vorname, nachname, mannschaft_id"),
    ]);
    setTeilnehmer(tn ?? []);
    setSpiele(sp ?? []);
    setPaare(pa ?? []);
    setAlleSpieler(sl ?? []);

    if (t?.umfrage_id) {
      const { data: antworten } = await supabase.from("umfrage_antworten").select("spieler_id, ausgewaehlte_optionen").eq("umfrage_id", t.umfrage_id);
      setUmfrageJaIds((antworten ?? []).filter((a) => a.ausgewaehlte_optionen.includes(0)).map((a) => a.spieler_id));
    } else {
      setUmfrageJaIds([]);
    }
    setLadend(false);
  }

  useEffect(() => { laden(); }, [turnierId]);

  const spielerNamen = {};
  alleSpieler.forEach((s) => { spielerNamen[s.id] = `${s.vorname} ${s.nachname}`; });

  const paarNamen = {};
  paare.forEach((p) => { paarNamen[p.id] = `${spielerNamen[p.spieler_a_id] ?? "?"} / ${spielerNamen[p.spieler_b_id] ?? "?"}`; });

  const teilnehmerIds = teilnehmer.map((t) => t.spieler_id);
  const nochNichtUebernommen = umfrageJaIds.filter((id) => !teilnehmerIds.includes(id));
  const nichtTeilnehmer = alleSpieler.filter((s) => !teilnehmerIds.includes(s.id));

  async function teilnehmerAusUmfrageUebernehmen() {
    if (nochNichtUebernommen.length === 0) return;
    setAktionLadend(true);
    await supabase.from("turnier_teilnehmer").insert(nochNichtUebernommen.map((spieler_id) => ({ turnier_id: turnierId, spieler_id })));
    setAktionLadend(false);
    laden();
  }

  async function teilnehmerHinzufuegen() {
    if (!neuerTeilnehmerId) return;
    await supabase.from("turnier_teilnehmer").insert({ turnier_id: turnierId, spieler_id: neuerTeilnehmerId });
    setNeuerTeilnehmerId("");
    laden();
  }

  async function alleSpielerHinzufuegen() {
    if (nichtTeilnehmer.length === 0) return;
    setAktionLadend(true);
    await supabase.from("turnier_teilnehmer").insert(nichtTeilnehmer.map((s) => ({ turnier_id: turnierId, spieler_id: s.id })));
    setAktionLadend(false);
    laden();
  }

  async function teilnehmerEntfernen(id) {
    await supabase.from("turnier_teilnehmer").delete().eq("id", id);
    laden();
  }

  function mischen(liste) {
    const kopie = [...liste];
    for (let i = kopie.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [kopie[i], kopie[j]] = [kopie[j], kopie[i]];
    }
    return kopie;
  }

  async function paareAuslosen() {
    setFehler(null);
    const poolA = mischen(alleSpieler.filter((s) => teilnehmerIds.includes(s.id) && (turnier.doppel_pool_a ?? []).includes(s.mannschaft_id)));
    const poolB = mischen(alleSpieler.filter((s) => teilnehmerIds.includes(s.id) && (turnier.doppel_pool_b ?? []).includes(s.mannschaft_id)));
    const anzahl = Math.min(poolA.length, poolB.length);
    if (anzahl < 2) return setFehler("Zu wenige Teilnehmer in Pool A oder Pool B für eine Auslosung.");

    setAktionLadend(true);
    const neuePaare = [];
    for (let i = 0; i < anzahl; i++) {
      neuePaare.push({ turnier_id: turnierId, spieler_a_id: poolA[i].id, spieler_b_id: poolB[i].id });
    }
    const { data: eingefuegtePaare } = await supabase.from("turnier_paare").insert(neuePaare).select();

    const spieleNeu = [];
    for (let i = 0; i < eingefuegtePaare.length; i++) {
      for (let j = i + 1; j < eingefuegtePaare.length; j++) {
        spieleNeu.push({ turnier_id: turnierId, runde: 1, paar_a_id: eingefuegtePaare[i].id, paar_b_id: eingefuegtePaare[j].id });
        if (turnier.mit_rueckspiel) {
          spieleNeu.push({ turnier_id: turnierId, runde: 2, paar_a_id: eingefuegtePaare[j].id, paar_b_id: eingefuegtePaare[i].id });
        }
      }
    }
    if (spieleNeu.length > 0) await supabase.from("turnier_spiele").insert(spieleNeu);

    await supabase.from("turniere").update({ status: "laufend", aktuelle_runde: turnier.mit_rueckspiel ? 2 : 1 }).eq("id", turnierId);
    setAktionLadend(false);
    laden();
  }

  async function alleRundenturnierPaarungenErstellen() {
    const teilnehmerListe = teilnehmerIds.map((id) => ({ id }));
    const spieleNeu = [];
    for (let i = 0; i < teilnehmerListe.length; i++) {
      for (let j = i + 1; j < teilnehmerListe.length; j++) {
        spieleNeu.push({ turnier_id: turnierId, runde: 1, spieler_a_id: teilnehmerListe[i].id, spieler_b_id: teilnehmerListe[j].id });
        if (turnier.mit_rueckspiel) {
          spieleNeu.push({ turnier_id: turnierId, runde: 2, spieler_a_id: teilnehmerListe[j].id, spieler_b_id: teilnehmerListe[i].id });
        }
      }
    }
    if (spieleNeu.length === 0) return;
    setAktionLadend(true);
    await supabase.from("turnier_spiele").insert(spieleNeu);
    await supabase.from("turniere").update({ status: "laufend", aktuelle_runde: turnier.mit_rueckspiel ? 2 : 1 }).eq("id", turnierId);
    setAktionLadend(false);
    laden();
  }

  async function naechsteRundeAuslosen() {
    const stats = berechneEinzelTabelle(teilnehmerIds, spiele, spielerNamen);
    const bereitsGespielt = new Set();
    spiele.filter((s) => !s.ist_freilos).forEach((s) => bereitsGespielt.add([s.spieler_a_id, s.spieler_b_id].sort().join("|")));
    const bereitsFreilos = new Set(spiele.filter((s) => s.ist_freilos).map((s) => s.spieler_a_id ?? s.spieler_b_id));

    const { paarungen, freilos } = schweizerPaarung(stats, bereitsGespielt, bereitsFreilos);
    const naechsteRunde = (turnier.aktuelle_runde || 0) + 1;

    setAktionLadend(true);
    const spieleNeu = paarungen.map(([a, b]) => ({ turnier_id: turnierId, runde: naechsteRunde, spieler_a_id: a.id, spieler_b_id: b.id }));
    if (freilos) {
      spieleNeu.push({
        turnier_id: turnierId, runde: naechsteRunde, spieler_a_id: freilos.id, ist_freilos: true,
        gespielt: true, gespielt_am: new Date().toISOString(), saetze_a: mehrheitSaetze(turnier.saetze_pro_spiel), saetze_b: 0,
      });
    }
    await supabase.from("turnier_spiele").insert(spieleNeu);
    await supabase.from("turniere").update({ status: "laufend", aktuelle_runde: naechsteRunde }).eq("id", turnierId);
    setAktionLadend(false);
    laden();
  }

  async function turnierAbschliessen() {
    await supabase.from("turniere").update({ status: "abgeschlossen" }).eq("id", turnierId);
    laden();
  }

  async function ergebnisSpeichern(spielId, saetzeArray) {
    const { saetze_a, saetze_b } = berechneMatchAusSaetzen(saetzeArray);
    await supabase.from("turnier_spiele").update({ saetze: saetzeArray, saetze_a, saetze_b, gespielt: true, gespielt_am: new Date().toISOString() }).eq("id", spielId);
    laden();
  }

  if (ladend || !turnier) return <Leerzustand text="Lade Turnier…" />;

  const istDoppel = turnier.typ === "doppel";
  const rundenNummern = [...new Set(spiele.map((s) => s.runde))].sort((a, b) => a - b);
  const aktuelleRundeSpiele = spiele.filter((s) => s.runde === turnier.aktuelle_runde);
  const aktuelleRundeFertig = aktuelleRundeSpiele.length > 0 && aktuelleRundeSpiele.every((s) => s.gespielt);
  const kannNaechsteRundeAuslosen = darf && !istDoppel && turnier.system === "schweizer_system" && (turnier.aktuelle_runde === 0 || aktuelleRundeFertig) && teilnehmer.length >= 2;

  const tabelle = istDoppel ? berechneDoppelTabelle(paare.map((p) => ({ id: p.id, name: paarNamen[p.id] })), spiele) : berechneEinzelTabelle(teilnehmerIds, spiele, spielerNamen);

  return (
    <div className="space-y-4 max-w-5xl">
      <button onClick={onZurueck} className="text-xs flex items-center gap-1" style={{ color: COLORS.petrol }}>
        <ArrowLeft size={14} /> Zurück zu allen Turnieren
      </button>

      <div className="bg-white rounded-lg border p-5">
        <h2 className="font-bold text-lg" style={{ color: COLORS.anthracite, fontFamily: "Oswald, sans-serif" }}>{turnier.titel}</h2>
        {turnier.beschreibung && <p className="text-sm text-gray-500 mt-1">{turnier.beschreibung}</p>}
        <p className="text-xs text-gray-400 mt-2">
          {istDoppel ? "Doppel" : turnier.system === "schweizer_system" ? "Einzel · Schweizer System" : "Einzel · Jeder gegen Jeden"}
          {turnier.datum ? ` · ${formatDatum(turnier.datum)}` : ""} · {mehrheitSaetze(turnier.saetze_pro_spiel)} Gewinnsätze
          {turnier.mit_rueckspiel ? " · Hin- und Rückspiel" : ""}
        </p>
        {darfTurniereVerwalten(profil) && turnier.status === "laufend" && (
          <button onClick={turnierAbschliessen} className="text-xs underline mt-2" style={{ color: COLORS.orangeDeep }}>Turnier abschließen</button>
        )}
      </div>

      {turnier.umfrage_id && (
        <div className="bg-white rounded-lg border p-5">
          <SectionLabel icon={Vote}>Anmeldung</SectionLabel>
          <p className="text-sm text-gray-500">{umfrageJaIds.length} Zusagen über die Anmelde-Umfrage.</p>
          {darf && nochNichtUebernommen.length > 0 && (
            <button onClick={teilnehmerAusUmfrageUebernehmen} disabled={aktionLadend} className="mt-2 px-3 py-1.5 rounded-md text-white text-xs font-semibold" style={{ background: COLORS.orange }}>
              {nochNichtUebernommen.length} neue Zusage(n) übernehmen
            </button>
          )}
        </div>
      )}

      <div className="bg-white rounded-lg border p-5">
        <SectionLabel icon={Users}>Teilnehmer ({teilnehmer.length})</SectionLabel>
        <div className="flex flex-wrap gap-2 mb-3">
          {teilnehmer.map((t) => (
            <span key={t.id} className="text-xs px-2 py-1 rounded-full flex items-center gap-1" style={{ background: "#F1F1EF" }}>
              {spielerNamen[t.spieler_id] ?? "?"}
              {darf && turnier.status === "anmeldung_offen" && (
                <button onClick={() => teilnehmerEntfernen(t.id)} className="text-gray-400 hover:text-gray-600"><X size={12} /></button>
              )}
            </span>
          ))}
          {teilnehmer.length === 0 && <p className="text-sm text-gray-400">Noch keine Teilnehmer.</p>}
        </div>
        {darf && turnier.status === "anmeldung_offen" && nichtTeilnehmer.length > 0 && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <select value={neuerTeilnehmerId} onChange={(e) => setNeuerTeilnehmerId(e.target.value)} className="flex-1 border rounded-md px-3 py-2 text-sm">
                <option value="">Spieler manuell hinzufügen…</option>
                {nichtTeilnehmer.map((s) => <option key={s.id} value={s.id}>{s.vorname} {s.nachname}</option>)}
              </select>
              <button onClick={teilnehmerHinzufuegen} className="px-3 py-2 rounded-md text-white text-sm font-semibold" style={{ background: COLORS.petrol }}>+</button>
            </div>
            <button onClick={alleSpielerHinzufuegen} className="text-xs underline" style={{ color: COLORS.petrol }}>
              Alle {nichtTeilnehmer.length} verbleibenden Vereinsspieler auf einmal hinzufügen
            </button>
          </div>
        )}
      </div>

      {fehler && <p className="text-xs" style={{ color: COLORS.orangeDeep }}>{fehler}</p>}

      {istDoppel && paare.length === 0 && darf && (
        <button onClick={paareAuslosen} disabled={aktionLadend} className="w-full px-4 py-3 rounded-md text-white text-sm font-semibold" style={{ background: COLORS.orange, opacity: aktionLadend ? 0.6 : 1 }}>
          {aktionLadend ? "Lose…" : "Paare auslosen"}
        </button>
      )}

      {!istDoppel && turnier.system === "rundenturnier" && spiele.length === 0 && darf && (
        <button onClick={alleRundenturnierPaarungenErstellen} disabled={aktionLadend} className="w-full px-4 py-3 rounded-md text-white text-sm font-semibold" style={{ background: COLORS.orange, opacity: aktionLadend ? 0.6 : 1 }}>
          {aktionLadend ? "Erstelle…" : "Alle Paarungen erstellen"}
        </button>
      )}

      {kannNaechsteRundeAuslosen && (
        <button onClick={naechsteRundeAuslosen} disabled={aktionLadend} className="w-full px-4 py-3 rounded-md text-white text-sm font-semibold" style={{ background: COLORS.orange, opacity: aktionLadend ? 0.6 : 1 }}>
          {aktionLadend ? "Lose…" : `Runde ${(turnier.aktuelle_runde || 0) + 1} auslosen`}
        </button>
      )}

      {istDoppel && paare.length > 0 && (
        <div className="bg-white rounded-lg border p-5">
          <SectionLabel icon={Users}>Ausgeloste Paare</SectionLabel>
          <div className="space-y-1">
            {paare.map((p) => <p key={p.id} className="text-sm">{paarNamen[p.id]}</p>)}
          </div>
        </div>
      )}

      <div className="md:grid md:grid-cols-2 md:gap-4 md:items-start space-y-4 md:space-y-0">
        {spiele.length > 0 && (
          <div className="space-y-4">
            {rundenNummern.map((runde) => (
              <div key={runde} className="bg-white rounded-lg border p-5">
                <SectionLabel icon={ShieldCheck}>
                  {turnier.mit_rueckspiel && (istDoppel || turnier.system === "rundenturnier")
                    ? (runde === 1 ? "Hinspiel" : runde === 2 ? "Rückspiel" : `Runde ${runde}`)
                    : istDoppel ? "Spiele" : `Runde ${runde}`}
                </SectionLabel>
                <div className="divide-y">
                  {spiele.filter((s) => s.runde === runde).map((s) => (
                    <SpielZeile
                      key={s.id}
                      spiel={s}
                      nameA={istDoppel ? paarNamen[s.paar_a_id] : spielerNamen[s.spieler_a_id]}
                      nameB={s.ist_freilos ? "Freilos" : istDoppel ? paarNamen[s.paar_b_id] : spielerNamen[s.spieler_b_id]}
                      saetzeProSpiel={turnier.saetze_pro_spiel}
                      darf={darf}
                      onSpeichern={(saetze) => ergebnisSpeichern(s.id, saetze)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {tabelle.length > 0 && tabelle.some((r) => r.siege > 0 || r.niederlagen > 0) && (
          <div className="bg-white rounded-lg border p-5 overflow-x-auto md:sticky md:top-4">
            <SectionLabel icon={Trophy}>Tabelle {turnier.status !== "abgeschlossen" && <span className="text-xs font-normal text-gray-400">(live)</span>}</SectionLabel>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b">
                  <th className="py-2 pr-2">#</th>
                  <th className="py-2 pr-2">Name</th>
                  <th className="py-2 px-2 text-center">Siege</th>
                  <th className="py-2 px-2 text-center">Sätze</th>
                  <th className="py-2 px-2 text-center">Bälle</th>
                  {!istDoppel && turnier.system === "schweizer_system" && <th className="py-2 px-2 text-center">Buchholz</th>}
                </tr>
              </thead>
              <tbody>
                {tabelle.map((r, i) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-2 pr-2 text-gray-400">{i + 1}</td>
                    <td className="py-2 pr-2 font-medium">{r.name}</td>
                    <td className="py-2 px-2 text-center">{r.siege}-{r.niederlagen}</td>
                    <td className="py-2 px-2 text-center">{r.saetzeFuer}:{r.saetzeGegen}</td>
                    <td className="py-2 px-2 text-center">{r.ballFuer}:{r.ballGegen}</td>
                    {!istDoppel && turnier.system === "schweizer_system" && <td className="py-2 px-2 text-center">{r.buchholz}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function SpielZeile({ spiel, nameA, nameB, saetzeProSpiel, darf, onSpeichern }) {
  const [bearbeiten, setBearbeiten] = useState(false);
  const [saetze, setSaetze] = useState([{ a: "", b: "" }]);
  const [validierungsFehler, setValidierungsFehler] = useState(null);

  if (spiel.ist_freilos) {
    return (
      <div className="py-3 flex items-center justify-between">
        <span className="text-sm text-gray-400">{nameA} — Freilos</span>
        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "#F1F1EF", color: "#999" }}>Freilos</span>
      </div>
    );
  }

  if (spiel.gespielt && !bearbeiten) {
    const gewinnerA = spiel.saetze_a > spiel.saetze_b;
    return (
      <div className="py-3 flex items-center justify-between gap-2">
        <div className="text-sm">
          <span style={gewinnerA ? { fontWeight: 700, color: COLORS.petrol } : { color: COLORS.anthracite }}>{nameA}</span>
          <span className="text-gray-400"> vs </span>
          <span style={!gewinnerA ? { fontWeight: 700, color: COLORS.petrol } : { color: COLORS.anthracite }}>{nameB}</span>
          <div className="text-xs text-gray-400">{(spiel.saetze ?? []).map((s, i) => <span key={i} className="mr-2">{s.a}:{s.b}</span>)}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm font-bold px-2 py-1 rounded-md" style={{ background: "#DDF0EA", color: COLORS.petrol }}>{spiel.saetze_a}:{spiel.saetze_b}</span>
          {darf && <button onClick={() => { setSaetze(spiel.saetze?.length ? spiel.saetze : [{ a: "", b: "" }]); setValidierungsFehler(null); setBearbeiten(true); }} className="text-gray-400 hover:text-gray-600"><Pencil size={14} /></button>}
        </div>
      </div>
    );
  }

  if (!darf) {
    return (
      <div className="py-3 flex items-center justify-between">
        <span className="text-sm">{nameA} <span className="text-gray-400">vs</span> {nameB}</span>
        <span className="text-xs text-gray-400">noch nicht gespielt</span>
      </div>
    );
  }

  const mehrheit = mehrheitSaetze(saetzeProSpiel);
  const letzterSatz = saetze[saetze.length - 1];
  const letzterSatzGueltig = istSatzGueltig(letzterSatz);
  const { saetze_a: bisherA, saetze_b: bisherB } = berechneMatchAusSaetzen(saetze.filter(istSatzGueltig));
  const spielBereitsEntschieden = Math.max(bisherA, bisherB) >= mehrheit;
  const darfNeuenSatzHinzufuegen = saetze.length < saetzeProSpiel && letzterSatzGueltig && !spielBereitsEntschieden;

  function punktAendern(index, seite, delta) {
    setSaetze(saetze.map((x, j) => {
      if (j !== index) return x;
      const aktuell = Number(x[seite]) || 0;
      return { ...x, [seite]: String(Math.max(0, aktuell + delta)) };
    }));
  }

  function ergebnisPruefenUndSpeichern() {
    setValidierungsFehler(null);
    const gueltig = saetze.filter((s) => s.a !== "" && s.b !== "");
    if (gueltig.length === 0) return;

    // 1) Jeder einzelne Satz muss einer echten Tischtennis-Satzendung entsprechen:
    // mindestens 11 Punkte UND mindestens 2 Punkte Vorsprung (bei 10:10 geht's weiter).
    for (let i = 0; i < gueltig.length; i++) {
      if (!istSatzGueltig(gueltig[i])) {
        setValidierungsFehler(`Satz ${i + 1}: Ein Satz endet erst, wenn eine Seite mindestens 11 Punkte UND 2 Punkte Vorsprung hat (z. B. 11:7 oder bei Verlängerung 13:11).`);
        return;
      }
    }

    // 2) Das Spiel darf erst als beendet gespeichert werden, wenn eine Seite wirklich
    // die nötige Mehrheit der Sätze erreicht hat (z. B. bei Best of 5 wirklich 3 Sätze).
    const { saetze_a, saetze_b } = berechneMatchAusSaetzen(gueltig);
    if (Math.max(saetze_a, saetze_b) !== mehrheit) {
      setValidierungsFehler(`Das Spiel ist erst entschieden, wenn eine Seite ${mehrheit} Sätze gewonnen hat (aktuell ${saetze_a}:${saetze_b}).`);
      return;
    }

    onSpeichern(gueltig);
    setBearbeiten(false);
  }

  function zahlFeld(index, seite) {
    const wert = saetze[index][seite];
    return (
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => punktAendern(index, seite, -1)} className="w-7 h-7 rounded-md border text-gray-500 shrink-0 flex items-center justify-center">−</button>
        <input
          type="number"
          min={0}
          value={wert}
          onChange={(e) => setSaetze(saetze.map((x, j) => (j === index ? { ...x, [seite]: e.target.value } : x)))}
          className="w-14 border rounded-md px-1 py-1 text-sm text-center"
        />
        <button type="button" onClick={() => punktAendern(index, seite, 1)} className="w-7 h-7 rounded-md border text-gray-500 shrink-0 flex items-center justify-center">+</button>
        <button
          type="button"
          onClick={() => {
            const gegnerseite = seite === "a" ? "b" : "a";
            setSaetze(saetze.map((x, j) => (j === index ? { ...x, [seite]: "11", [gegnerseite]: "9" } : x)));
          }}
          className="text-[10px] px-1.5 py-1 rounded-md border text-gray-500 shrink-0"
        >
          11
        </button>
      </div>
    );
  }

  return (
    <div className="py-3">
      <p className="text-sm mb-2">{nameA} <span className="text-gray-400">vs</span> {nameB}</p>
      <div className="space-y-2">
        {saetze.map((s, i) => {
          const istLetzter = i === saetze.length - 1;
          const gueltig = istSatzGueltig(s);
          return (
            <div key={i} className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-400 w-12">Satz {i + 1}</span>
              {zahlFeld(i, "a")}
              <span className="text-gray-400">:</span>
              {zahlFeld(i, "b")}
              {istLetzter && (
                <span className="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={gueltig ? { background: COLORS.petrol } : { background: "#E5E3DD" }}>
                  {gueltig && <Check size={12} color="white" />}
                </span>
              )}
              {saetze.length > 1 && <button onClick={() => setSaetze(saetze.filter((_, j) => j !== i))} className="text-gray-300"><X size={14} /></button>}
            </div>
          );
        })}
      </div>
      {validierungsFehler && <p className="text-xs mt-2" style={{ color: COLORS.orangeDeep }}>{validierungsFehler}</p>}
      <div className="flex gap-2 mt-2 items-center">
        {saetze.length < saetzeProSpiel && !spielBereitsEntschieden && (
          <button
            onClick={() => darfNeuenSatzHinzufuegen && setSaetze([...saetze, { a: "", b: "" }])}
            disabled={!darfNeuenSatzHinzufuegen}
            className="text-xs underline"
            style={darfNeuenSatzHinzufuegen ? { color: COLORS.petrol } : { color: "#C7C5BE", textDecoration: "none", cursor: "not-allowed" }}
            title={darfNeuenSatzHinzufuegen ? "" : "Erst den aktuellen Satz gültig abschließen"}
          >
            + Satz
          </button>
        )}
        <button onClick={ergebnisPruefenUndSpeichern} className="text-xs px-3 py-1 rounded-md text-white font-semibold ml-auto" style={{ background: COLORS.orange }}>
          Ergebnis speichern
        </button>
        {bearbeiten && <button onClick={() => { setBearbeiten(false); setValidierungsFehler(null); }} className="text-xs px-3 py-1 rounded-md border">Abbrechen</button>}
      </div>
      <p className="text-[11px] text-gray-400 mt-1">Wer zuerst {mehrheit} Sätze gewinnt (je Satz mind. 11 Punkte, mind. 2 Punkte Vorsprung), gewinnt das Spiel.</p>
    </div>
  );
}

/* ---------- App-Shell ---------- */

const NAV_BASIS = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "tabelle", label: "Tabelle", icon: Table2 },
  { key: "ergebnisse", label: "Ergebnisse", icon: Trophy },
  { key: "planung", label: "Spielerplanung", icon: ShieldCheck },
  { key: "turniere", label: "Vereinsturniere", icon: Award },
  { key: "kalender", label: "Kalender", icon: CalendarDays },
  { key: "kader", label: "Kader", icon: Users },
  { key: "umfragen", label: "Umfragen", icon: Vote },
  { key: "nachrichten", label: "Nachrichten", icon: MessageSquare },
  { key: "einstellungen", label: "Einstellungen", icon: Settings },
];

/* ---------- Konto kündigen ----------
   Spieler stellen den Antrag selbst; löschen darf ihn nur ein Admin oder der
   Mannschaftsführer. So kann niemand versehentlich oder im Affekt seinen Zugang
   verlieren, und die Mannschaftsführung erfährt zuverlässig davon. */

function KontoKuendigung({ profil }) {
  const [antrag, setAntrag] = useState(null);
  const [ladend, setLadend] = useState(true);
  const [formOffen, setFormOffen] = useState(false);
  const [grund, setGrund] = useState("");
  const [senden, setSenden] = useState(false);
  const [fehler, setFehler] = useState(null);

  async function laden() {
    setLadend(true);
    const { data } = await supabase
      .from("konto_loeschungen")
      .select("*")
      .eq("spieler_id", profil.id)
      .eq("status", "offen")
      .maybeSingle();
    setAntrag(data ?? null);
    setLadend(false);
  }

  useEffect(() => { laden(); }, [profil.id]);

  async function beantragen() {
    setFehler(null);
    setSenden(true);
    const { error } = await supabase.from("konto_loeschungen").insert({
      spieler_id: profil.id,
      spieler_name: `${profil.vorname} ${profil.nachname}`,
      spieler_email: profil.email,
      mannschaft_id: profil.mannschaft_id ?? null,
      grund: grund.trim() || null,
      status: "offen",
    });
    setSenden(false);
    if (error) return setFehler(error.message);
    setFormOffen(false);
    setGrund("");
    laden();
  }

  async function zurueckziehen() {
    setFehler(null);
    const { error } = await supabase.from("konto_loeschungen").delete().eq("id", antrag.id);
    if (error) return setFehler(error.message);
    laden();
  }

  if (ladend) return null;

  return (
    <div className="bg-white rounded-lg border p-5">
      <SectionLabel icon={LogOut}>Konto kündigen</SectionLabel>

      {antrag ? (
        <>
          <div className="p-3 rounded-md text-sm mb-3" style={{ background: "#FBE2DA", color: COLORS.orangeDeep }}>
            <p className="font-semibold">Deine Kündigung liegt zur Bestätigung vor.</p>
            <p className="text-xs mt-1">
              Eingereicht am {formatDatum(antrag.erstellt_am)}. Sobald ein Administrator oder dein Mannschaftsführer
              sie bestätigt, werden dein Zugang und alle deine Daten gelöscht. Bis dahin kannst du die App normal weiter nutzen.
            </p>
          </div>
          <button onClick={zurueckziehen} className="px-4 py-2 rounded-md text-sm font-semibold border" style={{ borderColor: COLORS.petrol, color: COLORS.petrol }}>
            Kündigung zurückziehen
          </button>
        </>
      ) : formOffen ? (
        <>
          <p className="text-sm text-gray-600 mb-3">
            Mit der Kündigung werden dein Zugang, dein Profil, deine Rückmeldungen und deine Nachrichten
            vollständig gelöscht. Das lässt sich danach nicht rückgängig machen.
          </p>
          <label className="block text-xs text-gray-500 mb-1">Grund (optional)</label>
          <textarea
            value={grund}
            onChange={(e) => setGrund(e.target.value)}
            rows={3}
            placeholder="Magst du kurz sagen, warum? Hilft uns, die App besser zu machen."
            className="w-full border rounded-md px-3 py-2 text-sm mb-3"
          />
          {fehler && <p className="text-xs mb-2" style={{ color: COLORS.orangeDeep }}>{fehler}</p>}
          <div className="flex gap-2">
            <button
              onClick={beantragen}
              disabled={senden}
              className="px-4 py-2 rounded-md text-white text-sm font-semibold"
              style={{ background: COLORS.orangeDeep, opacity: senden ? 0.6 : 1 }}
            >
              {senden ? "Sende…" : "Kündigung einreichen"}
            </button>
            <button onClick={() => { setFormOffen(false); setFehler(null); }} className="px-4 py-2 rounded-md text-sm border">
              Abbrechen
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-gray-600 mb-3">
            Du möchtest die App nicht mehr nutzen? Dann kannst du hier die Löschung deines Kontos beantragen.
            Ein Administrator oder dein Mannschaftsführer bestätigt sie, danach sind alle deine Daten entfernt.
          </p>
          <button onClick={() => setFormOffen(true)} className="px-4 py-2 rounded-md text-sm font-semibold border" style={{ borderColor: COLORS.orangeDeep, color: COLORS.orangeDeep }}>
            Konto kündigen
          </button>
        </>
      )}
    </div>
  );
}

function KuendigungsAntraege({ profil, onErledigt }) {
  const [antraege, setAntraege] = useState([]);
  const [ladend, setLadend] = useState(true);
  const [bearbeiteId, setBearbeiteId] = useState(null);
  const [fehler, setFehler] = useState(null);

  async function laden() {
    setLadend(true);
    const { data } = await supabase
      .from("konto_loeschungen")
      .select("*")
      .eq("status", "offen")
      .order("erstellt_am");
    setAntraege(data ?? []);
    setLadend(false);
  }

  useEffect(() => { laden(); }, [profil.id]);

  async function bestaetigen(antrag) {
    setFehler(null);
    setBearbeiteId(antrag.id);
    const { data, error } = await supabase.functions.invoke("delete-spieler", { body: { spielerId: antrag.spieler_id } });
    if (error || data?.error) {
      setBearbeiteId(null);
      setFehler(await echteFehlermeldung(error, data));
      return;
    }
    // Antrag als erledigt vermerken — der Eintrag bleibt als Nachweis bestehen
    await supabase
      .from("konto_loeschungen")
      .update({ status: "bestaetigt", bearbeitet_von: profil.id, bearbeitet_am: new Date().toISOString() })
      .eq("id", antrag.id);
    setBearbeiteId(null);
    laden();
    onErledigt?.();
  }

  async function ablehnen(antrag) {
    setFehler(null);
    setBearbeiteId(antrag.id);
    await supabase
      .from("konto_loeschungen")
      .update({ status: "abgelehnt", bearbeitet_von: profil.id, bearbeitet_am: new Date().toISOString() })
      .eq("id", antrag.id);
    setBearbeiteId(null);
    laden();
  }

  if (ladend || antraege.length === 0) return null;

  return (
    <div className="bg-white rounded-lg border p-5 mb-6" style={{ borderColor: COLORS.orangeDeep }}>
      <SectionLabel icon={AlertTriangle}>Offene Kündigungen ({antraege.length})</SectionLabel>
      <p className="text-xs text-gray-500 mb-3">
        Diese Spieler haben die Löschung ihres Kontos beantragt. Mit der Bestätigung werden Zugang und
        alle Daten endgültig entfernt — bitte vorher kurz Rücksprache halten.
      </p>
      {fehler && <p className="text-xs mb-3 p-2 rounded-md" style={{ background: "#FBE2DA", color: COLORS.orangeDeep }}>{fehler}</p>}
      <div className="divide-y">
        {antraege.map((a) => (
          <div key={a.id} className="py-3 first:pt-0 last:pb-0">
            <p className="text-sm font-medium" style={{ color: COLORS.anthracite }}>{a.spieler_name}</p>
            <p className="text-xs text-gray-400">{a.spieler_email} · eingereicht am {formatDatum(a.erstellt_am)}</p>
            {a.grund && <p className="text-sm text-gray-600 mt-1 italic">„{a.grund}"</p>}
            <div className="flex flex-wrap gap-2 mt-2">
              <button
                onClick={() => bestaetigen(a)}
                disabled={bearbeiteId === a.id}
                className="px-3 py-1.5 rounded-md text-white text-xs font-semibold"
                style={{ background: COLORS.orangeDeep, opacity: bearbeiteId === a.id ? 0.6 : 1 }}
              >
                {bearbeiteId === a.id ? "Lösche…" : "Kündigung bestätigen und löschen"}
              </button>
              <button
                onClick={() => ablehnen(a)}
                disabled={bearbeiteId === a.id}
                className="px-3 py-1.5 rounded-md text-xs font-semibold border"
              >
                Erledigt, Spieler bleibt
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Neuigkeiten (News) auf dem Dashboard ----------
   Sichtbar für alle. Schreiben, ändern und löschen dürfen nur Admins sowie
   Mannschaftsführer und ihre Stellvertreter. Angezeigt werden zunächst die drei
   jüngsten Beiträge, ältere lassen sich aufklappen. */

const NEWS_SICHTBAR = 3;

function News({ profil }) {
  const [beitraege, setBeitraege] = useState([]);
  const [autoren, setAutoren] = useState({});
  const [mannschaften, setMannschaften] = useState([]);
  const [ladend, setLadend] = useState(true);
  const [alleZeigen, setAlleZeigen] = useState(false);
  const [formOffen, setFormOffen] = useState(false);
  const [bearbeiteId, setBearbeiteId] = useState(null);
  const [form, setForm] = useState({ titel: "", inhalt: "", mannschaftId: "" });
  const [loeschenBestaetigung, setLoeschenBestaetigung] = useState(null);
  const [speichernLadend, setSpeichernLadend] = useState(false);
  const [fehler, setFehler] = useState(null);

  const darfSchreiben = profil.ist_admin || istTeamLeiter(profil);

  async function laden() {
    setLadend(true);
    const [{ data: news }, { data: personen }, { data: teams }] = await Promise.all([
      supabase.from("news").select("*").order("erstellt_am", { ascending: false }),
      supabase.from("profiles").select("id, vorname, nachname, avatar_url"),
      supabase.from("mannschaften").select("id, name, hierarchie_stufe"),
    ]);
    setBeitraege(news ?? []);
    setAutoren(Object.fromEntries((personen ?? []).map((p) => [p.id, p])));
    setMannschaften(sortiereMannschaften(teams));
    setLadend(false);
  }

  useEffect(() => { laden(); }, [profil.id]);

  function formularOeffnen(beitrag) {
    setFehler(null);
    if (beitrag) {
      setBearbeiteId(beitrag.id);
      setForm({ titel: beitrag.titel, inhalt: beitrag.inhalt, mannschaftId: beitrag.mannschaft_id ?? "" });
    } else {
      setBearbeiteId(null);
      // Mannschaftsführer schreiben standardmäßig für die eigene Mannschaft
      setForm({ titel: "", inhalt: "", mannschaftId: profil.ist_admin ? "" : (profil.mannschaft_id ?? "") });
    }
    setFormOffen(true);
  }

  async function speichern() {
    setFehler(null);
    if (!form.titel.trim() || !form.inhalt.trim()) return setFehler("Bitte Überschrift und Text ausfüllen.");
    setSpeichernLadend(true);
    const werte = {
      titel: form.titel.trim(),
      inhalt: form.inhalt.trim(),
      mannschaft_id: form.mannschaftId || null,
    };
    const { error } = bearbeiteId
      ? await supabase.from("news").update({ ...werte, aktualisiert_am: new Date().toISOString() }).eq("id", bearbeiteId)
      : await supabase.from("news").insert({ ...werte, autor_id: profil.id });
    setSpeichernLadend(false);
    if (error) return setFehler(error.message);
    setFormOffen(false);
    setBearbeiteId(null);
    laden();
  }

  async function loeschen(id) {
    if (loeschenBestaetigung !== id) return setLoeschenBestaetigung(id);
    const { error } = await supabase.from("news").delete().eq("id", id);
    setLoeschenBestaetigung(null);
    if (error) return setFehler(error.message);
    laden();
  }

  const sichtbare = alleZeigen ? beitraege : beitraege.slice(0, NEWS_SICHTBAR);
  const weitere = beitraege.length - NEWS_SICHTBAR;

  return (
    <div className="bg-white rounded-lg border p-5">
      <div className="flex items-center justify-between mb-3">
        <SectionLabel icon={Newspaper}>Neuigkeiten aus dem Verein</SectionLabel>
        {darfSchreiben && !formOffen && (
          <button
            onClick={() => formularOeffnen(null)}
            className="text-xs px-3 py-1.5 rounded-md text-white font-semibold flex items-center gap-1 shrink-0"
            style={{ background: COLORS.orange }}
          >
            <Plus size={13} /> Beitrag schreiben
          </button>
        )}
      </div>

      {formOffen && (
        <div className="mb-4 p-3 rounded-md border" style={{ background: COLORS.paper }}>
          <label className="block text-xs text-gray-500 mb-1">Überschrift</label>
          <input
            value={form.titel}
            onChange={(e) => setForm({ ...form, titel: e.target.value })}
            placeholder="z. B. Hallenzeiten in den Ferien"
            className="w-full border rounded-md px-3 py-2 text-sm mb-3"
          />
          <label className="block text-xs text-gray-500 mb-1">Text</label>
          <textarea
            value={form.inhalt}
            onChange={(e) => setForm({ ...form, inhalt: e.target.value })}
            rows={4}
            className="w-full border rounded-md px-3 py-2 text-sm mb-3"
          />
          <label className="block text-xs text-gray-500 mb-1">Für wen ist der Beitrag?</label>
          <select
            value={form.mannschaftId}
            onChange={(e) => setForm({ ...form, mannschaftId: e.target.value })}
            disabled={!profil.ist_admin}
            className="w-full border rounded-md px-3 py-2 text-sm mb-3"
            style={{ opacity: profil.ist_admin ? 1 : 0.7 }}
          >
            <option value="">Ganzer Verein</option>
            {mannschaften.map((m) => <option key={m.id} value={m.id}>Nur {m.name}</option>)}
          </select>
          {!profil.ist_admin && (
            <p className="text-[11px] text-gray-400 mb-3">
              Als Mannschaftsführer schreibst du für deine eigene Mannschaft. Vereinsweite Beiträge kann ein Admin anlegen.
            </p>
          )}
          {fehler && <p className="text-xs mb-2" style={{ color: COLORS.orangeDeep }}>{fehler}</p>}
          <div className="flex gap-2">
            <button
              onClick={speichern}
              disabled={speichernLadend}
              className="px-4 py-2 rounded-md text-white text-sm font-semibold"
              style={{ background: COLORS.orange, opacity: speichernLadend ? 0.6 : 1 }}
            >
              {speichernLadend ? "Speichere…" : bearbeiteId ? "Änderungen speichern" : "Veröffentlichen"}
            </button>
            <button onClick={() => { setFormOffen(false); setBearbeiteId(null); setFehler(null); }} className="px-4 py-2 rounded-md text-sm border">
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {ladend ? (
        <p className="text-sm text-gray-400">Lade Neuigkeiten…</p>
      ) : beitraege.length === 0 ? (
        <p className="text-sm text-gray-400">
          {darfSchreiben ? "Noch keine Beiträge — schreib den ersten." : "Aktuell gibt es keine Neuigkeiten."}
        </p>
      ) : (
        <>
          <div className="space-y-4">
            {sichtbare.map((b) => {
              const autor = autoren[b.autor_id];
              const team = mannschaften.find((m) => m.id === b.mannschaft_id);
              return (
                <div key={b.id} className="border-b last:border-b-0 pb-4 last:pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm" style={{ color: COLORS.anthracite }}>{b.titel}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-0.5 text-[11px] text-gray-400">
                        <span>{new Date(b.erstellt_am).toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" })}</span>
                        {autor && <span>· {autor.vorname} {autor.nachname}</span>}
                        {team && (
                          <span className="px-1.5 py-0.5 rounded-full" style={{ background: "#E4F2EE", color: COLORS.petrol }}>
                            {team.name}
                          </span>
                        )}
                        {b.aktualisiert_am && <span>· bearbeitet</span>}
                      </div>
                    </div>
                    {darfSchreiben && (
                      <div className="flex items-center gap-2 shrink-0">
                        {loeschenBestaetigung === b.id ? (
                          <>
                            <span className="text-xs text-gray-500">Löschen?</span>
                            <button onClick={() => loeschen(b.id)} className="text-xs px-2 py-1 rounded-md text-white" style={{ background: COLORS.orangeDeep }}>Ja</button>
                            <button onClick={() => setLoeschenBestaetigung(null)} className="text-xs px-2 py-1 rounded-md border">Nein</button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => formularOeffnen(b)} className="text-gray-400 hover:text-gray-600"><Pencil size={14} /></button>
                            <button onClick={() => loeschen(b.id)} style={{ color: COLORS.orangeDeep }}><Trash2 size={14} /></button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap">{b.inhalt}</p>
                </div>
              );
            })}
          </div>

          {weitere > 0 && (
            <button
              onClick={() => setAlleZeigen(!alleZeigen)}
              className="text-xs mt-4 flex items-center gap-1 font-semibold"
              style={{ color: COLORS.petrol }}
            >
              {alleZeigen ? "Ältere Beiträge ausblenden" : `${weitere} ältere ${weitere === 1 ? "Beitrag" : "Beiträge"} anzeigen`}
              <ChevronRight size={13} style={{ transform: alleZeigen ? "rotate(-90deg)" : "rotate(90deg)" }} />
            </button>
          )}
        </>
      )}
    </div>
  );
}

/* ---------- Profilbild ---------- */

function Avatar({ person, groesse = 32, className = "" }) {
  const initialen = `${person?.vorname?.[0] ?? ""}${person?.nachname?.[0] ?? ""}`.toUpperCase();
  const stil = { width: groesse, height: groesse, background: COLORS.petrol };

  if (person?.avatar_url) {
    return (
      <img
        src={person.avatar_url}
        alt={`${person.vorname ?? ""} ${person.nachname ?? ""}`}
        className={`rounded-full object-cover shrink-0 ${className}`}
        style={{ width: groesse, height: groesse }}
      />
    );
  }
  return (
    <div
      className={`rounded-full flex items-center justify-center text-white font-bold shrink-0 ${className}`}
      style={{ ...stil, fontSize: Math.round(groesse * 0.38), fontFamily: "Oswald, sans-serif" }}
    >
      {initialen}
    </div>
  );
}

/* ---------- Benachrichtigungen (Glocke in der Kopfzeile) ---------- */

function Benachrichtigungen({ profil, onOeffneUmfrage, onOeffneNachricht, onOeffneKalender, onOeffneSpieler }) {
  const [offen, setOffen] = useState(false);
  const [eintraege, setEintraege] = useState([]);
  const [ladend, setLadend] = useState(true);

  async function laden() {
    setLadend(true);
    const inSiebenTagen = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const [{ data: nachrichten }, { data: umfragen }, { data: ziele }, { data: antworten }, { data: termine }] = await Promise.all([
      supabase.from("nachrichten").select("id, von_id, inhalt, gesendet_am").eq("an_id", profil.id).eq("gelesen", false),
      supabase.from("umfragen").select("id, titel, endet_am, mannschaft_id").eq("aktiv", true),
      supabase.from("umfrage_ziele").select("umfrage_id, spieler_id"),
      supabase.from("umfrage_antworten").select("umfrage_id").eq("spieler_id", profil.id),
      supabase.from("kalender_ereignisse").select("id, titel, datum, mannschaft_id")
        .gte("datum", new Date().toISOString()).lte("datum", inSiebenTagen).order("datum"),
    ]);

    const liste = [];

    // Ungelesene Nachrichten je Absender zusammenfassen
    const nachSender = {};
    (nachrichten ?? []).forEach((n) => {
      if (!nachSender[n.von_id]) nachSender[n.von_id] = [];
      nachSender[n.von_id].push(n);
    });
    const senderIds = Object.keys(nachSender);
    if (senderIds.length > 0) {
      const { data: absender } = await supabase.from("profiles").select("id, vorname, nachname, avatar_url").in("id", senderIds);
      senderIds.forEach((id) => {
        const person = (absender ?? []).find((a) => a.id === id);
        const anzahl = nachSender[id].length;
        liste.push({
          art: "nachricht",
          id: `n-${id}`,
          person,
          titel: person ? `${person.vorname} ${person.nachname}` : "Neue Nachricht",
          text: anzahl === 1 ? nachSender[id][0].inhalt : `${anzahl} ungelesene Nachrichten`,
          zeit: nachSender[id].at(-1)?.gesendet_am,
          aktion: () => onOeffneNachricht(id),
        });
      });
    }

    // Umfragen, bei denen meine Stimme noch fehlt
    const beantwortet = new Set((antworten ?? []).map((a) => a.umfrage_id));
    const zielMap = {};
    (ziele ?? []).forEach((z) => {
      if (!zielMap[z.umfrage_id]) zielMap[z.umfrage_id] = [];
      zielMap[z.umfrage_id].push(z.spieler_id);
    });
    (umfragen ?? []).forEach((u) => {
      if (beantwortet.has(u.id)) return;
      if (u.endet_am && new Date(u.endet_am) <= new Date()) return;
      const zieleDerUmfrage = zielMap[u.id];
      const betrifftMich = !zieleDerUmfrage || zieleDerUmfrage.includes(profil.id);
      if (!betrifftMich) return;
      liste.push({
        art: "umfrage",
        id: `u-${u.id}`,
        titel: u.titel,
        text: u.endet_am ? `Abstimmung läuft bis ${formatDatum(u.endet_am)}` : "Deine Stimme fehlt noch",
        zeit: u.endet_am,
        aktion: () => onOeffneUmfrage(u.id),
      });
    });

    // Offene Kündigungen — nur für Admins und Mannschaftsführung
    if (profil.ist_admin || istTeamLeiter(profil)) {
      const { data: kuendigungen } = await supabase
        .from("konto_loeschungen")
        .select("id, spieler_name, erstellt_am")
        .eq("status", "offen");
      (kuendigungen ?? []).forEach((k) => {
        liste.push({
          art: "kuendigung",
          id: `k-${k.id}`,
          titel: `Kündigung: ${k.spieler_name}`,
          text: "Wartet auf deine Bestätigung",
          zeit: k.erstellt_am,
          aktion: () => onOeffneSpieler(),
        });
      });
    }

    // Termine der nächsten sieben Tage
    (termine ?? []).forEach((t) => {
      if (t.mannschaft_id && t.mannschaft_id !== profil.mannschaft_id) return;
      liste.push({
        art: "termin",
        id: `t-${t.id}`,
        titel: t.titel,
        text: new Date(t.datum).toLocaleString("de-DE", { weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) + " Uhr",
        zeit: t.datum,
        aktion: () => onOeffneKalender(),
      });
    });

    setEintraege(liste);
    setLadend(false);
  }

  useEffect(() => { laden(); }, [profil.id]);

  // Beim Zurückkehren zur App neu prüfen
  useEffect(() => {
    function beiRueckkehr() {
      if (document.visibilityState === "visible") laden();
    }
    document.addEventListener("visibilitychange", beiRueckkehr);
    return () => document.removeEventListener("visibilitychange", beiRueckkehr);
  }, [profil.id]);

  const zuErledigen = eintraege.filter((e) => e.art !== "termin").length;
  const symbole = { nachricht: MessageSquare, umfrage: Vote, termin: CalendarDays, kuendigung: AlertTriangle };

  return (
    <div className="relative">
      <button onClick={() => { setOffen(!offen); if (!offen) laden(); }} className="relative flex items-center" title="Benachrichtigungen">
        <Bell size={18} className={zuErledigen > 0 ? "" : "text-gray-400"} style={zuErledigen > 0 ? { color: COLORS.orange } : {}} />
        {zuErledigen > 0 && (
          <span
            className="absolute -top-1.5 -right-1.5 text-white text-[9px] font-bold rounded-full min-w-[15px] h-[15px] flex items-center justify-center px-1"
            style={{ background: COLORS.orange }}
          >
            {zuErledigen}
          </span>
        )}
      </button>

      {offen && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOffen(false)} />
          <div className="absolute right-0 mt-3 w-80 max-w-[85vw] bg-white rounded-lg border shadow-xl z-40 overflow-hidden">
            <div className="px-4 py-2.5 border-b flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: COLORS.anthracite }}>Neu für dich</span>
              {ladend && <span className="text-[10px] text-gray-400">lädt…</span>}
            </div>
            <div className="max-h-[60vh] overflow-y-auto divide-y">
              {eintraege.length === 0 && !ladend ? (
                <p className="px-4 py-6 text-sm text-gray-400 text-center">Alles erledigt — nichts Neues.</p>
              ) : (
                eintraege.map((e) => {
                  const Symbol = symbole[e.art];
                  return (
                    <button
                      key={e.id}
                      onClick={() => { setOffen(false); e.aktion(); }}
                      className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-gray-50"
                    >
                      {e.person ? (
                        <Avatar person={e.person} groesse={28} className="mt-0.5" />
                      ) : (
                        <span
                          className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                          style={e.art === "termin" ? { background: "#E4F2EE", color: COLORS.petrol } : { background: "#FBE2DA", color: COLORS.orangeDeep }}
                        >
                          <Symbol size={13} />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium truncate" style={{ color: COLORS.anthracite }}>{e.titel}</span>
                        <span className="block text-xs text-gray-500 truncate">{e.text}</span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function App() {
  const [profil, setProfil] = useState(null);
  const [sessionGeprueft, setSessionGeprueft] = useState(false);
  const [tab, setTab] = useState("dashboard");
  const [zielUmfrageId, setZielUmfrageId] = useState(null);
  const [zielSpielerId, setZielSpielerId] = useState(null);
  const [navOpen, setNavOpen] = useState(false);
  const [saisons, setSaisons] = useState([]);
  const [saisonsGeladen, setSaisonsGeladen] = useState(false);
  const [mannschaften, setMannschaften] = useState([]);
  const [ausgewaehlteMannschaftId, setAusgewaehlteMannschaftId] = useState(null);
  const [passwortZuruecksetzen, setPasswortZuruecksetzen] = useState(false);

  useEffect(() => {
    // Kommt jemand über den Link aus der "Passwort vergessen"-Mail, meldet Supabase
    // das als PASSWORD_RECOVERY. Dann zeigen wir die Maske für ein neues Passwort,
    // statt ihn direkt ins Dashboard zu lassen.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((ereignis) => {
      if (ereignis === "PASSWORD_RECOVERY") setPasswortZuruecksetzen(true);
    });
    // Falls das Ereignis schon vor dem Registrieren durchgelaufen ist, zusätzlich die Adresse prüfen
    if (typeof window !== "undefined" && window.location.hash.includes("type=recovery")) {
      setPasswortZuruecksetzen(true);
    }
    return () => subscription?.unsubscribe();
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        const { data } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
        if (data) setProfil(data);
      }
      setSessionGeprueft(true);
    });
  }, []);

  useEffect(() => {
    if (!profil) return;
    supabase.from("saisons").select("*").order("erstellt_am", { ascending: false }).then(({ data }) => {
      setSaisons(data ?? []);
      setSaisonsGeladen(true);
    });
    supabase.from("mannschaften").select("*").then(({ data }) => {
      setMannschaften(sortiereMannschaften(data));
      setAusgewaehlteMannschaftId((aktuell) => aktuell ?? profil.mannschaft_id);
    });
  }, [profil]);

  async function abmelden() {
    await supabase.auth.signOut();
    setProfil(null);
    setTab("dashboard");
  }

  if (!sessionGeprueft) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">Lade…</div>;
  }

  if (passwortZuruecksetzen) {
    return (
      <PasswortNeuVergeben
        onFertig={async () => {
          if (typeof window !== "undefined") window.history.replaceState(null, "", window.location.pathname);
          setPasswortZuruecksetzen(false);
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            const { data } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
            if (data) setProfil(data);
          }
        }}
      />
    );
  }

  if (!profil) return <Login onLogin={setProfil} />;

  if (profil.muss_passwort_aendern) {
    return <ErstesPasswortAendern profil={profil} onFertig={() => setProfil({ ...profil, muss_passwort_aendern: false })} />;
  }

  if (!profil.onboarding_gesehen) {
    return <OnboardingTour profil={profil} onFertig={() => setProfil({ ...profil, onboarding_gesehen: true })} />;
  }

  const nav = (profil.ist_admin || istTeamLeiter(profil))
    ? [...NAV_BASIS, { key: "mannschaften", label: "Mannschaften", icon: Shield }, { key: "spieler", label: "Spieler", icon: UserPlus }]
    : NAV_BASIS;

  const titles = {
    dashboard: "Dashboard",
    tabelle: "Aktuelle Tabelle",
    ergebnisse: "Ergebnisse",
    turniere: "Vereinsturniere",
    planung: "Spielerplanung",
    kalender: "Ereigniskalender",
    kader: "Kader",
    umfragen: "Umfragen",
    nachrichten: "Nachrichten",
    einstellungen: "Einstellungen",
    mannschaften: "Mannschaften",
    spieler: "Spieler",
  };

  const aktiveSaison = saisons.find((s) => s.aktiv && s.mannschaft_id === profil.mannschaft_id) ?? null;
  const mannschaftsAbhaengigeTabs = ["tabelle", "ergebnisse", "planung", "kader"];
  const effektiveMannschaftId = mannschaftsAbhaengigeTabs.includes(tab) ? (ausgewaehlteMannschaftId ?? profil.mannschaft_id) : profil.mannschaft_id;
  const angezeigteSaison = saisons.find((s) => s.aktiv && s.mannschaft_id === effektiveMannschaftId) ?? null;
  const eigeneMannschaft = mannschaften.find((m) => m.id === profil.mannschaft_id) ?? null;
  const eigenesMannschaftsLogo = logoFuerMannschaft(eigeneMannschaft);

  return (
    <div className="h-[100dvh] flex overflow-hidden" style={{ background: COLORS.paper, fontFamily: "Inter, sans-serif" }}>
      <AenderungsPopup profil={profil} />
      <UmfrageEskalation profil={profil} />
      <aside
        className={`fixed md:static z-20 h-[100dvh] md:h-full w-64 flex flex-col transition-transform ${navOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}
        style={{ background: COLORS.petrolDark }}
      >
        <div className="p-5 border-b shrink-0" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
          {eigenesMannschaftsLogo ? (
            // Das Mannschaftslogo trägt Vereinsname und Mannschaft bereits in sich
            <img src={eigenesMannschaftsLogo} alt={`TTV 97 Kamenz — ${eigeneMannschaft?.name ?? ""}`} className="w-full max-w-[190px]" />
          ) : (
            <div className="flex items-center gap-3">
              <img src={logoKlein} alt="TTV 97 Kamenz Logo" className="w-10 h-10 rounded-lg object-cover shrink-0" />
              <div>
                <p className="text-white text-sm font-bold leading-tight" style={{ fontFamily: "Oswald, sans-serif" }}>TTV 97 KAMENZ</p>
                <p className="text-[10px] uppercase tracking-widest" style={{ color: COLORS.orange }}>
                  {eigeneMannschaft?.name ?? "e. V."}
                </p>
              </div>
            </div>
          )}
        </div>
        <nav className="p-3 space-y-1 flex-1 overflow-y-auto">
          {nav.map((n) => (
            <button
              key={n.key}
              onClick={() => { setTab(n.key); setNavOpen(false); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition"
              style={tab === n.key ? { background: COLORS.orange, color: "white", fontWeight: 600 } : { color: "rgba(255,255,255,0.75)" }}
            >
              <n.icon size={16} />
              {n.label}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t shrink-0" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
          <button onClick={abmelden} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>
            <LogOut size={16} /> Abmelden
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header
          className="flex items-center justify-between px-6 py-4 bg-white border-b sticky top-0 z-10"
          style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}
        >
          <div className="flex items-center gap-3">
            <button className="md:hidden" onClick={() => setNavOpen(!navOpen)}><Menu size={20} /></button>
            <h2 className="text-lg font-bold" style={{ color: COLORS.anthracite, fontFamily: "Oswald, sans-serif" }}>{titles[tab]}</h2>
          </div>
          <div className="flex items-center gap-4">
            <Benachrichtigungen
              profil={profil}
              onOeffneUmfrage={(umfrageId) => { setZielUmfrageId(umfrageId); setTab("umfragen"); }}
              onOeffneNachricht={(spielerId) => { setZielSpielerId(spielerId); setTab("nachrichten"); }}
              onOeffneKalender={() => setTab("kalender")}
              onOeffneSpieler={() => setTab("spieler")}
            />
            <button onClick={() => setTab("einstellungen")} title="Mein Profil">
              <Avatar person={profil} groesse={32} />
            </button>
          </div>
        </header>
        <main className="p-6 overflow-y-auto flex-1">
          {tab === "einstellungen" ? (
            <Einstellungen profil={profil} onProfilGeaendert={setProfil} />
          ) : tab === "umfragen" ? (
            <Umfragen profil={profil} zielUmfrageId={zielUmfrageId} />
          ) : tab === "nachrichten" ? (
            <Nachrichten profil={profil} zielSpielerId={zielSpielerId} />
          ) : tab === "turniere" ? (
            <Turniere profil={profil} />
          ) : tab === "mannschaften" ? (
            (profil.ist_admin || istTeamLeiter(profil)) && <Mannschaftsverwaltung profil={profil} saisons={saisons} onSaisonsGeaendert={setSaisons} />
          ) : tab === "spieler" ? (
            (profil.ist_admin || istTeamLeiter(profil)) && <Spielerverwaltung profil={profil} />
          ) : !saisonsGeladen ? (
            <Leerzustand text="Lade Saison…" />
          ) : tab === "dashboard" && !aktiveSaison ? (
            <div className="bg-white rounded-lg border p-6 text-sm text-gray-500 max-w-md">
              Es ist noch keine aktive Saison hinterlegt.{" "}
              {profil.ist_admin ? "Lege in den Einstellungen eine an." : "Bitte den Admin kontaktieren."}
            </div>
          ) : (
            <>
              {tab === "dashboard" && (
                <Dashboard
                  saison={aktiveSaison}
                  profil={profil}
                  onOeffneUmfrage={(umfrageId) => {
                    setZielUmfrageId(umfrageId);
                    setTab("umfragen");
                  }}
                  onOeffneNachricht={(spielerId) => {
                    setZielSpielerId(spielerId);
                    setTab("nachrichten");
                  }}
                />
              )}

              {mannschaftsAbhaengigeTabs.includes(tab) && mannschaften.length > 1 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {mannschaften.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setAusgewaehlteMannschaftId(m.id)}
                      className="px-4 py-1.5 rounded-full text-sm font-semibold transition"
                      style={
                        effektiveMannschaftId === m.id
                          ? { background: COLORS.orange, color: "white" }
                          : { background: "#fff", color: COLORS.anthracite, border: "1px solid #ddd" }
                      }
                    >
                      {m.name}{m.id === profil.mannschaft_id ? " (eigene)" : ""}
                    </button>
                  ))}
                </div>
              )}

              {mannschaftsAbhaengigeTabs.includes(tab) && !angezeigteSaison ? (
                <div className="bg-white rounded-lg border p-6 text-sm text-gray-500 max-w-md">
                  Für diese Mannschaft ist noch keine aktive Saison hinterlegt.{" "}
                  {profil.ist_admin ? "Lege in den Einstellungen eine an." : "Bitte den Admin kontaktieren."}
                </div>
              ) : (
                <>
                  {tab === "tabelle" && <Tabelle saison={angezeigteSaison} profil={profil} />}
                  {tab === "ergebnisse" && <Ergebnisse saison={angezeigteSaison} profil={profil} />}
                  {tab === "planung" && <Spielerplanung saison={angezeigteSaison} profil={profil} />}
                  {tab === "kader" && <Kader saison={angezeigteSaison} profil={profil} />}
                </>
              )}

              {tab === "kalender" && <Kalender profil={profil} />}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
