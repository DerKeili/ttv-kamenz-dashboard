import React, { useState, useMemo, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  LayoutDashboard, Table2, CalendarDays, Users, MessageSquare,
  Settings, Bell, ChevronRight, Check, X, HelpCircle, Cake,
  Trophy, AlertTriangle, Vote, GraduationCap, Menu, LogOut, ShieldCheck,
  UserPlus, KeyRound, Eye, EyeOff
} from "lucide-react";

/* ------------------------------------------------------------------
   TTV 97 Kamenz e.V. — Die 3. Mannschaft
   Mit echter Supabase-Anbindung für Auth/Spieler.
   Hinweis: läuft nur in einem echten React-Build (npm install @supabase/supabase-js),
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

/* ---------- Testdaten ---------- */

const SPIELER = [
  { id: 1, vorname: "Thomas", nachname: "Keilig", rang: "Mannschaftsführer", geburtstag: "1988-07-12" },
  { id: 2, vorname: "Peter", nachname: "Schulz", rang: "stellv. Mannschaftsführer", geburtstag: "1990-11-03" },
  { id: 3, vorname: "Oliver", nachname: "Seifert", rang: "Spieler", geburtstag: "1985-09-21" },
  { id: 4, vorname: "Marco", nachname: "Wagner", rang: "Spieler", geburtstag: "1993-07-30" },
  { id: 5, vorname: "Jens", nachname: "Neumann", rang: "Spieler", geburtstag: "1979-02-14" },
  { id: 6, vorname: "Felix", nachname: "Bartel", rang: "Ersatz", geburtstag: "1996-12-05" },
];

const SPIELE = [
  { id: 1, runde: "Hinrunde", datum: "2026-09-06", gegner: "TTV Bautzen II", heim: true },
  { id: 2, runde: "Hinrunde", datum: "2026-09-20", gegner: "SV Radeberg", heim: false },
  { id: 3, runde: "Hinrunde", datum: "2026-10-04", gegner: "TTC Hoyerswerda III", heim: true },
  { id: 4, runde: "Hinrunde", datum: "2026-10-18", gegner: "TSV Königsbrück", heim: false },
  { id: 5, runde: "Rückrunde", datum: "2027-02-07", gegner: "TTV Bautzen II", heim: false },
  { id: 6, runde: "Rückrunde", datum: "2027-02-21", gegner: "SV Radeberg", heim: true },
  { id: 7, runde: "Rückrunde", datum: "2027-03-07", gegner: "TTC Hoyerswerda III", heim: false },
];

// Meldestatus: "ja" | "nein" | "offen"
const initialMeldungen = {
  1: { 1: "ja", 2: "ja", 3: "nein", 4: "ja", 5: "offen", 6: "offen" },
  2: { 1: "ja", 2: "ja", 3: "ja", 4: "offen", 5: "offen", 6: "offen" },
  3: { 1: "ja", 2: "nein", 3: "nein", 4: "nein", 5: "offen", 6: "ja" },
  4: { 1: "ja", 2: "ja", 3: "ja", 4: "ja", 5: "offen", 6: "offen" },
  5: { 1: "offen", 2: "offen", 3: "offen", 4: "offen", 5: "offen", 6: "offen" },
  6: { 1: "offen", 2: "offen", 3: "offen", 4: "offen", 5: "offen", 6: "offen" },
  7: { 1: "offen", 2: "offen", 3: "offen", 4: "offen", 5: "offen", 6: "offen" },
};

// Testdaten im Format, wie es später die Edge Function aus tischtennislive.de befüllt
const TABELLE = [
  { platz: 1, team: "SG Lückersdorf-Gel. 5", sp: 0, punkte: 0 },
  { platz: 2, team: "SV Grün-Weiß Elstra 3", sp: 0, punkte: 0 },
  { platz: 3, team: "SV Laußnitz 3", sp: 0, punkte: 0 },
  { platz: 4, team: "TuS Gersd.-Möhrsdorf 5", sp: 0, punkte: 0 },
  { platz: 5, team: "TuS Gersd.-Möhrsdorf 6", sp: 0, punkte: 0 },
  { platz: 6, team: "SV Lokomotive Kamenz 2", sp: 0, punkte: 0 },
  { platz: 7, team: "SG Wiesa 2", sp: 0, punkte: 0 },
  { platz: 8, team: "TTV 97 Kamenz 3", sp: 0, punkte: 0, eigen: true },
  { platz: 9, team: "SG Lückersdorf-Gel. 6", sp: 0, punkte: 0 },
  { platz: 10, team: "SV Laußnitz 4", sp: 0, punkte: 0 },
];

const SAISONS = [
  {
    id: 1,
    bezeichnung: "2026/2027",
    aktiv: true,
    tabellenUrl: "https://bautzen.tischtennislive.de/default.aspx?L1=Ergebnisse&L2=TTStaffeln&L2P=21540",
    mannschaftUrl: "https://bautzen.tischtennislive.de/?L1=Ergebnisse&L2=TTStaffeln&L2P=21540&L3=Mannschaften&L3P=137490",
    spielplanHinrundeUrl: "https://bautzen.tischtennislive.de/?L1=Ergebnisse&L2=TTStaffeln&L2P=21540&L3=Spielplan&L3P=1",
    spielplanRueckrundeUrl: "https://bautzen.tischtennislive.de/?L1=Ergebnisse&L2=TTStaffeln&L2P=21540&L3=Spielplan&L3P=2",
    letzteAktualisierung: "2026-08-20T09:14:00",
  },
];

// Vom Verband bereitgestellte Mannschafts-Infos (Stand: Aufstellung noch nicht freigegeben)
const MANNSCHAFT_INFO = {
  mannschaftsfuehrer: "Thomas Keilig",
  vertretung: "Arthur Haase",
  sportstaette: "Turnhalle BSZ Kamenz, Hohe Straße 4, 01917 Kamenz",
  spieltag: "Dienstag, 19:30 Uhr",
  aufstellungFreigegeben: false,
};

const NACHRICHTEN = [
  { id: 1, von: "Peter Schulz", text: "Kann jemand am 20.09. tauschen, ich bin im Urlaub.", gelesen: false },
  { id: 2, von: "Admin", text: "Neue Umfrage: Weihnachtsfeier – Termin abstimmen", gelesen: false, umfrage: true },
];

const KALENDER = [
  { id: 1, datum: "2026-08-15", titel: "Saisoneröffnung / Training", typ: "training" },
  { id: 2, datum: "2026-09-06", titel: "Heimspiel vs. TTV Bautzen II", typ: "spiel" },
  { id: 3, datum: "2026-11-14", titel: "Schiedsrichter-Lehrgang", typ: "lehrgang" },
  { id: 4, datum: "2027-01-10", titel: "Vereinsversammlung", typ: "termin" },
];

/* ---------- Hilfsfunktionen ---------- */

function formatDatum(iso) {
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function naechstesEreignis(liste, dateField = "datum") {
  const heute = new Date("2026-08-20"); // Demo-"heute"
  return liste
    .filter((e) => new Date(e[dateField]) >= heute)
    .sort((a, b) => new Date(a[dateField]) - new Date(b[dateField]))[0];
}

function naechsterGeburtstag() {
  const heute = new Date("2026-08-20");
  const mitTag = SPIELER.map((s) => {
    const gd = new Date(s.geburtstag);
    let next = new Date(heute.getFullYear(), gd.getMonth(), gd.getDate());
    if (next < heute) next = new Date(heute.getFullYear() + 1, gd.getMonth(), gd.getDate());
    return { ...s, next };
  });
  mitTag.sort((a, b) => a.next - b.next);
  return mitTag[0];
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
    // Zugehöriges Spielerprofil laden (Rang, Name, ob Passwort geändert werden muss, ist_admin ...)
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
        <TiltCard tone="paper" className="p-8 shadow-2xl" >
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

/* ---------- Dashboard ---------- */

function Dashboard() {
  const naechstesSpiel = naechstesEreignis(SPIELE);
  const geburtstag = naechsterGeburtstag();
  const ungelesen = NACHRICHTEN.filter((n) => !n.gelesen).length;

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-3 gap-4">
        <TiltCard tone="petrol" className="p-5 text-white">
          <SectionLabel icon={Trophy}>Aktuelle Tabelle</SectionLabel>
          <p className="text-3xl font-bold" style={{ fontFamily: "Oswald, sans-serif" }}>Platz {TABELLE.find(t=>t.eigen).platz}</p>
          <p className="text-sm opacity-80 mt-1">{TABELLE.find(t=>t.eigen).punkte} Punkte aus {TABELLE.find(t=>t.eigen).sp} Spielen</p>
        </TiltCard>

        <TiltCard tone="orange" className="p-5 text-white">
          <SectionLabel icon={CalendarDays}>Nächstes Spiel</SectionLabel>
          <p className="text-lg font-bold" style={{ fontFamily: "Oswald, sans-serif" }}>{naechstesSpiel.gegner}</p>
          <p className="text-sm opacity-90 mt-1">{formatDatum(naechstesSpiel.datum)} · {naechstesSpiel.heim ? "Heimspiel" : "Auswärts"}</p>
        </TiltCard>

        <TiltCard tone="paper" className="p-5 border">
          <SectionLabel icon={Cake}>Nächster Geburtstag</SectionLabel>
          <p className="text-lg font-bold" style={{ color: COLORS.petrolDark, fontFamily: "Oswald, sans-serif" }}>
            {geburtstag.vorname} {geburtstag.nachname}
          </p>
          <p className="text-sm text-gray-500 mt-1">{formatDatum(geburtstag.next.toISOString())}</p>
        </TiltCard>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg border p-5">
          <SectionLabel icon={MessageSquare}>
            Nachrichten {ungelesen > 0 && <span className="ml-1 text-white text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: COLORS.orange }}>{ungelesen} neu</span>}
          </SectionLabel>
          <ul className="space-y-2">
            {NACHRICHTEN.map((n) => (
              <li key={n.id} className="flex items-start gap-2 text-sm">
                {n.umfrage ? <Vote size={14} className="mt-0.5" style={{ color: COLORS.orange }} /> : <MessageSquare size={14} className="mt-0.5 text-gray-400" />}
                <span className={n.gelesen ? "text-gray-500" : "font-medium text-gray-800"}>
                  <strong>{n.von}:</strong> {n.text}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-white rounded-lg border p-5">
          <SectionLabel icon={CalendarDays}>Anstehende Termine</SectionLabel>
          <ul className="space-y-2">
            {KALENDER.slice(0, 4).map((e) => (
              <li key={e.id} className="flex items-center justify-between text-sm">
                <span className="text-gray-700">{e.titel}</span>
                <span className="text-xs text-gray-400">{formatDatum(e.datum)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/* ---------- Tabelle ---------- */

function Tabelle() {
  const saison = SAISONS.find((s) => s.aktiv);
  const [aktualisiert, setAktualisiert] = useState(saison.letzteAktualisierung);
  const [loading, setLoading] = useState(false);

  function refresh() {
    setLoading(true);
    // Später: ruft die Supabase Edge Function "fetch-tabelle" auf,
    // die die Saison-URL serverseitig ausliest und die Tabelle neu schreibt.
    setTimeout(() => {
      setAktualisiert(new Date().toISOString());
      setLoading(false);
    }, 900);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>
          Quelle:{" "}
          <a href={saison.tabellenUrl} target="_blank" rel="noreferrer" className="underline" style={{ color: COLORS.petrol }}>
            tischtennislive.de – Kreisfachverband Bautzen
          </a>
        </span>
        <div className="flex items-center gap-3">
          <span>Aktualisiert: {new Date(aktualisiert).toLocaleString("de-DE")}</span>
          <button
            onClick={refresh}
            className="px-3 py-1 rounded-md text-white text-xs font-semibold"
            style={{ background: COLORS.orange, opacity: loading ? 0.6 : 1 }}
            disabled={loading}
          >
            {loading ? "Lädt…" : "Jetzt aktualisieren"}
          </button>
        </div>
      </div>

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
            {TABELLE.map((t) => (
              <tr key={t.platz} className="border-t" style={t.eigen ? { background: "#FCEEE7" } : {}}>
                <td className="p-3">{t.platz}</td>
                <td className="p-3 font-medium" style={t.eigen ? { color: COLORS.orangeDeep } : {}}>{t.team}</td>
                <td className="p-3 text-center">{t.sp}</td>
                <td className="p-3 text-center font-semibold">{t.punkte}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400">
        Saisonstart 2026/27 – aktuell noch 0 Spiele/Punkte laut Liga-Website. Sobald Ergebnisse eingetragen sind, übernimmt die App sie automatisch.
      </p>
    </div>
  );
}

/* ---------- Spielerplanung ---------- */

function Spielerplanung() {
  const [meldungen, setMeldungen] = useState(initialMeldungen);
  const [runde, setRunde] = useState("Hinrunde");

  const spieleRunde = SPIELE.filter((s) => s.runde === runde);

  function toggle(spielId, spielerId) {
    setMeldungen((prev) => {
      const order = { offen: "ja", ja: "nein", nein: "offen" };
      const current = prev[spielId][spielerId];
      return { ...prev, [spielId]: { ...prev[spielId], [spielerId]: order[current] } };
    });
  }

  function countJa(spielId) {
    return Object.values(meldungen[spielId]).filter((v) => v === "ja").length;
  }

  return (
    <div className="space-y-4">
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

      <div className="bg-white rounded-lg border overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr style={{ background: COLORS.petrolDark }} className="text-white">
              <th className="p-3 text-left font-medium sticky left-0" style={{ background: COLORS.petrolDark }}>Spieler</th>
              {spieleRunde.map((s) => (
                <th key={s.id} className="p-3 text-center font-medium min-w-[110px]">
                  <div>{formatDatum(s.datum)}</div>
                  <div className="text-[11px] font-normal opacity-80">{s.gegner}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SPIELER.map((sp) => (
              <tr key={sp.id} className="border-t">
                <td className="p-3 font-medium sticky left-0 bg-white">{sp.vorname} {sp.nachname}</td>
                {spieleRunde.map((s) => {
                  const status = meldungen[s.id][sp.id];
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
                        className="w-full py-1.5 rounded-md text-xs font-semibold flex items-center justify-center gap-1"
                        style={style}
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
              {spieleRunde.map((s) => {
                const ja = countJa(s.id);
                const kritisch = ja < 4;
                return (
                  <td key={s.id} className="p-2 text-center">
                    <div
                      className="mx-auto w-fit px-2 py-1 rounded-md text-xs font-bold flex items-center gap-1"
                      style={kritisch ? { background: COLORS.orange, color: "white" } : { background: "#E4F2EE", color: COLORS.petrol }}
                    >
                      {kritisch && <AlertTriangle size={12} />}
                      {ja}/6 zugesagt
                    </div>
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>

      {spieleRunde.some((s) => countJa(s.id) < 4) && (
        <div className="flex items-start gap-2 p-3 rounded-md text-sm" style={{ background: "#FBE2DA", color: COLORS.orangeDeep }}>
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>
            Mindestens ein Spiel hat aktuell weniger als 4 Zusagen. Sobald das eintritt oder sich ein Status ändert,
            erhalten alle Spieler eine E-Mail — z. B. um rechtzeitig einen Ersatzspieler zu organisieren.
          </span>
        </div>
      )}
    </div>
  );
}

/* ---------- Kalender ---------- */

function Kalender() {
  const iconFor = { training: Users, spiel: Trophy, lehrgang: GraduationCap, termin: CalendarDays };
  return (
    <div className="bg-white rounded-lg border divide-y">
      {KALENDER.map((e) => {
        const Icon = iconFor[e.typ] || CalendarDays;
        return (
          <div key={e.id} className="flex items-center gap-4 p-4">
            <div className="w-10 h-10 rounded-md flex items-center justify-center shrink-0" style={{ background: COLORS.petrolDark }}>
              <Icon size={18} color="white" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-sm" style={{ color: COLORS.anthracite }}>{e.titel}</p>
              <p className="text-xs text-gray-400">{formatDatum(e.datum)}</p>
            </div>
            <ChevronRight size={16} className="text-gray-300" />
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Spieler / Kader ---------- */

function Kader() {
  const saison = SAISONS.find((s) => s.aktiv);
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border p-5">
        <div className="flex items-center justify-between mb-3">
          <SectionLabel icon={Users}>Mannschafts-Infos (Verband)</SectionLabel>
          <a href={saison.mannschaftUrl} target="_blank" rel="noreferrer" className="text-xs underline" style={{ color: COLORS.petrol }}>
            Quelle ansehen
          </a>
        </div>
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <div><span className="text-gray-400 text-xs block">Mannschaftsführer</span>{MANNSCHAFT_INFO.mannschaftsfuehrer}</div>
          <div><span className="text-gray-400 text-xs block">Vertretung</span>{MANNSCHAFT_INFO.vertretung}</div>
          <div><span className="text-gray-400 text-xs block">Sportstätte</span>{MANNSCHAFT_INFO.sportstaette}</div>
          <div><span className="text-gray-400 text-xs block">Spieltag</span>{MANNSCHAFT_INFO.spieltag}</div>
        </div>
        {!MANNSCHAFT_INFO.aufstellungFreigegeben && (
          <div className="flex items-start gap-2 p-3 rounded-md text-sm mt-4" style={{ background: "#F1F1EF", color: "#777" }}>
            <HelpCircle size={16} className="mt-0.5 shrink-0" />
            Der Verband hat die Aufstellungsliste für diese Saison noch nicht freigegeben. Sobald das passiert, übernimmt die App die Spielernamen automatisch von dort — bis dahin gilt die intern gepflegte Liste unten.
          </div>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {SPIELER.map((s) => (
          <div key={s.id} className="bg-white rounded-lg border p-4 flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold shrink-0"
              style={{ background: COLORS.petrol, fontFamily: "Oswald, sans-serif" }}
            >
              {s.vorname[0]}{s.nachname[0]}
            </div>
            <div>
              <p className="font-medium text-sm" style={{ color: COLORS.anthracite }}>{s.vorname} {s.nachname}</p>
              <p className="text-xs" style={{ color: s.rang === "Mannschaftsführer" ? COLORS.orange : "#999" }}>{s.rang}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Passwort ändern (erfordert altes Passwort) ---------- */

function PasswortAendern({ profil }) {
  const [alt, setAlt] = useState("");
  const [neu, setNeu] = useState("");
  const [wiederholung, setWiederholung] = useState("");
  const [status, setStatus] = useState(null); // { art: "fehler"|"erfolg", text }
  const [ladend, setLadend] = useState(false);

  async function speichern() {
    setStatus(null);
    if (neu.length < 8) return setStatus({ art: "fehler", text: "Das neue Passwort muss mindestens 8 Zeichen haben." });
    if (neu !== wiederholung) return setStatus({ art: "fehler", text: "Die beiden neuen Passwörter stimmen nicht überein." });

    setLadend(true);
    // Altes Passwort verifizieren, indem wir uns damit erneut anmelden
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

/* ---------- Spielerverwaltung (nur Admin) ---------- */

function Spielerverwaltung() {
  const [mannschaften, setMannschaften] = useState([]);
  const [spielerListe, setSpielerListe] = useState([]);
  const [form, setForm] = useState({ vorname: "", nachname: "", geburtstag: "", email: "", rang: "Spieler", mannschaftId: "" });
  const [einmalpasswort, setEinmalpasswort] = useState(null);
  const [fehler, setFehler] = useState(null);
  const [ladend, setLadend] = useState(false);

  useEffect(() => {
    supabase.from("mannschaften").select("*").order("name").then(({ data }) => data && setMannschaften(data));
    supabase.from("profiles").select("*").order("nachname").then(({ data }) => data && setSpielerListe(data));
  }, []);

  function generierePasswort() {
    const zeichen = "ABCDEFGHKLMNPQRSTUVWXYZ23456789";
    return Array.from({ length: 10 }, () => zeichen[Math.floor(Math.random() * zeichen.length)]).join("");
  }

  async function spielerAnlegen() {
    setFehler(null);
    if (!form.vorname || !form.nachname || !form.email || !form.mannschaftId) {
      return setFehler("Bitte alle Pflichtfelder ausfüllen.");
    }
    setLadend(true);
    const einmalig = generierePasswort();

    // Anlegen eines neuen Auth-Nutzers braucht Admin-Rechte (Service-Role-Key) –
    // das darf nicht im Frontend passieren, deshalb läuft das über die Edge Function.
    const { data, error } = await supabase.functions.invoke("create-spieler", {
      body: { ...form, mannschaftId: form.mannschaftId, einmalpasswort: einmalig },
    });

    setLadend(false);
    if (error || data?.error) {
      setFehler(error?.message || data.error);
      return;
    }
    setEinmalpasswort(einmalig);
    setForm({ vorname: "", nachname: "", geburtstag: "", email: "", rang: "Spieler", mannschaftId: form.mannschaftId });
    const { data: neueListe } = await supabase.from("profiles").select("*").order("nachname");
    if (neueListe) setSpielerListe(neueListe);
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="bg-white rounded-lg border p-5">
        <SectionLabel icon={UserPlus}>Neuen Spieler anlegen</SectionLabel>
        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <input placeholder="Vorname" value={form.vorname} onChange={(e) => setForm({ ...form, vorname: e.target.value })} className="border rounded-md px-3 py-2 text-sm" />
          <input placeholder="Nachname" value={form.nachname} onChange={(e) => setForm({ ...form, nachname: e.target.value })} className="border rounded-md px-3 py-2 text-sm" />
          <input type="date" value={form.geburtstag} onChange={(e) => setForm({ ...form, geburtstag: e.target.value })} className="border rounded-md px-3 py-2 text-sm" />
          <input placeholder="E-Mail" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="border rounded-md px-3 py-2 text-sm" />
          <select value={form.rang} onChange={(e) => setForm({ ...form, rang: e.target.value })} className="border rounded-md px-3 py-2 text-sm">
            <option>Mannschaftsführer</option>
            <option>stellv. Mannschaftsführer</option>
            <option>Spieler</option>
            <option>Ersatz</option>
          </select>
          <select value={form.mannschaftId} onChange={(e) => setForm({ ...form, mannschaftId: e.target.value })} className="border rounded-md px-3 py-2 text-sm">
            <option value="">Mannschaft wählen…</option>
            {mannschaften.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        {fehler && <p className="text-xs mb-3" style={{ color: COLORS.orangeDeep }}>{fehler}</p>}
        <button onClick={spielerAnlegen} disabled={ladend} className="px-4 py-2 rounded-md text-white text-sm font-semibold" style={{ background: COLORS.orange, opacity: ladend ? 0.6 : 1 }}>
          {ladend ? "Lege an…" : "Spieler anlegen"}
        </button>

        {einmalpasswort && (
          <div className="mt-4 p-3 rounded-md text-sm" style={{ background: "#DDF0EA", color: COLORS.petrol }}>
            Einmalpasswort: <strong className="font-mono">{einmalpasswort}</strong>
            <br />
            <span className="text-xs">Bitte manuell an den Spieler weitergeben — automatischer Mailversand folgt, sobald der E-Mail-Dienst angebunden ist.</span>
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg border p-5">
        <SectionLabel icon={Users}>Alle Spieler</SectionLabel>
        <div className="divide-y">
          {spielerListe.map((s) => (
            <div key={s.id} className="flex items-center justify-between py-2 text-sm">
              <span>{s.vorname} {s.nachname}</span>
              <span className="text-xs text-gray-400">{s.rang}</span>
            </div>
          ))}
          {spielerListe.length === 0 && <p className="text-sm text-gray-400">Noch keine Spieler angelegt.</p>}
        </div>
      </div>
    </div>
  );
}

/* ---------- Einstellungen (Saison-Verwaltung) ---------- */

function Einstellungen({ profil }) {
  const [saisons, setSaisons] = useState(SAISONS);
  const [neueBezeichnung, setNeueBezeichnung] = useState("");

  function updateField(id, field, value) {
    setSaisons((prev) => prev.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
  }

  function neueSaisonAnlegen() {
    if (!neueBezeichnung.trim()) return;
    setSaisons((prev) => [
      ...prev.map((s) => ({ ...s, aktiv: false })),
      {
        id: prev.length + 1,
        bezeichnung: neueBezeichnung,
        aktiv: true,
        tabellenUrl: "",
        mannschaftUrl: "",
        spielplanHinrundeUrl: "",
        spielplanRueckrundeUrl: "",
        letzteAktualisierung: null,
      },
    ]);
    setNeueBezeichnung("");
  }

  const linkFelder = [
    { key: "tabellenUrl", label: "Tabellen-Link", hinweis: "Tabelle → Aktuelle Tabelle" },
    { key: "mannschaftUrl", label: "Mannschafts-Link (Aufstellung)", hinweis: "Mannschaften → eure Mannschaft" },
    { key: "spielplanHinrundeUrl", label: "Spielplan-Link Hinrunde", hinweis: "Spielplan → Vorrunde" },
    { key: "spielplanRueckrundeUrl", label: "Spielplan-Link Rückrunde", hinweis: "Spielplan → Rückrunde" },
  ];

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="bg-white rounded-lg border p-5">
        <SectionLabel icon={CalendarDays}>Saisons</SectionLabel>
        <div className="space-y-4">
          {saisons.map((s) => (
            <div key={s.id} className="border rounded-md p-4" style={s.aktiv ? { borderColor: COLORS.orange } : {}}>
              <div className="flex items-center justify-between mb-3">
                <span className="font-semibold text-sm" style={{ color: COLORS.anthracite }}>
                  Saison {s.bezeichnung}
                </span>
                {s.aktiv && (
                  <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full text-white" style={{ background: COLORS.orange }}>
                    aktiv
                  </span>
                )}
              </div>
              <div className="space-y-3">
                {linkFelder.map((f) => (
                  <div key={f.key}>
                    <label className="block text-xs text-gray-500 mb-1">
                      {f.label} <span className="text-gray-300">({f.hinweis}, ändert sich jede Saison neu)</span>
                    </label>
                    <input
                      value={s[f.key]}
                      onChange={(e) => updateField(s.id, f.key, e.target.value)}
                      placeholder="https://bautzen.tischtennislive.de/…"
                      className="w-full border rounded-md px-3 py-2 text-sm"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-4 pt-4 border-t">
          <input
            value={neueBezeichnung}
            onChange={(e) => setNeueBezeichnung(e.target.value)}
            placeholder="z. B. 2027/2028"
            className="flex-1 border rounded-md px-3 py-2 text-sm"
          />
          <button onClick={neueSaisonAnlegen} className="px-4 py-2 rounded-md text-white text-sm font-semibold" style={{ background: COLORS.petrol }}>
            Neue Saison anlegen
          </button>
        </div>
      </div>

      <PasswortAendern profil={profil} />

      <div className="bg-white rounded-lg border p-5 text-sm text-gray-500">
        Benachrichtigungs-Einstellungen (E-Mail bei Nachrichten/Umfragen) folgen, sobald der E-Mail-Dienst angebunden ist.
      </div>
    </div>
  );
}

/* ---------- App-Shell ---------- */

const NAV_BASIS = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "tabelle", label: "Tabelle", icon: Table2 },
  { key: "planung", label: "Spielerplanung", icon: ShieldCheck },
  { key: "kalender", label: "Kalender", icon: CalendarDays },
  { key: "kader", label: "Kader", icon: Users },
  { key: "einstellungen", label: "Einstellungen", icon: Settings },
];

export default function App() {
  const [profil, setProfil] = useState(null);
  const [sessionGeprueft, setSessionGeprueft] = useState(false);
  const [tab, setTab] = useState("dashboard");
  const [navOpen, setNavOpen] = useState(false);

  // Bestehende Session wiederherstellen (z.B. nach Seiten-Reload)
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        const { data } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
        if (data) setProfil(data);
      }
      setSessionGeprueft(true);
    });
  }, []);

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

  const nav = profil.ist_admin ? [...NAV_BASIS, { key: "spieler", label: "Spielerverwaltung", icon: UserPlus }] : NAV_BASIS;

  const titles = {
    dashboard: "Dashboard",
    tabelle: "Aktuelle Tabelle",
    planung: "Spielerplanung",
    kalender: "Ereigniskalender",
    kader: "Kader — 3. Mannschaft",
    einstellungen: "Einstellungen",
    spieler: "Spielerverwaltung",
  };

  const initialen = `${profil.vorname?.[0] ?? ""}${profil.nachname?.[0] ?? ""}`.toUpperCase();

  return (
    <div className="min-h-screen flex" style={{ background: COLORS.paper, fontFamily: "Inter, sans-serif" }}>
      {/* Sidebar */}
      <aside
        className={`fixed md:static z-20 h-full md:h-auto w-64 transition-transform ${navOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}
        style={{ background: COLORS.petrolDark }}
      >
        <div className="p-5 flex items-center gap-3 border-b" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
          <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: COLORS.orange }}>
            <span className="text-white font-bold" style={{ fontFamily: "Oswald, sans-serif" }}>3</span>
          </div>
          <div>
            <p className="text-white text-sm font-bold leading-tight" style={{ fontFamily: "Oswald, sans-serif" }}>TTV 97 KAMENZ</p>
            <p className="text-[10px] uppercase tracking-widest" style={{ color: COLORS.orange }}>3. Mannschaft</p>
          </div>
        </div>
        <nav className="p-3 space-y-1">
          {nav.map((n) => (
            <button
              key={n.key}
              onClick={() => { setTab(n.key); setNavOpen(false); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition"
              style={
                tab === n.key
                  ? { background: COLORS.orange, color: "white", fontWeight: 600 }
                  : { color: "rgba(255,255,255,0.75)" }
              }
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

      {/* Main */}
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
          {tab === "dashboard" && <Dashboard />}
          {tab === "tabelle" && <Tabelle />}
          {tab === "planung" && <Spielerplanung />}
          {tab === "kalender" && <Kalender />}
          {tab === "kader" && <Kader />}
          {tab === "einstellungen" && <Einstellungen profil={profil} />}
          {tab === "spieler" && profil.ist_admin && <Spielerverwaltung />}
        </main>
      </div>
    </div>
  );
}
