import React, { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import logo from "./logo.jpg";
import {
  LayoutDashboard, Table2, CalendarDays, Users, MessageSquare,
  Settings, Bell, ChevronRight, Check, X, HelpCircle, Cake,
  Trophy, AlertTriangle, Vote, GraduationCap, Menu, LogOut, ShieldCheck,
  UserPlus, KeyRound, Eye, EyeOff, Plus, Pencil, Trash2, CalendarPlus
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

/* ---------- Passwort ändern (erfordert altes Passwort) ---------- */

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

function Dashboard({ saison, profil, onOeffneUmfrage }) {
  const [ladend, setLadend] = useState(true);
  const [eigenerTabellenplatz, setEigenerTabellenplatz] = useState(null);
  const [naechstesSpiel, setNaechstesSpiel] = useState(null);
  const [geburtstag, setGeburtstag] = useState(null);
  const [termine, setTermine] = useState([]);
  const [offeneUmfragen, setOffeneUmfragen] = useState([]);

  useEffect(() => {
    if (!saison) return;
    setLadend(true);
    (async () => {
      const [{ data: tabelleZeile }, { data: spiele }, { data: profile }, { data: kalender }, { data: umfragen }, { data: eigeneAntworten }] = await Promise.all([
        supabase.from("tabelle").select("*").eq("saison_id", saison.id).eq("ist_eigenes_team", true).maybeSingle(),
        supabase.from("verbands_spiele").select("*").eq("saison_id", saison.id).gte("datum", new Date().toISOString()).order("datum").limit(1),
        supabase.from("profiles").select("id, vorname, nachname, geburtstag"),
        supabase.from("kalender_ereignisse").select("*").gte("datum", new Date().toISOString()).order("datum").limit(4),
        supabase.from("umfragen").select("id, titel").eq("aktiv", true),
        supabase.from("umfrage_antworten").select("umfrage_id").eq("spieler_id", profil.id),
      ]);
      setEigenerTabellenplatz(tabelleZeile ?? null);
      setNaechstesSpiel(spiele?.[0] ?? null);
      setGeburtstag(naechsterGeburtstag(profile ?? []));
      setTermine(kalender ?? []);
      const beantwortetIds = new Set((eigeneAntworten ?? []).map((a) => a.umfrage_id));
      setOffeneUmfragen((umfragen ?? []).filter((u) => !beantwortetIds.has(u.id)));
      setLadend(false);
    })();
  }, [saison, profil.id]);

  if (ladend) return <Leerzustand text="Lade Dashboard…" />;

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

      <div className="grid md:grid-cols-2 gap-4">
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
                    <ChevronRight size={14} className="text-gray-300 ml-auto" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-gray-400 mt-3">Nachrichten zwischen Spielern folgen in einer späteren Ausbaustufe.</p>
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
          {profil.ist_admin && (
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
  const [ladend, setLadend] = useState(true);

  useEffect(() => {
    if (!saison) return;
    setLadend(true);
    (async () => {
      const [{ data: spieleDaten }, { data: spielerDaten }, { data: meldungenDaten }] = await Promise.all([
        supabase.from("verbands_spiele").select("*").eq("saison_id", saison.id).eq("runde", runde).order("datum"),
        supabase.from("profiles").select("*").order("nachname"),
        supabase.from("spielerplanung_meldungen").select("*").eq("saison_id", saison.id),
      ]);
      setSpiele(spieleDaten ?? []);
      setSpieler(spielerDaten ?? []);
      const map = {};
      (spieleDaten ?? []).forEach((s) => { map[s.id] = {}; (spielerDaten ?? []).forEach((sp) => { map[s.id][sp.id] = "offen"; }); });
      (meldungenDaten ?? []).forEach((m) => { if (map[m.spiel_id]) map[m.spiel_id][m.spieler_id] = m.status; });
      setMeldungen(map);
      setLadend(false);
    })();
  }, [saison, runde]);

  async function toggle(spielId, spielerId) {
    if (spielerId !== profil.id && !profil.ist_admin) return; // nur eigene Meldung, außer Admin
    const order = { offen: "ja", ja: "nein", nein: "offen" };
    const neuerStatus = order[meldungen[spielId]?.[spielerId] ?? "offen"];

    setMeldungen((prev) => ({ ...prev, [spielId]: { ...prev[spielId], [spielerId]: neuerStatus } }));

    await supabase.from("spielerplanung_meldungen").upsert(
      { saison_id: saison.id, spiel_id: spielId, spieler_id: spielerId, status: neuerStatus, aktualisiert_am: new Date().toISOString() },
      { onConflict: "spiel_id,spieler_id" }
    );
    // TODO nächster Schritt: bei Status "nein" oder <4 Zusagen alle Spieler per E-Mail informieren,
    // sobald der E-Mail-Dienst angebunden ist.
  }

  function countJa(spielId) {
    return Object.values(meldungen[spielId] ?? {}).filter((v) => v === "ja").length;
  }

  if (ladend) return <Leerzustand text="Lade Spielerplanung…" />;

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
                    const kritisch = ja < 4;
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

          {spiele.some((s) => countJa(s.id) < 4) && (
            <div className="flex items-start gap-2 p-3 rounded-md text-sm" style={{ background: "#FBE2DA", color: COLORS.orangeDeep }}>
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>
                Mindestens ein Spiel hat aktuell weniger als 4 Zusagen. E-Mail-Benachrichtigung an alle Spieler folgt,
                sobald der E-Mail-Dienst angebunden ist.
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ---------- Kalender ---------- */

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
  const [ladend, setLadend] = useState(true);
  const [form, setForm] = useState({ titel: "", datum: "", uhrzeit: "", dauerMinuten: 90, datumEnde: "", typ: "termin", zeitraum: false });
  const [fehler, setFehler] = useState(null);

  const [bearbeitenId, setBearbeitenId] = useState(null);
  const [bearbeitenForm, setBearbeitenForm] = useState({ titel: "", datum: "", datumEnde: "", typ: "termin" });

  async function laden() {
    setLadend(true);
    const { data } = await supabase.from("kalender_ereignisse").select("*").order("datum");
    setEreignisse(data ?? []);
    setLadend(false);
  }

  useEffect(() => { laden(); }, []);

  async function anlegen() {
    setFehler(null);
    if (!form.titel || !form.datum || !form.uhrzeit) return setFehler("Titel, Datum und Uhrzeit sind Pflichtfelder.");
    if (form.zeitraum && !form.datumEnde) return setFehler("Bitte ein Enddatum für den Zeitraum angeben.");

    const start = new Date(`${form.datum}T${form.uhrzeit}`);
    const ende = form.zeitraum
      ? new Date(form.datumEnde)
      : new Date(start.getTime() + Number(form.dauerMinuten) * 60000);

    const { error } = await supabase.from("kalender_ereignisse").insert({
      titel: form.titel,
      datum: start.toISOString(),
      datum_ende: ende.toISOString(),
      typ: form.typ,
      erstellt_von: profil.id,
    });
    if (error) return setFehler(error.message);
    setForm({ titel: "", datum: "", uhrzeit: "", dauerMinuten: 90, datumEnde: "", typ: "termin", zeitraum: false });
    laden();
    // TODO nächster Schritt: optional per E-Mail an alle Spieler verschicken,
    // sobald der E-Mail-Dienst angebunden ist.
  }

  function bearbeitenStarten(e) {
    setBearbeitenId(e.id);
    setBearbeitenForm({
      titel: e.titel,
      datum: isoZuDatetimeLocal(e.datum),
      datumEnde: isoZuDatetimeLocal(e.datum_ende),
      typ: e.typ,
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

  const iconFor = { training: Users, spiel: Trophy, lehrgang: GraduationCap, termin: CalendarDays };

  return (
    <div className="space-y-4">
      {profil.ist_admin && (
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
                  value={form.dauerMinuten}
                  onChange={(e) => setForm({ ...form, dauerMinuten: Number(e.target.value) })}
                  className="w-full border rounded-md px-3 py-2 text-sm"
                >
                  <option value={30}>30 Minuten</option>
                  <option value={45}>45 Minuten</option>
                  <option value={60}>1 Stunde</option>
                  <option value={90}>1,5 Stunden</option>
                  <option value={120}>2 Stunden</option>
                  <option value={180}>3 Stunden</option>
                  <option value={240}>4 Stunden</option>
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs text-gray-400 mb-1">Typ</label>
              <select value={form.typ} onChange={(e) => setForm({ ...form, typ: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm">
                <option value="training">Training</option>
                <option value="spiel">Spiel</option>
                <option value="lehrgang">Lehrgang</option>
                <option value="termin">Sonstiger Termin</option>
              </select>
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
                    <option value="termin">Sonstiger Termin</option>
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

            return (
              <div key={e.id} className="flex items-center gap-4 p-4">
                <div className="w-10 h-10 rounded-md flex items-center justify-center shrink-0" style={{ background: COLORS.petrolDark }}>
                  <Icon size={18} color="white" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-sm" style={{ color: COLORS.anthracite }}>{e.titel}</p>
                  <p className="text-xs text-gray-400">{zeitraum}</p>
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
                    {profil.ist_admin && (
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
    const [{ data: spielerDaten }, { data: infoDaten }] = await Promise.all([
      supabase.from("profiles").select("*").order("nachname"),
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
          {profil.ist_admin && (
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
            {!info.aufstellung_freigegeben && (
              <div className="flex items-start gap-2 p-3 rounded-md text-sm mt-4" style={{ background: "#F1F1EF", color: "#777" }}>
                <HelpCircle size={16} className="mt-0.5 shrink-0" />
                Der Verband hat die Aufstellungsliste für diese Saison noch nicht freigegeben. Bis dahin gilt die intern gepflegte Liste unten.
              </div>
            )}
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
              </div>
            </div>
          ))}
        </div>
      )}
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

  const [neueMannschaft, setNeueMannschaft] = useState("");
  const [mannschaftFehler, setMannschaftFehler] = useState(null);
  const [bearbeiteMannschaftId, setBearbeiteMannschaftId] = useState(null);
  const [bearbeiteMannschaftName, setBearbeiteMannschaftName] = useState("");

  async function ladenAlles() {
    const [{ data: m }, { data: s }] = await Promise.all([
      supabase.from("mannschaften").select("*").order("name"),
      supabase.from("profiles").select("*").order("nachname"),
    ]);
    if (m) setMannschaften(m);
    if (s) setSpielerListe(s);
  }

  useEffect(() => { ladenAlles(); }, []);

  function spielerAnzahl(mannschaftId) {
    return spielerListe.filter((s) => s.mannschaft_id === mannschaftId).length;
  }

  async function mannschaftAnlegen() {
    setMannschaftFehler(null);
    if (!neueMannschaft.trim()) return;
    const { error } = await supabase.from("mannschaften").insert({ name: neueMannschaft.trim() });
    if (error) return setMannschaftFehler(error.message);
    setNeueMannschaft("");
    ladenAlles();
  }

  function mannschaftBearbeitenStarten(m) {
    setBearbeiteMannschaftId(m.id);
    setBearbeiteMannschaftName(m.name);
  }

  async function mannschaftUmbenennen() {
    if (!bearbeiteMannschaftName.trim()) return;
    const { error } = await supabase.from("mannschaften").update({ name: bearbeiteMannschaftName.trim() }).eq("id", bearbeiteMannschaftId);
    if (error) return setMannschaftFehler(error.message);
    setBearbeiteMannschaftId(null);
    ladenAlles();
  }

  const [mannschaftLoeschenBestaetigung, setMannschaftLoeschenBestaetigung] = useState(null);

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

    const { data, error } = await supabase.functions.invoke("create-spieler", {
      body: { ...form, mannschaftId: form.mannschaftId, einmalpasswort: einmalig },
    });

    setLadend(false);
    if (error || data?.error) {
      setFehler(await echteFehlermeldung(error, data));
      return;
    }
    setEinmalpasswort(einmalig);
    setForm({ vorname: "", nachname: "", geburtstag: "", email: "", rang: "Spieler", mannschaftId: form.mannschaftId });
    ladenAlles();
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="bg-white rounded-lg border p-5">
        <SectionLabel icon={Users}>Mannschaften</SectionLabel>
        <div className="space-y-2 mb-3">
          {mannschaften.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-2 py-2 border-b last:border-b-0">
              {bearbeiteMannschaftId === m.id ? (
                <div className="flex items-center gap-2 flex-1">
                  <input
                    value={bearbeiteMannschaftName}
                    onChange={(e) => setBearbeiteMannschaftName(e.target.value)}
                    className="flex-1 border rounded-md px-2 py-1 text-sm"
                  />
                  <button onClick={mannschaftUmbenennen} className="text-xs px-2 py-1 rounded-md text-white" style={{ background: COLORS.orange }}>
                    Speichern
                  </button>
                  <button onClick={() => setBearbeiteMannschaftId(null)} className="text-xs px-2 py-1 rounded-md border">
                    Abbrechen
                  </button>
                </div>
              ) : (
                <>
                  <div className="text-sm">
                    <span className="font-medium" style={{ color: COLORS.anthracite }}>{m.name}</span>
                    <span className="text-xs text-gray-400 ml-2">{spielerAnzahl(m.id)} Spieler</span>
                  </div>
                  {mannschaftLoeschenBestaetigung === m.id ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-gray-500">Wirklich löschen?</span>
                      <button onClick={() => mannschaftLoeschen(m)} className="text-xs px-2 py-1 rounded-md text-white" style={{ background: COLORS.orangeDeep }}>
                        Ja, löschen
                      </button>
                      <button onClick={() => setMannschaftLoeschenBestaetigung(null)} className="text-xs px-2 py-1 rounded-md border">
                        Abbrechen
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 shrink-0">
                      <button onClick={() => mannschaftBearbeitenStarten(m)} className="text-gray-400 hover:text-gray-600">
                        <Pencil size={15} />
                      </button>
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
        <div className="flex gap-2">
          <input
            value={neueMannschaft}
            onChange={(e) => setNeueMannschaft(e.target.value)}
            placeholder="z. B. 2. Mannschaft"
            className="flex-1 border rounded-md px-3 py-2 text-sm"
          />
          <button onClick={mannschaftAnlegen} className="px-4 py-2 rounded-md text-white text-sm font-semibold" style={{ background: COLORS.petrol }}>
            Mannschaft anlegen
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg border p-5">
        <SectionLabel icon={UserPlus}>Neuen Spieler anlegen</SectionLabel>
        {mannschaften.length === 0 && (
          <p className="text-xs mb-3" style={{ color: COLORS.orangeDeep }}>
            Bitte oben zuerst eine Mannschaft anlegen.
          </p>
        )}
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

/* ---------- Umfragen ---------- */

function Umfragen({ profil, zielUmfrageId }) {
  const [umfragen, setUmfragen] = useState([]);
  const [antwortenNachUmfrage, setAntwortenNachUmfrage] = useState({});
  const [zieleNachUmfrage, setZieleNachUmfrage] = useState({}); // { [umfrageId]: spielerId[] } – leer = "alle"
  const [spielerListe, setSpielerListe] = useState([]);
  const [ladend, setLadend] = useState(true);

  const [form, setForm] = useState({ titel: "", beschreibung: "", optionen: ["", ""], mehrfachauswahl: false, empfaenger: "alle", einzelneIds: [], endetAm: "" });
  const [fehler, setFehler] = useState(null);
  const [speichernLadend, setSpeichernLadend] = useState(false);

  async function laden() {
    setLadend(true);
    const [{ data: umfragenDaten }, { data: antwortenDaten }, { data: spielerDaten }, { data: zieleDaten }] = await Promise.all([
      supabase.from("umfragen").select("*").eq("aktiv", true).order("erstellt_am", { ascending: false }),
      supabase.from("umfrage_antworten").select("umfrage_id, spieler_id, ausgewaehlte_optionen"),
      supabase.from("profiles").select("id, vorname, nachname"),
      supabase.from("umfrage_ziele").select("umfrage_id, spieler_id"),
    ]);
    setUmfragen(umfragenDaten ?? []);
    setSpielerListe(spielerDaten ?? []);
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
    // TODO nächster Schritt: Ersteller optional per E-Mail benachrichtigen, sobald der E-Mail-Dienst angebunden ist.
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

    setSpeichernLadend(true);
    const { data: neueUmfrage, error } = await supabase
      .from("umfragen")
      .insert({
        titel: form.titel.trim(),
        beschreibung: form.beschreibung.trim() || null,
        optionen: optionenBereinigt,
        mehrfachauswahl: form.mehrfachauswahl,
        erstellt_von: profil.id,
        endet_am: form.endetAm ? new Date(form.endetAm).toISOString() : null,
      })
      .select()
      .single();

    if (error) {
      setSpeichernLadend(false);
      return setFehler(error.message);
    }

    if (form.empfaenger === "einzeln") {
      await supabase.from("umfrage_ziele").insert(form.einzelneIds.map((spieler_id) => ({ umfrage_id: neueUmfrage.id, spieler_id })));
    }

    setSpeichernLadend(false);
    setForm({ titel: "", beschreibung: "", optionen: ["", ""], mehrfachauswahl: false, empfaenger: "alle", einzelneIds: [], endetAm: "" });
    laden();
    // TODO nächster Schritt: betroffene Spieler optional per E-Mail informieren, sobald der E-Mail-Dienst angebunden ist.
  }

  if (ladend) return <Leerzustand text="Lade Umfragen…" />;

  return (
    <div className="space-y-4 max-w-2xl">
      {profil.ist_admin && (
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

          <label className="block text-xs text-gray-500 mb-1">Empfänger</label>
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setForm({ ...form, empfaenger: "alle" })}
              className="px-3 py-1.5 rounded-full text-sm font-semibold"
              style={form.empfaenger === "alle" ? { background: COLORS.orange, color: "white" } : { background: "#fff", border: "1px solid #ddd" }}
            >
              Alle Spieler
            </button>
            <button
              onClick={() => setForm({ ...form, empfaenger: "einzeln" })}
              className="px-3 py-1.5 rounded-full text-sm font-semibold"
              style={form.empfaenger === "einzeln" ? { background: COLORS.orange, color: "white" } : { background: "#fff", border: "1px solid #ddd" }}
            >
              Einzelne Spieler
            </button>
          </div>

          {form.empfaenger === "einzeln" && (
            <div className="grid sm:grid-cols-2 gap-1 mb-3 max-h-40 overflow-y-auto border rounded-md p-2">
              {spielerListe.map((s) => (
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

function UmfrageKarte({ umfrage, antworten, zielAnzahl, profil, hervorgehoben, onAbstimmen, onBeenden, onLoeschen }) {
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

      {zeigeErgebnis ? (
        <div className="space-y-2">
          {umfrage.optionen.map((option, i) => {
            const stimmenFuerOption = antworten.filter((a) => a.ausgewaehlte_optionen.includes(i)).length;
            const prozent = gesamtStimmen === 0 ? 0 : Math.round((stimmenFuerOption / gesamtStimmen) * 100);
            const istEigene = eigeneAntwort?.ausgewaehlte_optionen.includes(i);
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

/* ---------- Einstellungen (Saison-Verwaltung) ---------- */

function Einstellungen({ profil, saisons, onSaisonsGeaendert }) {
  const [neueBezeichnung, setNeueBezeichnung] = useState("");
  const [fehler, setFehler] = useState(null);

  async function updateField(id, field, value) {
    onSaisonsGeaendert((prev) => prev.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
    await supabase.from("saisons").update({ [field]: value }).eq("id", id);
  }

  async function neueSaisonAnlegen() {
    setFehler(null);
    if (!neueBezeichnung.trim()) return;
    await supabase.from("saisons").update({ aktiv: false }).neq("id", "00000000-0000-0000-0000-000000000000");
    const { data, error } = await supabase.from("saisons").insert({ bezeichnung: neueBezeichnung, aktiv: true }).select().single();
    if (error) return setFehler(error.message);
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

  return (
    <div className="space-y-6 max-w-2xl">
      {profil.ist_admin ? (
        <div className="bg-white rounded-lg border p-5">
          <SectionLabel icon={CalendarDays}>Saisons</SectionLabel>
          <div className="space-y-4">
            {saisons.map((s) => (
              <div key={s.id} className="border rounded-md p-4" style={s.aktiv ? { borderColor: COLORS.orange } : {}}>
                <div className="flex items-center justify-between mb-3">
                  <span className="font-semibold text-sm" style={{ color: COLORS.anthracite }}>Saison {s.bezeichnung}</span>
                  {s.aktiv && (
                    <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full text-white" style={{ background: COLORS.orange }}>aktiv</span>
                  )}
                </div>
                <div className="space-y-3">
                  {linkFelder.map((f) => (
                    <div key={f.key}>
                      <label className="block text-xs text-gray-500 mb-1">
                        {f.label} <span className="text-gray-300">({f.hinweis}, ändert sich jede Saison neu)</span>
                      </label>
                      <input
                        defaultValue={s[f.key] ?? ""}
                        onBlur={(e) => updateField(s.id, f.key, e.target.value)}
                        placeholder="https://bautzen.tischtennislive.de/…"
                        className="w-full border rounded-md px-3 py-2 text-sm"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {saisons.length === 0 && <Leerzustand text="Noch keine Saison angelegt." />}
          </div>
          {fehler && <p className="text-xs mt-3" style={{ color: COLORS.orangeDeep }}>{fehler}</p>}
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
      ) : (
        <div className="bg-white rounded-lg border p-5 text-sm text-gray-500">
          Aktive Saison: <strong>{saisons.find((s) => s.aktiv)?.bezeichnung ?? "keine"}</strong>
        </div>
      )}

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
  { key: "umfragen", label: "Umfragen", icon: Vote },
  { key: "einstellungen", label: "Einstellungen", icon: Settings },
];

export default function App() {
  const [profil, setProfil] = useState(null);
  const [sessionGeprueft, setSessionGeprueft] = useState(false);
  const [tab, setTab] = useState("dashboard");
  const [zielUmfrageId, setZielUmfrageId] = useState(null);
  const [navOpen, setNavOpen] = useState(false);
  const [saisons, setSaisons] = useState([]);
  const [saisonsGeladen, setSaisonsGeladen] = useState(false);

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

  const nav = profil.ist_admin ? [...NAV_BASIS, { key: "spieler", label: "Spielerverwaltung", icon: UserPlus }] : NAV_BASIS;

  const titles = {
    dashboard: "Dashboard",
    tabelle: "Aktuelle Tabelle",
    planung: "Spielerplanung",
    kalender: "Ereigniskalender",
    kader: "Kader — 3. Mannschaft",
    umfragen: "Umfragen",
    einstellungen: "Einstellungen",
    spieler: "Spielerverwaltung",
  };

  const initialen = `${profil.vorname?.[0] ?? ""}${profil.nachname?.[0] ?? ""}`.toUpperCase();
  const aktiveSaison = saisons.find((s) => s.aktiv) ?? null;

  return (
    <div className="min-h-screen flex" style={{ background: COLORS.paper, fontFamily: "Inter, sans-serif" }}>
      <aside
        className={`fixed md:static z-20 h-full md:h-auto w-64 transition-transform ${navOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}
        style={{ background: COLORS.petrolDark }}
      >
        <div className="p-5 flex items-center gap-3 border-b" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
          <img src={logo} alt="TTV 97 Kamenz Logo" className="w-10 h-10 rounded-full object-cover shrink-0" style={{ border: `2px solid ${COLORS.orange}` }} />
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
            <Einstellungen profil={profil} saisons={saisons} onSaisonsGeaendert={setSaisons} />
          ) : tab === "umfragen" ? (
            <Umfragen profil={profil} zielUmfrageId={zielUmfrageId} />
          ) : tab === "spieler" ? (
            profil.ist_admin && <Spielerverwaltung />
          ) : !saisonsGeladen ? (
            <Leerzustand text="Lade Saison…" />
          ) : !aktiveSaison ? (
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
                />
              )}
              {tab === "tabelle" && <Tabelle saison={aktiveSaison} profil={profil} />}
              {tab === "planung" && <Spielerplanung saison={aktiveSaison} profil={profil} />}
              {tab === "kalender" && <Kalender profil={profil} />}
              {tab === "kader" && <Kader saison={aktiveSaison} profil={profil} />}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
