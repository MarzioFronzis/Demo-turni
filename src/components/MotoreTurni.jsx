import { useState, useMemo } from "react";
import { Plus, Trash2, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, RefreshCw, AlertTriangle, Check, X, Copy, CalendarOff, FileSpreadsheet, MessageCircle, Printer, Repeat, ChevronsLeft, ChevronsRight, Gauge, Info, Sparkles } from "lucide-react";
import * as XLSX from "xlsx";
import { useAuth } from "../lib/AuthContext";
import { useFirestoreCollection, useFirestoreMappa } from "../hooks/useFirestoreCollection";
import * as dbApi from "../lib/db";
import { seedEsempio } from "../lib/seed";
import { COLL } from "../lib/collections";
import {
  GIORNI_LABEL,
  MESI_LABEL,
  fmtData,
  parseData,
  lunediSettimana,
  addGiorni,
  addSettimane,
  addMesi,
  numeroSettimanaISO,
  annoISO,
  stringaSettimanaISO,
  dataDaStringaSettimanaISO,
  etichettaGiorno,
  etichettaRangeSettimana,
  toMin,
  sovrapposte,
  durataOre,
} from "../lib/date";
import { calcolaPrioritaSync, calcolaProposta, inAssenza } from "../lib/motore";

const ORA_INIZIO_CAL = 6;
const ORA_FINE_CAL = 22;
const PX_ORA = 44;

const PALETTE_SKILL = [
  { bg: "#F3E7D3", border: "#C9973F", text: "#7A5A1E" },
  { bg: "#E4EDE3", border: "#6E9A63", text: "#3C5E33" },
  { bg: "#EFE1E7", border: "#B4708B", text: "#7A3D53" },
  { bg: "#DEE6EE", border: "#5C7FA6", text: "#33506F" },
  { bg: "#F0E4D0", border: "#B08251", text: "#6E4F2C" },
  { bg: "#E8E1EE", border: "#8B6FA8", text: "#553D6E" },
];

function coloreSkill(skillId, skills) {
  const idx = skills.findIndex((s) => s.id === skillId);
  return PALETTE_SKILL[idx % PALETTE_SKILL.length] || PALETTE_SKILL[0];
}
function coloreDipendente(dipendenteId, dipendenti) {
  const idx = dipendenti.findIndex((d) => d.id === dipendenteId);
  return PALETTE_SKILL[idx % PALETTE_SKILL.length] || PALETTE_SKILL[0];
}

const TAB = [
  { key: "skill", label: "Skill" },
  { key: "dip", label: "Dipendenti" },
  { key: "fab", label: "Fabbisogno" },
  { key: "pri", label: "Priorità" },
  { key: "gen", label: "Genera" },
  { key: "kpi", label: "KPI" },
];

const SUGGERIMENTI_TAB = {
  skill: "1 · Definisci le competenze del locale (cassa, forno, colore...).",
  dip: "2 · Aggiungi i dipendenti: skill possedute, ore max, giorni liberi minimi.",
  fab: "3 · Disegna il fabbisogno sul calendario: chi serve, quando, quanti.",
  pri: "4 · Per ogni skill, ordina chi provare prima in caso di scelta.",
  gen: "5 · Genera la proposta per questa settimana e le 4 successive, poi esportala o invia i turni.",
  kpi: "Copertura, ore e carico di lavoro della settimana in vista.",
};

export default function MotoreTurni() {
  const { logout } = useAuth();
  const { dati: skills } = useFirestoreCollection(COLL.skills);
  const { dati: dipendentiRaw } = useFirestoreCollection(COLL.dipendenti);
  const dipendenti = useMemo(
    () => dipendentiRaw.map((d) => ({ telefono: "", skillIds: [], tettoOre: 30, oreMaxGiorno: 8, minGiorniLiberi: 1, assenze: [], ...d })),
    [dipendentiRaw]
  );
  const { dati: fabbisogno } = useFirestoreCollection(COLL.fabbisogno);
  const { mappa: prioritaMappa } = useFirestoreMappa(COLL.priorita);
  const { mappa: risultati } = useFirestoreMappa(COLL.proposte);

  const [settimanaVista, setSettimanaVista] = useState(lunediSettimana(new Date()));
  const [tab, setTab] = useState("skill");
  const [modaleFascia, setModaleFascia] = useState(null);
  const [modaleDuplica, setModaleDuplica] = useState(null);
  const [modaleRicorrenza, setModaleRicorrenza] = useState(false);
  const [modaleAssenze, setModaleAssenze] = useState(null);
  const [nuovaSkill, setNuovaSkill] = useState("");
  const [generando, setGenerando] = useState(false);
  const [seedando, setSeedando] = useState(false);

  const giorniSettimana = useMemo(() => Array.from({ length: 7 }, (_, i) => addGiorni(settimanaVista, i)), [settimanaVista.getTime()]);
  const chiaveSettimanaVista = stringaSettimanaISO(settimanaVista);
  const risultatoVista = risultati[chiaveSettimanaVista] || null;
  const fabbisognoSettimanaVista = useMemo(() => {
    const dateVista = giorniSettimana.map(fmtData);
    return fabbisogno.filter((f) => dateVista.includes(f.data));
  }, [fabbisogno, giorniSettimana]);

  const prioritaSync = useMemo(() => calcolaPrioritaSync(skills, dipendenti, prioritaMappa), [skills, dipendenti, prioritaMappa]);

  function spostaPriorita(skillId, idx, dir) {
    const arr = [...(prioritaSync[skillId] || [])];
    const j = idx + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    dbApi.salvaPriorita(skillId, arr);
  }

  function aggiungiSkill() {
    const nome = nuovaSkill.trim();
    if (!nome) return;
    if (skills.some((s) => s.nome.toLowerCase() === nome.toLowerCase())) {
      setNuovaSkill("");
      return;
    }
    dbApi.aggiungiSkill(nome);
    setNuovaSkill("");
  }
  async function eliminaSkill(id) {
    await dbApi.eliminaSkill(id);
    await Promise.all(
      dipendenti
        .filter((d) => (d.skillIds || []).includes(id))
        .map((d) => dbApi.aggiornaDipendente(d.id, { skillIds: d.skillIds.filter((x) => x !== id) }))
    );
    await Promise.all(
      fabbisogno
        .filter((f) => (f.requisiti || []).some((r) => r.skillId === id))
        .map((f) => dbApi.aggiornaFascia(f.id, { requisiti: f.requisiti.filter((r) => r.skillId !== id) }))
    );
  }

  function aggiungiDipendente() {
    dbApi.aggiungiDipendente({ nome: "Nuovo dipendente", telefono: "", skillIds: [], tettoOre: 30, oreMaxGiorno: 8, minGiorniLiberi: 1, assenze: [] });
  }
  function aggiornaDipendente(id, campo, valore) {
    dbApi.aggiornaDipendente(id, { [campo]: valore });
  }
  function toggleSkillDipendente(id, skillId) {
    const d = dipendenti.find((x) => x.id === id);
    if (!d) return;
    const skillIds = d.skillIds.includes(skillId) ? d.skillIds.filter((x) => x !== skillId) : [...d.skillIds, skillId];
    dbApi.aggiornaDipendente(id, { skillIds });
  }
  function eliminaDipendente(id) {
    dbApi.eliminaDipendente(id);
  }
  function aggiungiAssenza(dipendenteId, assenza) {
    const d = dipendenti.find((x) => x.id === dipendenteId);
    if (d) dbApi.aggiungiAssenza(dipendenteId, d, assenza);
  }
  function eliminaAssenza(dipendenteId, assenzaId) {
    const d = dipendenti.find((x) => x.id === dipendenteId);
    if (d) dbApi.eliminaAssenza(dipendenteId, d, assenzaId);
  }

  function salvaFascia(fascia) {
    const { id, ...campi } = fascia;
    if (id) dbApi.aggiornaFascia(id, campi);
    else dbApi.aggiungiFascia(campi);
    setModaleFascia(null);
  }
  function eliminaFascia(id) {
    dbApi.eliminaFascia(id);
    setModaleFascia(null);
  }

  function duplicaSuGiorni(sorgente, dateTarget) {
    let nuove = [];
    if (sorgente.tipo === "giorno") {
      const fasceOrigine = fabbisogno.filter((f) => f.data === sorgente.data);
      dateTarget.forEach((data) => {
        fasceOrigine.forEach((f) => {
          nuove.push({ data, oraInizio: f.oraInizio, oraFine: f.oraFine, requisiti: f.requisiti.map((r) => ({ ...r })) });
        });
      });
    } else {
      const f = sorgente.fascia;
      dateTarget.forEach((data) => {
        nuove.push({ data, oraInizio: f.oraInizio, oraFine: f.oraFine, requisiti: f.requisiti.map((r) => ({ ...r })) });
      });
    }
    dbApi.aggiungiFasceInBlocco(nuove);
    setModaleDuplica(null);
  }

  function duplicaSettimanaRicorrente(finoSettimanaStr) {
    const finoLunedi = dataDaStringaSettimanaISO(finoSettimanaStr);
    if (finoLunedi <= settimanaVista) {
      alert("La settimana finale deve essere successiva a quella corrente.");
      return;
    }
    const dateVista = giorniSettimana.map(fmtData);
    const sorgente = fabbisogno.filter((f) => dateVista.includes(f.data));
    if (sorgente.length === 0) {
      alert("La settimana corrente non ha fasce da duplicare.");
      return;
    }
    let cursore = addSettimane(settimanaVista, 1);
    const nuove = [];
    const settimaneSaltate = [];
    let iterazioni = 0;
    while (cursore <= finoLunedi && iterazioni < 104) {
      iterazioni++;
      const dateTarget = Array.from({ length: 7 }, (_, i) => fmtData(addGiorni(cursore, i)));
      const giaPresente = fabbisogno.some((f) => dateTarget.includes(f.data)) || nuove.some((f) => dateTarget.includes(f.data));
      if (giaPresente) {
        settimaneSaltate.push(numeroSettimanaISO(cursore));
      } else {
        sorgente.forEach((f) => {
          const offset = Math.round((parseData(f.data) - settimanaVista) / 86400000);
          nuove.push({ data: fmtData(addGiorni(cursore, offset)), oraInizio: f.oraInizio, oraFine: f.oraFine, requisiti: f.requisiti.map((r) => ({ ...r })) });
        });
      }
      cursore = addSettimane(cursore, 1);
    }
    dbApi.aggiungiFasceInBlocco(nuove);
    setModaleRicorrenza(false);
    if (settimaneSaltate.length > 0) {
      alert(`Fatto. Saltate ${settimaneSaltate.length} settimane già popolate (W${settimaneSaltate.join(", W")}) per non sovrascrivere dati esistenti.`);
    }
  }

  async function generaProposta() {
    setGenerando(true);
    try {
      const scritture = [];
      for (let i = 0; i < 5; i++) {
        const lun = addSettimane(settimanaVista, i);
        const esito = calcolaProposta(lun, fabbisogno, dipendenti, prioritaSync);
        if (esito) scritture.push(dbApi.salvaProposta(stringaSettimanaISO(lun), esito));
      }
      await Promise.all(scritture);
    } finally {
      setGenerando(false);
    }
  }

  async function caricaEsempio() {
    setSeedando(true);
    try {
      await seedEsempio(settimanaVista);
    } finally {
      setSeedando(false);
    }
  }

  return (
    <div className="min-h-screen" style={{ background: "#FAF6EF", color: "#3B2A20", fontFamily: "ui-sans-serif, system-ui" }}>
      <header className="px-5 py-4 border-b flex items-start justify-between gap-3" style={{ borderColor: "#E3D9C6" }}>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Gestione turni</h1>
          <p className="text-xs mt-0.5" style={{ color: "#8A7A63" }}>{SUGGERIMENTI_TAB[tab]}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {skills.length === 0 && dipendenti.length === 0 && fabbisogno.length === 0 && (
            <button
              onClick={caricaEsempio}
              disabled={seedando}
              className="text-xs font-medium flex items-center gap-1 px-2.5 py-1.5 rounded-lg disabled:opacity-50"
              style={{ background: "#F3E7D3", color: "#7A5A1E" }}
            >
              <Sparkles size={13} /> {seedando ? "Carico…" : "Carica esempio"}
            </button>
          )}
          <button onClick={logout} className="text-xs px-2.5 py-1.5 rounded-lg" style={{ border: "1px solid #E3D9C6", color: "#6E5A40" }}>
            Esci
          </button>
        </div>
      </header>

      <nav className="flex gap-1 px-3 py-2 overflow-x-auto border-b" style={{ borderColor: "#E3D9C6", background: "#FFFDF9" }}>
        {TAB.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors"
            style={tab === t.key ? { background: "#C9973F", color: "#FFFDF9", fontWeight: 600 } : { background: "transparent", color: "#6E5A40" }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {(tab === "fab" || tab === "gen" || tab === "kpi") && (
        <div className="flex items-center justify-between px-4 py-2.5 border-b" style={{ borderColor: "#E3D9C6", background: "#FFFDF9" }}>
          <div className="flex items-center gap-0.5">
            <button onClick={() => setSettimanaVista(addMesi(settimanaVista, -1))} aria-label="Mese precedente" className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ color: "#8A7A63" }}>
              <ChevronsLeft size={15} />
            </button>
            <button onClick={() => setSettimanaVista(addSettimane(settimanaVista, -1))} aria-label="Settimana precedente" className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ color: "#3B2A20" }}>
              <ChevronLeft size={16} />
            </button>
          </div>
          <div className="text-center">
            <div className="text-sm font-semibold">Sett. {numeroSettimanaISO(settimanaVista)} · {annoISO(settimanaVista)}</div>
            <div className="text-xs" style={{ color: "#8A7A63" }}>{etichettaRangeSettimana(settimanaVista)}</div>
          </div>
          <div className="flex items-center gap-0.5">
            <button onClick={() => setSettimanaVista(addSettimane(settimanaVista, 1))} aria-label="Settimana successiva" className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ color: "#3B2A20" }}>
              <ChevronRight size={16} />
            </button>
            <button onClick={() => setSettimanaVista(addMesi(settimanaVista, 1))} aria-label="Mese successivo" className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ color: "#8A7A63" }}>
              <ChevronsRight size={15} />
            </button>
          </div>
        </div>
      )}

      <main className="p-4 max-w-3xl mx-auto">
        {tab === "skill" && (
          <SkillPanel skills={skills} nuovaSkill={nuovaSkill} setNuovaSkill={setNuovaSkill} aggiungiSkill={aggiungiSkill} eliminaSkill={eliminaSkill} />
        )}

        {tab === "dip" && (
          <DipendentiPanel
            dipendenti={dipendenti}
            skills={skills}
            aggiungiDipendente={aggiungiDipendente}
            aggiornaDipendente={aggiornaDipendente}
            toggleSkillDipendente={toggleSkillDipendente}
            eliminaDipendente={eliminaDipendente}
            onApriAssenze={(id) => setModaleAssenze(id)}
          />
        )}

        {tab === "fab" && (
          <CalendarioFabbisogno
            fabbisogno={fabbisogno}
            skills={skills}
            giorniSettimana={giorniSettimana}
            onApriModale={(payload) => setModaleFascia(payload)}
            onDuplicaGiorno={(data) => setModaleDuplica({ tipo: "giorno", data })}
            onDuplicaFascia={(fascia) => setModaleFascia({ data: fascia.data, oraInizio: fascia.oraInizio, oraFine: fascia.oraFine, requisiti: fascia.requisiti.map((r) => ({ ...r })) })}
            onApriRicorrenza={() => setModaleRicorrenza(true)}
          />
        )}

        {tab === "pri" && <PrioritaPanel skills={skills} dipendenti={dipendenti} prioritaSync={prioritaSync} spostaPriorita={spostaPriorita} />}

        {tab === "gen" && (
          <GeneraPanel
            dipendenti={dipendenti}
            skills={skills}
            risultato={risultatoVista}
            onGenera={generaProposta}
            giorniSettimana={giorniSettimana}
            haFabbisogno={fabbisognoSettimanaVista.length > 0}
            generando={generando}
          />
        )}

        {tab === "kpi" && (
          <KPIPanel risultato={risultatoVista} dipendenti={dipendenti} fabbisognoSettimana={fabbisognoSettimanaVista} />
        )}
      </main>

      {modaleFascia && (
        <ModaleFascia dato={modaleFascia} skills={skills} giorniSettimana={giorniSettimana} onSalva={salvaFascia} onElimina={eliminaFascia} onChiudi={() => setModaleFascia(null)} />
      )}

      {modaleDuplica && (
        <ModaleDuplica dato={modaleDuplica} giorniSettimana={giorniSettimana} onConferma={duplicaSuGiorni} onChiudi={() => setModaleDuplica(null)} />
      )}

      {modaleRicorrenza && (
        <ModaleRicorrenza settimanaVista={settimanaVista} onConferma={duplicaSettimanaRicorrente} onChiudi={() => setModaleRicorrenza(false)} />
      )}

      {modaleAssenze && (
        <ModaleAssenze
          dipendente={dipendenti.find((d) => d.id === modaleAssenze)}
          onAggiungi={(a) => aggiungiAssenza(modaleAssenze, a)}
          onElimina={(aid) => eliminaAssenza(modaleAssenze, aid)}
          onChiudi={() => setModaleAssenze(null)}
        />
      )}
    </div>
  );
}

// ---------------- Skill ----------------
function SkillPanel({ skills, nuovaSkill, setNuovaSkill, aggiungiSkill, eliminaSkill }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: "#FFFDF9", border: "1px solid #E3D9C6" }}>
      <h2 className="text-sm font-semibold mb-3">Competenze del locale</h2>
      <div className="flex flex-wrap gap-2 mb-4">
        {skills.map((s, i) => {
          const c = PALETTE_SKILL[i % PALETTE_SKILL.length];
          return (
            <span key={s.id} className="inline-flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-full text-sm" style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}>
              {s.nome}
              <button onClick={() => eliminaSkill(s.id)} aria-label={`Elimina ${s.nome}`} className="opacity-70 hover:opacity-100">
                <X size={13} />
              </button>
            </span>
          );
        })}
        {skills.length === 0 && <p className="text-sm" style={{ color: "#8A7A63" }}>Nessuna skill ancora definita.</p>}
      </div>
      <div className="flex gap-2">
        <input
          value={nuovaSkill}
          onChange={(e) => setNuovaSkill(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && aggiungiSkill()}
          placeholder="es. colore, consegne, banco"
          className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
          style={{ border: "1px solid #D8CBB3", background: "#FFFFFF" }}
        />
        <button onClick={aggiungiSkill} className="px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1" style={{ background: "#3B2A20", color: "#FFFDF9" }}>
          <Plus size={15} /> Aggiungi
        </button>
      </div>
      <p className="text-xs mt-3" style={{ color: "#8A7A63" }}>Le skill create qui compaiono per la selezione sui dipendenti e sui requisiti del fabbisogno.</p>
    </div>
  );
}

// ---------------- Dipendenti ----------------
function DipendentiPanel({ dipendenti, skills, aggiungiDipendente, aggiornaDipendente, toggleSkillDipendente, eliminaDipendente, onApriAssenze }) {
  return (
    <div className="flex flex-col gap-3">
      {dipendenti.map((d) => (
        <div key={d.id} className="rounded-2xl p-4" style={{ background: "#FFFDF9", border: "1px solid #E3D9C6" }}>
          <div className="flex items-center gap-2 mb-3">
            <input
              value={d.nome}
              onChange={(e) => aggiornaDipendente(d.id, "nome", e.target.value)}
              className="flex-1 font-medium text-sm px-2 py-1.5 rounded-lg outline-none"
              style={{ border: "1px solid transparent", background: "transparent" }}
              onFocus={(e) => (e.target.style.border = "1px solid #D8CBB3")}
              onBlur={(e) => (e.target.style.border = "1px solid transparent")}
            />
            <button onClick={() => eliminaDipendente(d.id)} aria-label="Elimina dipendente" className="p-1.5 rounded-lg" style={{ color: "#B4708B" }}>
              <Trash2 size={15} />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <label className="text-xs" style={{ color: "#8A7A63" }}>
              Ore max / sett
              <input type="number" min={0} value={d.tettoOre} onChange={(e) => aggiornaDipendente(d.id, "tettoOre", Number(e.target.value) || 0)} className="w-full mt-1 px-2 py-1.5 rounded-lg text-sm" style={{ border: "1px solid #D8CBB3", color: "#3B2A20" }} />
            </label>
            <label className="text-xs" style={{ color: "#8A7A63" }}>
              Ore max / giorno
              <input type="number" min={0} max={24} value={d.oreMaxGiorno} onChange={(e) => aggiornaDipendente(d.id, "oreMaxGiorno", Number(e.target.value) || 0)} className="w-full mt-1 px-2 py-1.5 rounded-lg text-sm" style={{ border: "1px solid #D8CBB3", color: "#3B2A20" }} />
            </label>
            <label className="text-xs" style={{ color: "#8A7A63" }}>
              Giorni liberi min
              <input type="number" min={0} max={6} value={d.minGiorniLiberi} onChange={(e) => aggiornaDipendente(d.id, "minGiorniLiberi", Number(e.target.value) || 0)} className="w-full mt-1 px-2 py-1.5 rounded-lg text-sm" style={{ border: "1px solid #D8CBB3", color: "#3B2A20" }} />
            </label>
          </div>
          <label className="text-xs block mb-3" style={{ color: "#8A7A63" }}>
            Cellulare (per invio turni via WhatsApp)
            <input type="tel" value={d.telefono} onChange={(e) => aggiornaDipendente(d.id, "telefono", e.target.value)} placeholder="+39 333 1234567" className="w-full mt-1 px-2 py-1.5 rounded-lg text-sm" style={{ border: "1px solid #D8CBB3", color: "#3B2A20" }} />
          </label>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {skills.map((s, i) => {
              const attivo = d.skillIds.includes(s.id);
              const c = PALETTE_SKILL[i % PALETTE_SKILL.length];
              return (
                <button key={s.id} onClick={() => toggleSkillDipendente(d.id, s.id)} className="px-2.5 py-1 rounded-full text-xs" style={attivo ? { background: c.bg, color: c.text, border: `1px solid ${c.border}` } : { background: "transparent", color: "#8A7A63", border: "1px solid #E3D9C6" }}>
                  {s.nome}
                </button>
              );
            })}
            {skills.length === 0 && <span className="text-xs" style={{ color: "#8A7A63" }}>Crea prima delle skill.</span>}
          </div>
          <button onClick={() => onApriAssenze(d.id)} className="w-full py-1.5 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5" style={{ border: "1px solid #E3D9C6", color: "#7A5A1E" }}>
            <CalendarOff size={13} /> Ferie e permessi {d.assenze && d.assenze.length > 0 ? `(${d.assenze.length})` : ""}
          </button>
        </div>
      ))}
      <button onClick={aggiungiDipendente} className="w-full py-2.5 rounded-2xl text-sm font-medium flex items-center justify-center gap-1.5" style={{ border: "1px dashed #C9973F", color: "#7A5A1E" }}>
        <Plus size={15} /> Aggiungi dipendente
      </button>
    </div>
  );
}

// ---------------- Modale assenze (per dipendente) ----------------
function ModaleAssenze({ dipendente, onAggiungi, onElimina, onChiudi }) {
  const [tipo, setTipo] = useState("ferie");
  const [dataInizio, setDataInizio] = useState("");
  const [dataFine, setDataFine] = useState("");
  const [errore, setErrore] = useState("");

  if (!dipendente) return null;
  const lista = [...(dipendente.assenze || [])].sort((a, b) => a.dataInizio.localeCompare(b.dataInizio));

  function handleAggiungi() {
    if (!dataInizio || !dataFine) {
      setErrore("Indica data inizio e fine.");
      return;
    }
    if (dataFine < dataInizio) {
      setErrore("La data di fine non può precedere l'inizio.");
      return;
    }
    setErrore("");
    onAggiungi({ tipo, dataInizio, dataFine });
    setDataInizio("");
    setDataFine("");
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 z-10" style={{ background: "rgba(59,42,32,0.35)" }} onClick={onChiudi}>
      <div className="w-full max-w-sm rounded-2xl p-5" style={{ background: "#FFFDF9" }} onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold mb-3">Ferie e permessi — {dipendente.nome}</h3>

        <div className="flex flex-col gap-2 mb-4">
          {lista.length === 0 && <p className="text-xs" style={{ color: "#8A7A63" }}>Nessuna assenza registrata.</p>}
          {lista.map((a) => (
            <div key={a.id} className="flex items-center justify-between px-3 py-2 rounded-lg text-sm" style={{ background: "#F6E4E4" }}>
              <span style={{ color: "#8C3B3B" }}>
                {a.tipo} · {a.dataInizio}{a.dataFine !== a.dataInizio ? ` → ${a.dataFine}` : ""}
              </span>
              <button onClick={() => onElimina(a.id)} aria-label="Elimina assenza" style={{ color: "#8C3B3B" }}>
                <X size={14} />
              </button>
            </div>
          ))}
        </div>

        <p className="text-xs mb-2" style={{ color: "#8A7A63" }}>Nuova assenza</p>
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="w-full mb-2 px-2 py-1.5 rounded-lg text-sm" style={{ border: "1px solid #D8CBB3" }}>
          <option value="ferie">Ferie</option>
          <option value="permesso">Permesso</option>
          <option value="malattia">Malattia</option>
        </select>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <label className="text-xs" style={{ color: "#8A7A63" }}>
            Dal
            <input type="date" value={dataInizio} onChange={(e) => setDataInizio(e.target.value)} className="w-full mt-1 px-2 py-1.5 rounded-lg text-sm" style={{ border: "1px solid #D8CBB3" }} />
          </label>
          <label className="text-xs" style={{ color: "#8A7A63" }}>
            Al
            <input type="date" value={dataFine} onChange={(e) => setDataFine(e.target.value)} className="w-full mt-1 px-2 py-1.5 rounded-lg text-sm" style={{ border: "1px solid #D8CBB3" }} />
          </label>
        </div>
        {errore && <p className="text-xs mb-2" style={{ color: "#B4708B" }}>{errore}</p>}
        <button onClick={handleAggiungi} className="w-full py-1.5 rounded-lg text-sm font-medium mb-4" style={{ background: "#F3E7D3", color: "#7A5A1E" }}>
          <Plus size={13} style={{ display: "inline", marginRight: 4, verticalAlign: -2 }} /> Aggiungi assenza
        </button>

        <div className="flex justify-end">
          <button onClick={onChiudi} className="px-3 py-1.5 rounded-lg text-sm" style={{ border: "1px solid #D8CBB3" }}>Chiudi</button>
        </div>
      </div>
    </div>
  );
}

// ---------------- Calendario Fabbisogno ----------------
function CalendarioFabbisogno({ fabbisogno, skills, giorniSettimana, onApriModale, onDuplicaGiorno, onDuplicaFascia, onApriRicorrenza }) {
  const ore = Array.from({ length: ORA_FINE_CAL - ORA_INIZIO_CAL }, (_, i) => ORA_INIZIO_CAL + i);
  const altezzaTot = ore.length * PX_ORA;

  function posizione(f) {
    const top = ((toMin(f.oraInizio) - ORA_INIZIO_CAL * 60) / 60) * PX_ORA;
    const height = ((toMin(f.oraFine) - toMin(f.oraInizio)) / 60) * PX_ORA;
    return { top, height: Math.max(height, 20) };
  }

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "#FFFDF9", border: "1px solid #E3D9C6" }}>
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "#E3D9C6" }}>
        <h2 className="text-sm font-semibold">Fabbisogno settimanale</h2>
        <button onClick={onApriRicorrenza} className="text-xs font-medium flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg" style={{ background: "#F3E7D3", color: "#7A5A1E" }}>
          <Repeat size={13} /> Ripeti settimana
        </button>
      </div>
      <div className="overflow-x-auto">
        <div className="flex" style={{ minWidth: 640 }}>
          <div style={{ width: 42, flexShrink: 0 }}>
            <div style={{ height: 34 }} />
            {ore.map((h) => (
              <div key={h} style={{ height: PX_ORA }} className="text-[10px] text-right pr-1 relative">
                <span style={{ position: "relative", top: -6, color: "#B0A288" }}>{h}:00</span>
              </div>
            ))}
          </div>
          {giorniSettimana.map((giornoDate) => {
            const data = fmtData(giornoDate);
            const fasceGiorno = fabbisogno.filter((f) => f.data === data);
            return (
              <div key={data} style={{ width: 86, flexShrink: 0 }} className="border-l">
                <div className="flex items-center justify-between gap-0.5 px-1" style={{ height: 34, borderBottom: "1px solid #E3D9C6" }}>
                  <span className="text-xs font-medium">{etichettaGiorno(giornoDate)}</span>
                  <div className="flex gap-0.5">
                    <button onClick={() => onDuplicaGiorno(data)} disabled={fasceGiorno.length === 0} aria-label="Clona giorno" title="Clona su altri giorni" className="w-5 h-5 rounded-md flex items-center justify-center disabled:opacity-30" style={{ background: "#EFE1E7", color: "#7A3D53" }}>
                      <Copy size={11} />
                    </button>
                    <button onClick={() => onApriModale({ data })} aria-label="Aggiungi fascia" className="w-5 h-5 rounded-md flex items-center justify-center" style={{ background: "#F3E7D3", color: "#7A5A1E" }}>
                      <Plus size={12} />
                    </button>
                  </div>
                </div>
                <div className="relative" style={{ height: altezzaTot, borderLeft: "1px solid #EFE6D6" }}>
                  {ore.map((h, i) => (
                    <div key={h} style={{ position: "absolute", top: i * PX_ORA, width: "100%", height: PX_ORA, borderBottom: "1px solid #F2EBDD" }} />
                  ))}
                  {fasceGiorno.map((f) => {
                    const { top, height } = posizione(f);
                    const primoReq = f.requisiti[0];
                    const c = primoReq ? coloreSkill(primoReq.skillId, skills) : PALETTE_SKILL[0];
                    return (
                      <div key={f.id} className="absolute left-0.5 right-0.5 rounded-lg overflow-hidden" style={{ top, height, background: c.bg, border: `1px solid ${c.border}` }}>
                        <button onClick={() => onApriModale(f)} className="w-full h-full text-left px-1.5 py-1">
                          <div className="text-[10px] font-medium leading-tight" style={{ color: c.text }}>{f.oraInizio}–{f.oraFine}</div>
                          <div className="text-[9px] leading-tight pr-3" style={{ color: c.text }}>
                            {f.requisiti.map((r) => {
                              const sk = skills.find((s) => s.id === r.skillId);
                              return `${sk ? sk.nome : "?"}×${r.numero}`;
                            }).join(" · ")}
                          </div>
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); onDuplicaFascia(f); }} aria-label="Clona fascia" title="Clona questa fascia" className="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded flex items-center justify-center" style={{ background: "rgba(255,255,255,0.6)", color: c.text }}>
                          <Copy size={9} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------- Modale ricorrenza settimana ----------------
function ModaleRicorrenza({ settimanaVista, onConferma, onChiudi }) {
  const minSettimana = stringaSettimanaISO(addSettimane(settimanaVista, 1));
  const [finoA, setFinoA] = useState("");

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 z-10" style={{ background: "rgba(59,42,32,0.35)" }} onClick={onChiudi}>
      <div className="w-full max-w-sm rounded-2xl p-5" style={{ background: "#FFFDF9" }} onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold mb-1">Ripeti questa settimana</h3>
        <p className="text-xs mb-4" style={{ color: "#8A7A63" }}>
          Crea copie indipendenti del fabbisogno di questa settimana, ripetute ogni settimana fino a quella scelta. Le settimane già popolate vengono saltate automaticamente.
        </p>
        <label className="text-xs block mb-4" style={{ color: "#8A7A63" }}>
          Fino alla settimana
          <input type="week" min={minSettimana} value={finoA} onChange={(e) => setFinoA(e.target.value)} className="w-full mt-1 px-2 py-1.5 rounded-lg text-sm" style={{ border: "1px solid #D8CBB3" }} />
        </label>
        <div className="flex justify-end gap-2">
          <button onClick={onChiudi} className="px-3 py-1.5 rounded-lg text-sm" style={{ border: "1px solid #D8CBB3" }}>Annulla</button>
          <button onClick={() => finoA && onConferma(finoA)} disabled={!finoA} className="px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-40" style={{ background: "#3B2A20", color: "#FFFDF9" }}>
            Duplica
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------- Modale duplica (giorno/fascia) ----------------
function ModaleDuplica({ dato, giorniSettimana, onConferma, onChiudi }) {
  const [selezionati, setSelezionati] = useState([]);
  const giorniDisponibili = giorniSettimana.filter((d) => fmtData(d) !== dato.data);

  function toggle(dataStr) {
    setSelezionati((prev) => (prev.includes(dataStr) ? prev.filter((x) => x !== dataStr) : [...prev, dataStr]));
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 z-10" style={{ background: "rgba(59,42,32,0.35)" }} onClick={onChiudi}>
      <div className="w-full max-w-sm rounded-2xl p-5" style={{ background: "#FFFDF9" }} onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold mb-1">
          {dato.tipo === "giorno" ? "Clona il giorno su..." : `Clona fascia ${dato.fascia.oraInizio}–${dato.fascia.oraFine} su...`}
        </h3>
        <p className="text-xs mb-3" style={{ color: "#8A7A63" }}>Solo all'interno della settimana in vista.</p>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {giorniDisponibili.map((d) => {
            const ds = fmtData(d);
            return (
              <button key={ds} onClick={() => toggle(ds)} className="px-3 py-1.5 rounded-full text-xs" style={selezionati.includes(ds) ? { background: "#C9973F", color: "#FFFDF9" } : { background: "transparent", color: "#6E5A40", border: "1px solid #E3D9C6" }}>
                {etichettaGiorno(d)}
              </button>
            );
          })}
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onChiudi} className="px-3 py-1.5 rounded-lg text-sm" style={{ border: "1px solid #D8CBB3" }}>Annulla</button>
          <button onClick={() => onConferma(dato, selezionati)} disabled={selezionati.length === 0} className="px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-40" style={{ background: "#3B2A20", color: "#FFFDF9" }}>
            Duplica
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------- Modale fascia ----------------
function ModaleFascia({ dato, skills, giorniSettimana, onSalva, onElimina, onChiudi }) {
  const esistente = !!dato.id;
  const [data, setData] = useState(dato.data);
  const [oraInizio, setOraInizio] = useState(dato.oraInizio || "09:00");
  const [oraFine, setOraFine] = useState(dato.oraFine || "13:00");
  const [requisiti, setRequisiti] = useState(dato.requisiti || (skills[0] ? [{ skillId: skills[0].id, numero: 1 }] : []));

  function aggiornaReq(i, campo, val) {
    setRequisiti(requisiti.map((r, idx) => (idx === i ? { ...r, [campo]: val } : r)));
  }
  function aggiungiReq() {
    if (!skills[0]) return;
    setRequisiti([...requisiti, { skillId: skills[0].id, numero: 1 }]);
  }
  function rimuoviReq(i) {
    setRequisiti(requisiti.filter((_, idx) => idx !== i));
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 z-10" style={{ background: "rgba(59,42,32,0.35)" }} onClick={onChiudi}>
      <div className="w-full max-w-sm rounded-2xl p-5" style={{ background: "#FFFDF9" }} onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold mb-3">{esistente ? "Modifica fascia" : "Nuova fascia"}</h3>

        <div className="grid grid-cols-2 gap-2 mb-3">
          <select value={data} onChange={(e) => setData(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm col-span-2" style={{ border: "1px solid #D8CBB3" }}>
            {giorniSettimana.map((d) => {
              const ds = fmtData(d);
              return <option key={ds} value={ds}>{etichettaGiorno(d)}</option>;
            })}
          </select>
          <input type="time" value={oraInizio} onChange={(e) => setOraInizio(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm" style={{ border: "1px solid #D8CBB3" }} />
          <input type="time" value={oraFine} onChange={(e) => setOraFine(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm" style={{ border: "1px solid #D8CBB3" }} />
        </div>

        <p className="text-xs mb-2" style={{ color: "#8A7A63" }}>Requisiti (skill + numero persone)</p>
        <div className="flex flex-col gap-2 mb-2">
          {requisiti.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <select value={r.skillId} onChange={(e) => aggiornaReq(i, "skillId", e.target.value)} className="flex-1 px-2 py-1.5 rounded-lg text-sm" style={{ border: "1px solid #D8CBB3" }}>
                {skills.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
              <input type="number" min={1} value={r.numero} onChange={(e) => aggiornaReq(i, "numero", Number(e.target.value) || 1)} className="w-14 px-2 py-1.5 rounded-lg text-sm" style={{ border: "1px solid #D8CBB3" }} />
              <button onClick={() => rimuoviReq(i)} aria-label="Rimuovi requisito" style={{ color: "#B4708B" }}><X size={15} /></button>
            </div>
          ))}
          {skills.length === 0 && <p className="text-xs" style={{ color: "#8A7A63" }}>Crea prima delle skill nel tab dedicato.</p>}
        </div>
        <button onClick={aggiungiReq} disabled={!skills.length} className="text-xs font-medium flex items-center gap-1 mb-4" style={{ color: "#7A5A1E" }}>
          <Plus size={13} /> requisito
        </button>

        <div className="flex justify-between items-center">
          {esistente ? (
            <button onClick={() => onElimina(dato.id)} className="text-xs font-medium flex items-center gap-1" style={{ color: "#B4708B" }}>
              <Trash2 size={13} /> Elimina
            </button>
          ) : <div />}
          <div className="flex gap-2">
            <button onClick={onChiudi} className="px-3 py-1.5 rounded-lg text-sm" style={{ border: "1px solid #D8CBB3" }}>Annulla</button>
            <button onClick={() => onSalva({ id: dato.id, data, oraInizio, oraFine, requisiti })} disabled={toMin(oraFine) <= toMin(oraInizio) || requisiti.length === 0} className="px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-40" style={{ background: "#3B2A20", color: "#FFFDF9" }}>
              Salva
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------- Priorità ----------------
function PrioritaPanel({ skills, dipendenti, prioritaSync, spostaPriorita }) {
  if (skills.length === 0) return <p className="text-sm" style={{ color: "#8A7A63" }}>Crea delle skill per definire l'ordine di priorità.</p>;
  return (
    <div className="flex flex-col gap-3">
      {skills.map((sk, si) => {
        const lista = prioritaSync[sk.id] || [];
        const c = PALETTE_SKILL[si % PALETTE_SKILL.length];
        return (
          <div key={sk.id} className="rounded-2xl p-4" style={{ background: "#FFFDF9", border: "1px solid #E3D9C6" }}>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: c.border }} />
              <h3 className="text-sm font-semibold">{sk.nome}</h3>
            </div>
            {lista.length === 0 ? (
              <p className="text-xs" style={{ color: "#8A7A63" }}>Nessun dipendente con questa skill.</p>
            ) : (
              lista.map((id, i) => {
                const d = dipendenti.find((x) => x.id === id);
                if (!d) return null;
                return (
                  <div key={id} className="flex items-center gap-2 py-1.5" style={{ borderTop: i > 0 ? "1px solid #F2EBDD" : "none" }}>
                    <span className="text-xs w-4" style={{ color: "#B0A288" }}>{i + 1}</span>
                    <span className="flex-1 text-sm">{d.nome}</span>
                    <button onClick={() => spostaPriorita(sk.id, i, -1)} disabled={i === 0} className="p-1 rounded disabled:opacity-30"><ChevronUp size={15} /></button>
                    <button onClick={() => spostaPriorita(sk.id, i, 1)} disabled={i === lista.length - 1} className="p-1 rounded disabled:opacity-30"><ChevronDown size={15} /></button>
                  </div>
                );
              })
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------- Export & WhatsApp ----------------
function esportaExcel(risultato, dipendenti, skills) {
  const righe = [...risultato.assegnazioni]
    .sort((a, b) => a.data.localeCompare(b.data) || toMin(a.oraInizio) - toMin(b.oraInizio))
    .map((a) => {
      const d = dipendenti.find((x) => x.id === a.dipendenteId);
      const sk = skills.find((x) => x.id === a.skillId);
      return { Data: a.data, Dalle: a.oraInizio, Alle: a.oraFine, Dipendente: d ? d.nome : "?", Skill: sk ? sk.nome : "?", Continuazione: a.continuazione ? "sì" : "" };
    });
  const ws = XLSX.utils.json_to_sheet(righe);
  ws["!cols"] = [{ wch: 11 }, { wch: 7 }, { wch: 7 }, { wch: 16 }, { wch: 14 }, { wch: 12 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Turni");
  if (risultato.scoperture.length > 0) {
    const wsScoperte = XLSX.utils.json_to_sheet(
      risultato.scoperture.map((s) => ({ Data: s.data, Dalle: s.oraInizio, Alle: s.oraFine, Skill: (skills.find((x) => x.id === s.skillId) || {}).nome || "?", Mancanti: s.mancanti }))
    );
    XLSX.utils.book_append_sheet(wb, wsScoperte, "Scoperture");
  }
  const lunSett = parseData(risultato.settimanaData);
  XLSX.writeFile(wb, `turni_settimana_${numeroSettimanaISO(lunSett)}_${annoISO(lunSett)}.xlsx`);
}

function messaggioWhatsapp(dipendente, risultato, skills) {
  const miei = risultato.assegnazioni.filter((a) => a.dipendenteId === dipendente.id).sort((a, b) => a.data.localeCompare(b.data) || toMin(a.oraInizio) - toMin(b.oraInizio));
  if (miei.length === 0) return `Ciao ${dipendente.nome}, questa settimana non hai turni assegnati.`;
  const righe = miei.map((a) => {
    const sk = skills.find((x) => x.id === a.skillId);
    return `${etichettaGiorno(parseData(a.data))} ${a.oraInizio}-${a.oraFine} (${sk ? sk.nome : "?"})`;
  });
  return `Ciao ${dipendente.nome}, ecco i tuoi turni per la settimana:\n${righe.join("\n")}`;
}
function linkWhatsapp(dipendente, risultato, skills) {
  const numero = (dipendente.telefono || "").replace(/[^\d+]/g, "");
  const testo = encodeURIComponent(messaggioWhatsapp(dipendente, risultato, skills));
  return `https://wa.me/${numero.replace("+", "")}?text=${testo}`;
}

// ---------------- KPI ----------------
function KPIPanel({ risultato, dipendenti, fabbisognoSettimana }) {
  if (fabbisognoSettimana.length === 0 && !risultato) {
    return (
      <div className="rounded-2xl p-4 flex items-start gap-2" style={{ background: "#FFFDF9", border: "1px solid #E3D9C6" }}>
        <Info size={15} style={{ color: "#8A7A63", flexShrink: 0, marginTop: 1 }} />
        <p className="text-sm" style={{ color: "#8A7A63" }}>
          Nessun fabbisogno né proposta per questa settimana. Vai nel tab Fabbisogno per definirlo, poi genera la proposta nel tab Genera.
        </p>
      </div>
    );
  }
  if (!risultato) {
    return (
      <div className="rounded-2xl p-4 flex items-start gap-2" style={{ background: "#FFFDF9", border: "1px solid #E3D9C6" }}>
        <Info size={15} style={{ color: "#8A7A63", flexShrink: 0, marginTop: 1 }} />
        <p className="text-sm" style={{ color: "#8A7A63" }}>
          C'è fabbisogno per questa settimana ma non è ancora stata generata una proposta. Vai nel tab Genera.
        </p>
      </div>
    );
  }

  const totaleAssegnati = risultato.assegnazioni.length;
  const totaleMancanti = risultato.scoperture.reduce((s, x) => s + x.mancanti, 0);
  const totaleRichiesti = totaleAssegnati + totaleMancanti;
  const copertura = totaleRichiesti > 0 ? Math.round((totaleAssegnati / totaleRichiesti) * 100) : 100;
  const oreTotali = Object.values(risultato.oreSettimana).reduce((s, x) => s + x, 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl p-4" style={{ background: copertura === 100 ? "#E4EDE3" : "#F6E4E4", border: `1px solid ${copertura === 100 ? "#B7D2AE" : "#E0AFAF"}` }}>
          <div className="text-xs mb-1" style={{ color: copertura === 100 ? "#3C5E33" : "#8C3B3B" }}>Copertura fasce</div>
          <div className="text-2xl font-semibold" style={{ color: copertura === 100 ? "#3C5E33" : "#8C3B3B" }}>{copertura}%</div>
        </div>
        <div className="rounded-2xl p-4" style={{ background: "#F3E7D3", border: "1px solid #E3D2A8" }}>
          <div className="text-xs mb-1" style={{ color: "#7A5A1E" }}>Ore totali assegnate</div>
          <div className="text-2xl font-semibold" style={{ color: "#7A5A1E" }}>{oreTotali}h</div>
        </div>
        <div className="rounded-2xl p-4" style={{ background: "#DEE6EE", border: "1px solid #B9CCE0" }}>
          <div className="text-xs mb-1" style={{ color: "#33506F" }}>Fasce scoperte</div>
          <div className="text-2xl font-semibold" style={{ color: "#33506F" }}>{risultato.scoperture.length}</div>
        </div>
        <div className="rounded-2xl p-4" style={{ background: "#EFE1E7", border: "1px solid #E0C3D0" }}>
          <div className="text-xs mb-1" style={{ color: "#7A3D53" }}>Persone impiegate</div>
          <div className="text-2xl font-semibold" style={{ color: "#7A3D53" }}>{Object.values(risultato.oreSettimana).filter((h) => h > 0).length}</div>
        </div>
      </div>

      <div className="rounded-2xl p-4" style={{ background: "#FFFDF9", border: "1px solid #E3D9C6" }}>
        <div className="flex items-center gap-1.5 text-sm font-semibold mb-3">
          <Gauge size={15} style={{ color: "#8A7A63" }} /> Ore per dipendente vs tetto settimanale
        </div>
        {dipendenti.map((d) => {
          const ore = risultato.oreSettimana[d.id] || 0;
          const pct = Math.min(100, Math.round((ore / (d.tettoOre || 1)) * 100));
          const sopraSoglia = ore > d.tettoOre;
          const c = coloreDipendente(d.id, dipendenti);
          return (
            <div key={d.id} className="mb-2.5">
              <div className="flex items-center gap-1.5 text-xs mb-1">
                <span className="w-2 h-2 rounded-full" style={{ background: c.border }} />
                <span className="flex-1">{d.nome}</span>
                <span style={{ color: sopraSoglia ? "#8C3B3B" : "#8A7A63" }}>{ore} / {d.tettoOre} h {sopraSoglia ? "⚠" : ""}</span>
              </div>
              <div className="h-1.5 rounded-full" style={{ background: "#EFE6D6" }}>
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: sopraSoglia ? "#C97A7A" : c.border }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------- Genera ----------------
function GeneraPanel({ dipendenti, skills, risultato, onGenera, giorniSettimana, haFabbisogno, generando }) {
  const ore = Array.from({ length: ORA_FINE_CAL - ORA_INIZIO_CAL }, (_, i) => ORA_INIZIO_CAL + i);
  const altezzaTot = ore.length * PX_ORA;

  return (
    <div>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #stampa-turni, #stampa-turni * { visibility: visible; }
          #stampa-turni { position: absolute; top: 0; left: 0; width: 100%; }
          .no-print { display: none !important; }
        }
      `}</style>

      <button
        onClick={onGenera}
        disabled={!haFabbisogno || generando}
        title={!haFabbisogno ? "Aggiungi prima del fabbisogno per questa settimana, nel tab Fabbisogno" : "Genera/rigenera la proposta per questa settimana e le 4 successive"}
        className="w-full py-2.5 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 mb-1 no-print disabled:opacity-40"
        style={{ background: "#3B2A20", color: "#FFFDF9" }}
      >
        <RefreshCw size={15} className={generando ? "animate-spin" : ""} /> {generando ? "Generazione in corso…" : "Genera questa settimana + 4 successive"}
      </button>
      {!haFabbisogno && (
        <p className="text-xs mb-4 no-print flex items-center gap-1" style={{ color: "#8A7A63" }}>
          <Info size={12} /> Nessun fabbisogno per questa settimana: vai nel tab Fabbisogno e aggiungine, oppure spostati su un'altra settimana.
        </p>
      )}
      {haFabbisogno && !risultato && (
        <p className="text-xs mb-4 no-print flex items-center gap-1" style={{ color: "#8A7A63" }}>
          <Info size={12} /> Fabbisogno presente: tocca "Genera" per creare la proposta di questa settimana e delle 4 successive (le settimane senza fabbisogno vengono saltate).
        </p>
      )}
      {risultato && <div className="mb-3" />}

      {risultato && (
        <div className="flex flex-col gap-4">
          <div className="flex gap-2 no-print">
            <button onClick={() => window.print()} className="flex-1 py-2 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5" style={{ border: "1px solid #D8CBB3", color: "#3B2A20" }}>
              <Printer size={13} /> PDF (stampa)
            </button>
            <button onClick={() => esportaExcel(risultato, dipendenti, skills)} className="flex-1 py-2 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5" style={{ border: "1px solid #D8CBB3", color: "#3B2A20" }}>
              <FileSpreadsheet size={13} /> Excel
            </button>
          </div>

          <div id="stampa-turni">
            {risultato.scoperture.length > 0 ? (
              <div className="rounded-xl p-3 mb-3" style={{ background: "#F6E4E4", border: "1px solid #E0AFAF" }}>
                <div className="flex items-center gap-1.5 text-sm font-medium mb-1.5" style={{ color: "#8C3B3B" }}><AlertTriangle size={14} /> {risultato.scoperture.length} fasce scoperte</div>
                {risultato.scoperture.map((s, i) => {
                  const sk = skills.find((x) => x.id === s.skillId);
                  return <div key={i} className="text-xs" style={{ color: "#8C3B3B" }}>{etichettaGiorno(parseData(s.data))} {s.oraInizio}-{s.oraFine} · {sk ? sk.nome : "?"} (mancano {s.mancanti})</div>;
                })}
              </div>
            ) : (
              <div className="rounded-xl p-3 mb-3 flex items-center gap-1.5 text-sm" style={{ background: "#E4EDE3", color: "#3C5E33", border: "1px solid #B7D2AE" }}><Check size={14} /> Copertura completa.</div>
            )}

            <div className="rounded-2xl overflow-hidden mb-4" style={{ background: "#FFFDF9", border: "1px solid #E3D9C6" }}>
              <div className="px-4 py-3 border-b" style={{ borderColor: "#E3D9C6" }}>
                <h2 className="text-sm font-semibold">Proposta — Sett. {numeroSettimanaISO(parseData(risultato.settimanaData))} · {annoISO(parseData(risultato.settimanaData))}</h2>
              </div>
              <div className="overflow-x-auto">
                <div className="flex" style={{ minWidth: 640 }}>
                  <div style={{ width: 42, flexShrink: 0 }}>
                    <div style={{ height: 26 }} />
                    {ore.map((h) => (
                      <div key={h} style={{ height: PX_ORA }} className="text-[10px] text-right pr-1 relative">
                        <span style={{ position: "relative", top: -6, color: "#B0A288" }}>{h}:00</span>
                      </div>
                    ))}
                  </div>
                  {giorniSettimana.map((giornoDate) => {
                    const data = fmtData(giornoDate);
                    const turniGiorno = risultato.assegnazioni.filter((a) => a.data === data);
                    const scoperteGiorno = risultato.scoperture.filter((s) => s.data === data);
                    // Raggruppa per fascia oraria, così le persone/richieste simultanee si dispongono affiancate invece di sovrapporsi
                    const gruppi = {};
                    turniGiorno.forEach((a) => {
                      const k = `${a.oraInizio}|${a.oraFine}`;
                      gruppi[k] = gruppi[k] || { oraInizio: a.oraInizio, oraFine: a.oraFine, assegnati: [], scoperti: [] };
                      gruppi[k].assegnati.push(a);
                    });
                    scoperteGiorno.forEach((s) => {
                      const k = `${s.oraInizio}|${s.oraFine}`;
                      gruppi[k] = gruppi[k] || { oraInizio: s.oraInizio, oraFine: s.oraFine, assegnati: [], scoperti: [] };
                      gruppi[k].scoperti.push(s);
                    });
                    return (
                      <div key={data} style={{ width: 86, flexShrink: 0 }} className="border-l">
                        <div className="flex items-center justify-center" style={{ height: 26, borderBottom: "1px solid #E3D9C6" }}>
                          <span className="text-xs font-medium">{etichettaGiorno(giornoDate)}</span>
                        </div>
                        <div className="relative" style={{ height: altezzaTot, borderLeft: "1px solid #EFE6D6" }}>
                          {ore.map((h, i) => (
                            <div key={h} style={{ position: "absolute", top: i * PX_ORA, width: "100%", height: PX_ORA, borderBottom: "1px solid #F2EBDD" }} />
                          ))}
                          {Object.values(gruppi).map((g, gi) => {
                            const top = ((toMin(g.oraInizio) - ORA_INIZIO_CAL * 60) / 60) * PX_ORA;
                            const height = Math.max(((toMin(g.oraFine) - toMin(g.oraInizio)) / 60) * PX_ORA, 20);
                            const colonne = [...g.assegnati.map((a) => ({ tipo: "assegnato", a })), ...g.scoperti.map((s) => ({ tipo: "scoperto", s }))];
                            const nCol = colonne.length || 1;
                            return (
                              <div key={gi} className="absolute left-0.5 right-0.5 flex gap-0.5" style={{ top, height }}>
                                {colonne.map((col, ci) => {
                                  if (col.tipo === "assegnato") {
                                    const a = col.a;
                                    const d = dipendenti.find((x) => x.id === a.dipendenteId);
                                    const sk = skills.find((x) => x.id === a.skillId);
                                    const c = coloreDipendente(a.dipendenteId, dipendenti);
                                    return (
                                      <div key={ci} className="rounded-lg px-1 py-1 overflow-hidden" style={{ width: `${100 / nCol}%`, height: "100%", background: c.bg, border: `1px solid ${c.border}` }}>
                                        <div className="text-[9px] font-medium leading-tight truncate" style={{ color: c.text }}>{d ? d.nome : "?"}{a.continuazione ? " ↳" : ""}</div>
                                        <div className="text-[8px] leading-tight truncate" style={{ color: c.text }}>{sk ? sk.nome : "?"}</div>
                                      </div>
                                    );
                                  }
                                  const s = col.s;
                                  const sk = skills.find((x) => x.id === s.skillId);
                                  return (
                                    <div key={ci} className="rounded-lg flex flex-col items-center justify-center text-center px-0.5" style={{ width: `${100 / nCol}%`, height: "100%", background: "repeating-linear-gradient(45deg,#F6E4E4,#F6E4E4 4px,#F0D3D3 4px,#F0D3D3 8px)", border: "1px dashed #C97A7A" }}>
                                      <AlertTriangle size={10} style={{ color: "#8C3B3B" }} />
                                      <span className="text-[8px] leading-tight" style={{ color: "#8C3B3B" }}>{sk ? sk.nome : "?"}×{s.mancanti}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="mb-4">
              <div className="text-xs font-medium mb-2" style={{ color: "#8A7A63" }}>Ore assegnate questa settimana</div>
              {dipendenti.map((d) => {
                const oreDip = risultato.oreSettimana[d.id] || 0;
                const pct = Math.min(100, Math.round((oreDip / (d.tettoOre || 1)) * 100));
                const c = coloreDipendente(d.id, dipendenti);
                return (
                  <div key={d.id} className="mb-2">
                    <div className="flex items-center gap-1.5 text-xs mb-1">
                      <span className="w-2 h-2 rounded-full" style={{ background: c.border }} />
                      <span className="flex-1">{d.nome}</span>
                      <span style={{ color: "#8A7A63" }}>{oreDip} / {d.tettoOre} h</span>
                    </div>
                    <div className="h-1.5 rounded-full" style={{ background: "#EFE6D6" }}>
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: c.border }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="no-print">
            <div className="text-xs font-medium mb-2" style={{ color: "#8A7A63" }}>Invia turni via WhatsApp</div>
            <div className="flex flex-col gap-1.5">
              {dipendenti.map((d) => {
                const haTurni = risultato.assegnazioni.some((a) => a.dipendenteId === d.id);
                const haTelefono = !!d.telefono.trim();
                return (
                  <a key={d.id} href={haTelefono ? linkWhatsapp(d, risultato, skills) : undefined} target="_blank" rel="noreferrer" className="flex items-center justify-between px-3 py-2 rounded-xl text-sm" style={{ background: "#FFFDF9", border: "1px solid #E3D9C6", opacity: haTelefono && haTurni ? 1 : 0.5, pointerEvents: haTelefono && haTurni ? "auto" : "none" }}>
                    <span>{d.nome}</span>
                    <span className="flex items-center gap-1.5 text-xs" style={{ color: "#3C5E33" }}>
                      <MessageCircle size={14} />
                      {!haTelefono ? "manca numero" : !haTurni ? "nessun turno" : "invia"}
                    </span>
                  </a>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
