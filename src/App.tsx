import React, { useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";
import logo from "./logo.jpg";
import logoKlein from "./logo-klein.png";
import {
  LayoutDashboard, Table2, CalendarDays, Users, MessageSquare,
  Settings, Bell, ChevronRight, Check, X, HelpCircle, Cake,
  Trophy, AlertTriangle, Vote, GraduationCap, Menu, LogOut, ShieldCheck, Award,
  UserPlus, KeyRound, Eye, EyeOff, Plus, Pencil, Trash2, CalendarPlus, Send, ArrowLeft, Shield, Sparkles
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
const supabase = createClient(
  "https://oskplsznrhpcfvoogcup.supabase.co",
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

function formatDatum(iso) {
  if (!iso) return "–";
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
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

function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [passwort, setPasswort] = useState("");
  const [zeigen, setZeigen] = useState(false);
  const [fehler, setFehler] = useState(null);
  const [ladend, setLadend] = useState(false);

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
            <h1 className="text-xl font-bold text-center" style={{ color: COLORS.petrolDark, fontFamily: "Oswald, sans-serif" }}>
              TTV 97 KAMENZ e.V.
            </h1>
          </div>
          <label className="block text-xs font-medium mb-1" style={{ color: COLORS.anthracite }}>E-Mail</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border rounded-md px-3 py-2 mb-4 text-sm"
            placeholder="vorname.nachname@ttv97-kamenz.de"
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
      icon: LayoutDashboard,
      titel: "Dein Dashboard",
      text: "Hier siehst du auf einen Blick euren Tabellenplatz, das nächste Spiel, offene Umfragen, ungelesene Nachrichten und anstehende Termine.",
    },
    {
      icon: Table2,
      titel: "Tabelle & Ergebnisse",
      text: verwaltet
        ? "Die aktuelle Tabelle und alle Spielergebnisse eurer Liga — automatisch vom Verband geholt. Über \"Jetzt aktualisieren\" holst du dir jederzeit den neuesten Stand. Über die Reiter oben kannst du auch andere Mannschaften des Vereins ansehen."
        : "Die aktuelle Tabelle und alle Spielergebnisse eurer Liga — automatisch vom Verband geholt. Über die Reiter oben kannst du auch die Tabellen der anderen Mannschaften des Vereins ansehen.",
    },
    {
      icon: ShieldCheck,
      titel: "Spielerplanung",
      text: "Sag für jedes Spiel Bescheid, ob du Zeit hast: einfach auf dein Feld tippen, um zwischen offen/zugesagt/abgesagt zu wechseln.",
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
        ? "Bei Umfragen einfach abstimmen — oder als " + (admin ? "Admin" : "Mannschaftsführer") + " selbst welche erstellen. Im Nachrichten-Postfach kannst du dich direkt mit anderen Spielern austauschen."
        : "Bei Umfragen einfach abstimmen. Im Nachrichten-Postfach kannst du dich direkt mit anderen Spielern austauschen.",
    },
  ];

  if (leiter && !admin) {
    schritte.push({
      icon: Shield,
      titel: "Deine Mannschaftsführer-Rechte",
      text: "Als Mannschaftsführer bzw. Stellvertreter hast du zwei zusätzliche Reiter: \"Mannschaften\" (Saison-Links wie Tabelle/Spielplan für eure Mannschaft pflegen) und \"Spieler\" (Spieler eurer Mannschaft anlegen, bearbeiten, Passwort zurücksetzen). Das gilt jeweils nur für deine eigene Mannschaft.",
    });
  }

  if (admin) {
    schritte.push({
      icon: Shield,
      titel: "Deine Admin-Rechte",
      text: "Als Admin hast du vollen Zugriff auf alle Mannschaften: Teams anlegen, Spieler verwalten, Admin-Rechte vergeben, Saison-Links pflegen sowie Umfragen und Termine für alle oder einzelne Mannschaften erstellen — über die Reiter \"Mannschaften\" und \"Spieler\".",
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
        <p className="text-sm text-gray-500 mb-6 leading-relaxed">{aktuell.text}</p>

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
              <p className="text-sm opacity-90 mt-1">{formatDatum(naechstesSpiel.datum)} · {naechstesSpiel.ist_heimspiel ? "Heimspiel" : "Auswärts"}</p>
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

    const { data: neueUmfrage, error } = await supabase
      .from("umfragen")
      .insert({
        titel: `Aushilfe gesucht: ${eintrag.mannschaft.name} braucht Spieler`,
        beschreibung: `Für das Spiel gegen ${gegner} am ${datumText} werden noch Spieler gebraucht. Hast du an dem Tag Zeit auszuhelfen?`,
        optionen: ["Ja, ich kann aushelfen", "Nein, leider nicht"],
        mehrfachauswahl: false,
        erstellt_von: profil.id,
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
                    <button
                      onClick={() => umfrageAnUntereSenden(eintrag, untereMannschaft)}
                      disabled={sendenLadendId === mannschaft.id}
                      className="text-xs mt-2 px-3 py-1.5 rounded-md text-white font-semibold"
                      style={{ background: COLORS.orangeDeep, opacity: sendenLadendId === mannschaft.id ? 0.6 : 1 }}
                    >
                      {sendenLadendId === mannschaft.id ? "Sende…" : `Umfrage an ${untereMannschaft.name} senden`}
                    </button>
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

  async function laden() {
    setLadend(true);
    const { data } = await supabase.from("tabelle").select("*").eq("saison_id", saison.id).order("platz");
    setZeilen(data ?? []);
    setLadend(false);
  }

  useEffect(() => { if (saison) laden(); }, [saison]);

  async function aktualisieren() {
    setFehler(null);
    setAktualisiertLadend(true);
    const { data, error } = await supabase.functions.invoke("fetch-tabelle", { body: { saisonId: saison.id } });
    setAktualisiertLadend(false);
    if (error || data?.error) {
      setFehler(await echteFehlermeldung(error, data));
      return;
    }
    laden();
  }

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
          {aktualisiertAm && <span>Aktualisiert: {new Date(aktualisiertAm).toLocaleString("de-DE")}</span>}
          {darfMannschaftVerwalten(profil, saison.mannschaft_id) && (
            <button
              onClick={aktualisieren}
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
  const [ladend, setLadend] = useState(true);
  const [aktualisiertLadend, setAktualisiertLadend] = useState(false);
  const [fehler, setFehler] = useState(null);

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
    (meldungenDaten ?? []).forEach((m) => { if (map[m.spiel_id]) map[m.spiel_id][m.spieler_id] = m.status; });
    setMeldungen(map);
    if (saison.mannschaft_id) {
      const { data: mannschaft } = await supabase.from("mannschaften").select("benoetigte_spieler").eq("id", saison.mannschaft_id).single();
      setBenoetigteSpieler(mannschaft?.benoetigte_spieler ?? 4);
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
    if (spielerId !== profil.id && !profil.ist_admin) return; // nur eigene Meldung, außer Admin
    const order = { offen: "ja", ja: "nein", nein: "offen" };
    const neuerStatus = order[meldungen[spielId]?.[spielerId] ?? "offen"];

    const aktualisierteMeldungenFuerSpiel = { ...meldungen[spielId], [spielerId]: neuerStatus };
    setMeldungen((prev) => ({ ...prev, [spielId]: aktualisierteMeldungenFuerSpiel }));

    await supabase.from("spielerplanung_meldungen").upsert(
      { saison_id: saison.id, spiel_id: spielId, spieler_id: spielerId, status: neuerStatus, aktualisiert_am: new Date().toISOString() },
      { onConflict: "spiel_id,spieler_id" }
    );

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
      {fehler && <p className="text-xs" style={{ color: COLORS.orangeDeep }}>{fehler}</p>}

      {spiele.length === 0 ? (
        <Leerzustand text={`Noch keine Spiele für die ${runde} hinterlegt.`} />
      ) : (
        <>
          <div className="bg-white rounded-lg border overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr style={{ background: COLORS.petrolDark }} className="text-white">
                  <th className="p-3 text-left font-medium sticky left-0" style={{ background: COLORS.petrolDark }}>Spieler</th>
                  {spiele.map((s) => (
                    <th key={s.id} className="p-3 text-center font-medium min-w-[110px]">
                      <div>{formatDatum(s.datum)}</div>
                      <div className="text-[11px] font-normal opacity-80">{s.ist_heimspiel ? s.gastteam : s.heimteam}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {spieler.map((sp) => (
                  <tr key={sp.id} className="border-t">
                    <td className="p-3 font-medium sticky left-0 bg-white">{sp.vorname} {sp.nachname}</td>
                    {spiele.map((s) => {
                      const status = meldungen[s.id]?.[sp.id] ?? "offen";
                      const eigeneZeile = sp.id === profil.id || profil.ist_admin;
                      const style =
                        status === "ja"
                          ? { background: "#DDF0EA", color: COLORS.petrol }
                          : status === "nein"
                          ? { background: "#FBE2DA", color: COLORS.orangeDeep }
                          : { background: "#F1F1EF", color: "#999" };
                      return (
                        <td key={s.id} className="p-2 text-center">
                          <button
                            onClick={() => toggle(s.id, sp.id)}
                            disabled={!eigeneZeile}
                            className="w-full py-1.5 rounded-md text-xs font-semibold flex items-center justify-center gap-1"
                            style={{ ...style, opacity: eigeneZeile ? 1 : 0.7, cursor: eigeneZeile ? "pointer" : "default" }}
                          >
                            {status === "ja" && <Check size={13} />}
                            {status === "nein" && <X size={13} />}
                            {status === "offen" && <HelpCircle size={13} />}
                            {status === "ja" ? "Kann" : status === "nein" ? "Kann nicht" : "Offen"}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t">
                  <td className="p-3 text-xs font-semibold text-gray-500 sticky left-0 bg-white">Zusagen</td>
                  {spiele.map((s) => {
                    const ja = countJa(s.id);
                    const kritisch = ja < benoetigteSpieler;
                    return (
                      <td key={s.id} className="p-2 text-center">
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
              <span>
                Mindestens ein Spiel hat aktuell weniger als {benoetigteSpieler} Zusagen (benötigte Spieleranzahl für diese Liga). Alle Spieler wurden bzw. werden per E-Mail informiert.
              </span>
            </div>
          )}
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

  async function laden() {
    setLadend(true);
    const { data } = await supabase.from("verbands_spiele").select("*").eq("saison_id", saison.id).eq("runde", runde).order("datum");
    setSpiele(data ?? []);
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
                  <p className="text-xs text-gray-400">{formatDatum(s.datum)} · {s.ist_heimspiel ? "Heimspiel" : "Auswärts"}</p>
                </div>
                <span className="text-sm font-bold px-3 py-1.5 rounded-md shrink-0" style={tonFarben[info.ton]}>
                  {info.text}
                </span>
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
  const inhalt = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TTV 97 Kamenz//3. Mannschaft//DE",
    "BEGIN:VEVENT",
    `UID:${e.id}@ttv97-kamenz`,
    `DTSTAMP:${zuIcsDatum(new Date().toISOString())}`,
    `DTSTART:${zuIcsDatum(e.datum)}`,
    `DTEND:${zuIcsDatum(ereignisEndeOderPlusEineStunde(e))}`,
    `SUMMARY:${e.titel.replace(/\n/g, " ")}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  const blob = new Blob([inhalt], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${e.titel.replace(/[^\w äöüÄÖÜß-]/g, "")}.ics`;
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
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
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
              <input type="date" value={form.datum} onChange={(e) => setForm({ ...form, datum: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" />
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
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold shrink-0"
                style={{ background: COLORS.petrol, fontFamily: "Oswald, sans-serif" }}
              >
                {s.vorname?.[0]}{s.nachname?.[0]}
              </div>
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

function zugangsNachrichtText(vorname, email, passwort) {
  return `Hallo ${vorname},

dein Zugang zur TTV 97 Kamenz App ist bereit:

E-Mail: ${email}
Einmalpasswort: ${passwort}

Anmelden hier: ${APP_URL}
Beim ersten Login wirst du gebeten, dir ein eigenes Passwort zu vergeben.

Tipp: Du kannst dir die App wie eine normale App aufs Handy legen:
– iPhone: Seite in Safari öffnen → Teilen-Symbol → "Zum Home-Bildschirm"
– Android: Seite in Chrome öffnen → Menü (⋮) → "Zum Startbildschirm hinzufügen"

Sportliche Grüße
TTV 97 Kamenz e.V.`;
}

function ZugangsNachricht({ vorname, email, passwort }) {
  const [kopiert, setKopiert] = useState(false);
  const text = zugangsNachrichtText(vorname, email, passwort);

  function kopieren() {
    navigator.clipboard?.writeText(text);
    setKopiert(true);
    setTimeout(() => setKopiert(false), 2000);
  }

  return (
    <div className="mt-4 p-3 rounded-md text-sm" style={{ background: "#DDF0EA", color: COLORS.petrol }}>
      <p className="mb-2">
        Einmalpasswort: <strong className="font-mono">{passwort}</strong>
      </p>
      <textarea readOnly value={text} rows={8} className="w-full border rounded-md px-2 py-2 text-xs font-mono bg-white text-gray-700" />
      <div className="flex gap-2 mt-2">
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
      mannschaftId: s.mannschaft_id ?? "",
      istAdmin: s.ist_admin ?? false,
    });
  }

  async function spielerBearbeitenSpeichern() {
    setSpielerBearbeitenFehler(null);
    setSpielerBearbeitenLadend(true);
    const { data, error } = await supabase.functions.invoke("update-spieler", {
      body: { spielerId: bearbeiteSpielerId, ...bearbeiteSpielerForm },
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
      setFehler(await echteFehlermeldung(error, data));
      return;
    }
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
      return setFehler("Bitte alle Pflichtfelder ausfüllen (Vorname, Nachname, E-Mail, Mannschaft).");
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
        mannschaftId: form.mannschaftId,
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
          <input placeholder="Vorname" value={form.vorname} onChange={(e) => setForm({ ...form, vorname: e.target.value })} className="border rounded-md px-3 py-2 text-sm" />
          <input placeholder="Nachname" value={form.nachname} onChange={(e) => setForm({ ...form, nachname: e.target.value })} className="border rounded-md px-3 py-2 text-sm" />
          <div>
            <label className="block text-xs text-gray-400 mb-1">Geburtsdatum</label>
            <input type="date" value={form.geburtstag} onChange={(e) => setForm({ ...form, geburtstag: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <input placeholder="E-Mail" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="border rounded-md px-3 py-2 text-sm" />
          <input placeholder="Handynummer (optional)" value={form.telefonHandy} onChange={(e) => setForm({ ...form, telefonHandy: e.target.value })} className="border rounded-md px-3 py-2 text-sm" />
          <input placeholder="Festnetznummer (optional)" value={form.telefonFestnetz} onChange={(e) => setForm({ ...form, telefonFestnetz: e.target.value })} className="border rounded-md px-3 py-2 text-sm" />
          <select value={form.rang} onChange={(e) => setForm({ ...form, rang: e.target.value })} className="border rounded-md px-3 py-2 text-sm">
            <option>Mannschaftsführer</option>
            <option>stellv. Mannschaftsführer</option>
            <option>Spieler</option>
            <option>Ersatz</option>
          </select>
          <select value={form.mannschaftId} onChange={(e) => setForm({ ...form, mannschaftId: e.target.value })} className="border rounded-md px-3 py-2 text-sm">
            <option value="">Mannschaft wählen…</option>
            {sichtbareMannschaften.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <p className="text-xs text-gray-400 mb-3">Hinweis: Ob Telefonnummer und E-Mail für andere Spieler sichtbar sind, entscheidet jeder Spieler selbst in seinen Einstellungen.</p>
        {fehler && <p className="text-xs mb-3" style={{ color: COLORS.orangeDeep }}>{fehler}</p>}
        <button onClick={spielerAnlegen} disabled={ladend} className="px-4 py-2 rounded-md text-white text-sm font-semibold" style={{ background: COLORS.orange, opacity: ladend ? 0.6 : 1 }}>
          {ladend ? "Lege an…" : "Spieler anlegen"}
        </button>

        {einmalpasswort && erstellterSpieler && <ZugangsNachricht vorname={erstellterSpieler.vorname} email={erstellterSpieler.email} passwort={einmalpasswort} />}
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
        <div className="divide-y">
          {gefilterteSpieler.map((s) => {
            if (bearbeiteSpielerId === s.id) {
              return (
                <div key={s.id} className="py-3 space-y-2">
                  <div className="grid sm:grid-cols-2 gap-2">
                    <input value={bearbeiteSpielerForm.vorname} onChange={(e) => setBearbeiteSpielerForm({ ...bearbeiteSpielerForm, vorname: e.target.value })} placeholder="Vorname" className="border rounded-md px-3 py-2 text-sm" />
                    <input value={bearbeiteSpielerForm.nachname} onChange={(e) => setBearbeiteSpielerForm({ ...bearbeiteSpielerForm, nachname: e.target.value })} placeholder="Nachname" className="border rounded-md px-3 py-2 text-sm" />
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Geburtsdatum</label>
                      <input type="date" value={bearbeiteSpielerForm.geburtstag} onChange={(e) => setBearbeiteSpielerForm({ ...bearbeiteSpielerForm, geburtstag: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" />
                    </div>
                    <input value={bearbeiteSpielerForm.email} onChange={(e) => setBearbeiteSpielerForm({ ...bearbeiteSpielerForm, email: e.target.value })} placeholder="E-Mail" className="border rounded-md px-3 py-2 text-sm" />
                    <select value={bearbeiteSpielerForm.rang} onChange={(e) => setBearbeiteSpielerForm({ ...bearbeiteSpielerForm, rang: e.target.value })} className="border rounded-md px-3 py-2 text-sm">
                      <option>Mannschaftsführer</option>
                      <option>stellv. Mannschaftsführer</option>
                      <option>Spieler</option>
                      <option>Ersatz</option>
                    </select>
                    <select value={bearbeiteSpielerForm.mannschaftId} onChange={(e) => setBearbeiteSpielerForm({ ...bearbeiteSpielerForm, mannschaftId: e.target.value })} className="border rounded-md px-3 py-2 text-sm">
                      <option value="">Mannschaft wählen…</option>
                      {sichtbareMannschaften.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
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
                  <div>
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
                {zurueckgesetztFuerId === s.id && <ZugangsNachricht vorname={s.vorname} email={s.email} passwort={zurueckgesetztesPasswort} />}
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
      body: { titel: form.titel.trim(), empfaengerIds },
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
            />
          );
        })
      )}
    </div>
  );
}

function UmfrageKarte({ umfrage, antworten, zielAnzahl, profil, spielerListe, hervorgehoben, onAbstimmen, onBeenden, onLoeschen }) {
  const eigeneAntwort = antworten.find((a) => a.spieler_id === profil.id);
  const [auswahl, setAuswahl] = useState(eigeneAntwort?.ausgewaehlte_optionen ?? []);
  const [adminWillAbstimmen, setAdminWillAbstimmen] = useState(false);
  const [loeschenBestaetigen, setLoeschenBestaetigen] = useState(false);

  const zeitAbgelaufen = Boolean(umfrage.endet_am) && new Date(umfrage.endet_am) <= new Date();
  const alleAbgestimmt = zielAnzahl > 0 && antworten.length >= zielAnzahl;
  const istBeendet = zeitAbgelaufen || alleAbgestimmt;

  const zeigeErgebnis = istBeendet || Boolean(eigeneAntwort) || (profil.ist_admin && !adminWillAbstimmen);

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

      {umfrage.anonym && (
        <p className="text-xs mb-2 flex items-center gap-1" style={{ color: "#999" }}>
          <HelpCircle size={12} /> Anonyme Umfrage — niemand sieht, wer wie abgestimmt hat.
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
              </div>
            );
          })}
          <p className="text-xs text-gray-400 pt-1">
            {gesamtStimmen} Stimme(n) insgesamt{!eigeneAntwort && !istBeendet && profil.ist_admin ? " · du hast noch nicht abgestimmt" : ""}
          </p>
          {profil.ist_admin && !eigeneAntwort && !istBeendet && (
            <button onClick={() => setAdminWillAbstimmen(true)} className="text-xs underline" style={{ color: COLORS.petrol }}>
              Trotzdem abstimmen
            </button>
          )}
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
  const [nachrichten, setNachrichten] = useState([]);
  const [ladend, setLadend] = useState(true);
  const [partnerId, setPartnerId] = useState(zielSpielerId ?? null);
  const [entwurf, setEntwurf] = useState("");
  const [sendenLadend, setSendenLadend] = useState(false);

  async function laden() {
    setLadend(true);
    const [{ data: spielerDaten }, { data: nachrichtenDaten }] = await Promise.all([
      supabase.from("profiles").select("id, vorname, nachname").neq("id", profil.id).order("nachname"),
      supabase.from("nachrichten").select("*").or(`von_id.eq.${profil.id},an_id.eq.${profil.id}`).order("gesendet_am"),
    ]);
    setSpielerListe(spielerDaten ?? []);
    setNachrichten(nachrichtenDaten ?? []);
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

  // Übersicht aller Spieler / Unterhaltungen
  return (
    <div className="bg-white rounded-lg border divide-y max-w-xl">
      {sortiertNachAktivitaet.map((s) => {
        const verlauf = konversationMit(s.id);
        const letzte = verlauf.at(-1);
        const ungelesen = ungeleseneVon(s.id);
        return (
          <button
            key={s.id}
            onClick={() => setPartnerId(s.id)}
            className="w-full flex items-center gap-3 p-4 text-left hover:bg-gray-50"
          >
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold shrink-0"
              style={{ background: COLORS.petrol, fontFamily: "Oswald, sans-serif" }}
            >
              {s.vorname?.[0]}{s.nachname?.[0]}
            </div>
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
      })}
      {spielerListe.length === 0 && <Leerzustand text="Keine anderen Spieler vorhanden." />}
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

      <PasswortAendern profil={profil} />

      {profil.ist_admin && <AenderungshinweisVerwaltung />}
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
    saetzeProSpiel: 5, poolA: [], poolB: [], mitUmfrage: true, mitKalender: true,
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
    setForm({ titel: "", beschreibung: "", datum: "", typ: "einzel", system: "schweizer_system", saetzeProSpiel: 5, poolA: [], poolB: [], mitUmfrage: true, mitKalender: true });
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
                <input type="date" value={form.datum} onChange={(e) => setForm({ ...form, datum: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" />
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
                  <option value={3}>Best of 3</option>
                  <option value={5}>Best of 5</option>
                  <option value={7}>Best of 7</option>
                </select>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.mitUmfrage} onChange={(e) => setForm({ ...form, mitUmfrage: e.target.checked })} />
                Umfrage zur Anmeldung erstellen (an alle Spieler)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.mitKalender} onChange={(e) => setForm({ ...form, mitKalender: e.target.checked })} disabled={!form.datum} />
                Termin in den Kalender eintragen {!form.datum && <span className="text-xs text-gray-400">(braucht ein Datum)</span>}
              </label>

              {fehler && <p className="text-xs" style={{ color: COLORS.orangeDeep }}>{fehler}</p>}
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
      }
    }
    if (spieleNeu.length > 0) await supabase.from("turnier_spiele").insert(spieleNeu);

    await supabase.from("turniere").update({ status: "laufend", aktuelle_runde: 1 }).eq("id", turnierId);
    setAktionLadend(false);
    laden();
  }

  async function alleRundenturnierPaarungenErstellen() {
    const teilnehmerListe = teilnehmerIds.map((id) => ({ id }));
    const spieleNeu = [];
    for (let i = 0; i < teilnehmerListe.length; i++) {
      for (let j = i + 1; j < teilnehmerListe.length; j++) {
        spieleNeu.push({ turnier_id: turnierId, runde: 1, spieler_a_id: teilnehmerListe[i].id, spieler_b_id: teilnehmerListe[j].id });
      }
    }
    if (spieleNeu.length === 0) return;
    setAktionLadend(true);
    await supabase.from("turnier_spiele").insert(spieleNeu);
    await supabase.from("turniere").update({ status: "laufend", aktuelle_runde: 1 }).eq("id", turnierId);
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
    <div className="space-y-4 max-w-2xl">
      <button onClick={onZurueck} className="text-xs flex items-center gap-1" style={{ color: COLORS.petrol }}>
        <ArrowLeft size={14} /> Zurück zu allen Turnieren
      </button>

      <div className="bg-white rounded-lg border p-5">
        <h2 className="font-bold text-lg" style={{ color: COLORS.anthracite, fontFamily: "Oswald, sans-serif" }}>{turnier.titel}</h2>
        {turnier.beschreibung && <p className="text-sm text-gray-500 mt-1">{turnier.beschreibung}</p>}
        <p className="text-xs text-gray-400 mt-2">
          {istDoppel ? "Doppel" : turnier.system === "schweizer_system" ? "Einzel · Schweizer System" : "Einzel · Jeder gegen Jeden"}
          {turnier.datum ? ` · ${formatDatum(turnier.datum)}` : ""} · Best of {turnier.saetze_pro_spiel}
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
          <div className="flex gap-2">
            <select value={neuerTeilnehmerId} onChange={(e) => setNeuerTeilnehmerId(e.target.value)} className="flex-1 border rounded-md px-3 py-2 text-sm">
              <option value="">Spieler manuell hinzufügen…</option>
              {nichtTeilnehmer.map((s) => <option key={s.id} value={s.id}>{s.vorname} {s.nachname}</option>)}
            </select>
            <button onClick={teilnehmerHinzufuegen} className="px-3 py-2 rounded-md text-white text-sm font-semibold" style={{ background: COLORS.petrol }}>+</button>
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

      {spiele.length > 0 && (
        <div className="space-y-4">
          {rundenNummern.map((runde) => (
            <div key={runde} className="bg-white rounded-lg border p-5">
              <SectionLabel icon={ShieldCheck}>{istDoppel ? "Spiele" : `Runde ${runde}`}</SectionLabel>
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
        <div className="bg-white rounded-lg border p-5 overflow-x-auto">
          <SectionLabel icon={Trophy}>Tabelle</SectionLabel>
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
  );
}

function SpielZeile({ spiel, nameA, nameB, saetzeProSpiel, darf, onSpeichern }) {
  const [bearbeiten, setBearbeiten] = useState(false);
  const [saetze, setSaetze] = useState([{ a: "", b: "" }]);

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
          {darf && <button onClick={() => { setSaetze(spiel.saetze?.length ? spiel.saetze : [{ a: "", b: "" }]); setBearbeiten(true); }} className="text-gray-400 hover:text-gray-600"><Pencil size={14} /></button>}
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

  return (
    <div className="py-3">
      <p className="text-sm mb-2">{nameA} <span className="text-gray-400">vs</span> {nameB}</p>
      <div className="space-y-2">
        {saetze.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-xs text-gray-400 w-12">Satz {i + 1}</span>
            <input type="number" min={0} value={s.a} onChange={(e) => setSaetze(saetze.map((x, j) => j === i ? { ...x, a: e.target.value } : x))} className="w-16 border rounded-md px-2 py-1 text-sm text-center" />
            <span className="text-gray-400">:</span>
            <input type="number" min={0} value={s.b} onChange={(e) => setSaetze(saetze.map((x, j) => j === i ? { ...x, b: e.target.value } : x))} className="w-16 border rounded-md px-2 py-1 text-sm text-center" />
            {saetze.length > 1 && <button onClick={() => setSaetze(saetze.filter((_, j) => j !== i))} className="text-gray-300"><X size={14} /></button>}
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-2">
        {saetze.length < saetzeProSpiel && (
          <button onClick={() => setSaetze([...saetze, { a: "", b: "" }])} className="text-xs underline" style={{ color: COLORS.petrol }}>+ Satz</button>
        )}
        <button
          onClick={() => {
            const gueltig = saetze.filter((s) => s.a !== "" && s.b !== "");
            if (gueltig.length === 0) return;
            onSpeichern(gueltig);
            setBearbeiten(false);
          }}
          className="text-xs px-3 py-1 rounded-md text-white font-semibold ml-auto"
          style={{ background: COLORS.orange }}
        >
          Ergebnis speichern
        </button>
        {bearbeiten && <button onClick={() => setBearbeiten(false)} className="text-xs px-3 py-1 rounded-md border">Abbrechen</button>}
      </div>
      <p className="text-[11px] text-gray-400 mt-1">Wer zuerst {mehrheit} Sätze gewinnt, gewinnt das Spiel.</p>
    </div>
  );
}

/* ---------- App-Shell ---------- */

const NAV_BASIS = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "tabelle", label: "Tabelle", icon: Table2 },
  { key: "ergebnisse", label: "Ergebnisse", icon: Trophy },
  { key: "turniere", label: "Turniere", icon: Award },
  { key: "planung", label: "Spielerplanung", icon: ShieldCheck },
  { key: "kalender", label: "Kalender", icon: CalendarDays },
  { key: "kader", label: "Kader", icon: Users },
  { key: "umfragen", label: "Umfragen", icon: Vote },
  { key: "nachrichten", label: "Nachrichten", icon: MessageSquare },
  { key: "einstellungen", label: "Einstellungen", icon: Settings },
];

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
    turniere: "Turniere",
    planung: "Spielerplanung",
    kalender: "Ereigniskalender",
    kader: "Kader",
    umfragen: "Umfragen",
    nachrichten: "Nachrichten",
    einstellungen: "Einstellungen",
    mannschaften: "Mannschaften",
    spieler: "Spieler",
  };

  const initialen = `${profil.vorname?.[0] ?? ""}${profil.nachname?.[0] ?? ""}`.toUpperCase();
  const aktiveSaison = saisons.find((s) => s.aktiv && s.mannschaft_id === profil.mannschaft_id) ?? null;
  const mannschaftsAbhaengigeTabs = ["tabelle", "ergebnisse", "planung", "kader"];
  const effektiveMannschaftId = mannschaftsAbhaengigeTabs.includes(tab) ? (ausgewaehlteMannschaftId ?? profil.mannschaft_id) : profil.mannschaft_id;
  const angezeigteSaison = saisons.find((s) => s.aktiv && s.mannschaft_id === effektiveMannschaftId) ?? null;

  return (
    <div className="min-h-screen flex" style={{ background: COLORS.paper, fontFamily: "Inter, sans-serif" }}>
      <AenderungsPopup profil={profil} />
      <aside
        className={`fixed md:static z-20 h-full md:h-auto w-64 transition-transform ${navOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}
        style={{ background: COLORS.petrolDark }}
      >
        <div className="p-5 flex items-center gap-3 border-b" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
          <img src={logoKlein} alt="TTV 97 Kamenz Logo" className="w-10 h-10 rounded-full object-cover shrink-0 bg-white p-1" style={{ border: `2px solid ${COLORS.orange}` }} />
          <div>
            <p className="text-white text-sm font-bold leading-tight" style={{ fontFamily: "Oswald, sans-serif" }}>TTV 97 KAMENZ</p>
            <p className="text-[10px] uppercase tracking-widest" style={{ color: COLORS.orange }}>
              {mannschaften.find((m) => m.id === profil.mannschaft_id)?.name ?? "e. V."}
            </p>
          </div>
        </div>
        <nav className="p-3 space-y-1">
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
        <div className="absolute bottom-0 w-full p-3 border-t" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
          <button onClick={abmelden} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>
            <LogOut size={16} /> Abmelden
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center justify-between px-6 py-4 bg-white border-b">
          <div className="flex items-center gap-3">
            <button className="md:hidden" onClick={() => setNavOpen(!navOpen)}><Menu size={20} /></button>
            <h2 className="text-lg font-bold" style={{ color: COLORS.anthracite, fontFamily: "Oswald, sans-serif" }}>{titles[tab]}</h2>
          </div>
          <div className="flex items-center gap-4">
            <Bell size={18} className="text-gray-400" />
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: COLORS.petrol }}>{initialen}</div>
          </div>
        </header>
        <main className="p-6 overflow-y-auto">
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
