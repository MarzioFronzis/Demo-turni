import { addGiorni, fmtData, toMin, durataOre, sovrapposte } from "./date";

export function inAssenza(dip, dataStr) {
  return (dip.assenze || []).some((a) => dataStr >= a.dataInizio && dataStr <= a.dataFine);
}

// La fascia f rientra interamente in una delle fasce orarie preferite del dipendente?
// Se il dipendente non ha preferenze abilitate, è sempre considerata "conforme" (nessun filtro).
export function rientraNellePreferenze(dip, f) {
  if (!dip.preferenzeOrarie?.abilitato) return true;
  const fasce = dip.preferenzeOrarie.fasce || [];
  if (fasce.length === 0) return true;
  return fasce.some((p) => toMin(p.oraInizio) <= toMin(f.oraInizio) && toMin(p.oraFine) >= toMin(f.oraFine));
}

export function calcolaPrioritaSync(skills, dipendenti, prioritaMappa) {
  const p = {};
  skills.forEach((sk) => {
    const salvato = (prioritaMappa[sk.id] && prioritaMappa[sk.id].ordine) || [];
    const attuali = salvato.filter((id) => dipendenti.some((d) => d.id === id));
    dipendenti.forEach((d) => {
      if ((d.skillIds || []).includes(sk.id) && !attuali.includes(d.id)) attuali.push(d.id);
    });
    p[sk.id] = attuali;
  });
  return p;
}

// Calcola la proposta per UNA settimana (lunedì = Date). Ritorna null se non c'è fabbisogno.
export function calcolaProposta(lunediSettimanaTarget, fabbisogno, dipendenti, prioritaSync) {
  const dateSettimana = Array.from({ length: 7 }, (_, i) => fmtData(addGiorni(lunediSettimanaTarget, i)));
  const assegnazioni = [];
  const oreSettimana = {};
  const oreGiorno = {};
  const giorniLavorati = {};
  dipendenti.forEach((d) => {
    oreSettimana[d.id] = 0;
    oreGiorno[d.id] = {};
    giorniLavorati[d.id] = new Set();
  });
  const scoperture = [];

  const ordinati = dateSettimana
    .map((data) => fabbisogno.filter((f) => f.data === data).sort((a, b) => toMin(a.oraInizio) - toMin(b.oraInizio)))
    .flat();

  if (ordinati.length === 0) return null;

  ordinati.forEach((f) => {
    const durata = durataOre(f);
    const assegnazioniPrecedenti = assegnazioni.filter((a) => a.data === f.data && a.oraFine === f.oraInizio);
    const usatiQuestaFascia = new Set();

    (f.requisiti || []).forEach((req) => {
      const lista = prioritaSync[req.skillId] || [];
      let assegnati = 0;
      const idoneo = (dipId) => {
        if (usatiQuestaFascia.has(dipId)) return false;
        const d = dipendenti.find((x) => x.id === dipId);
        if (!d || !(d.skillIds || []).includes(req.skillId)) return false;
        if (inAssenza(d, f.data)) return false;
        const turniStessoGiorno = assegnazioni.filter((a) => a.dipendenteId === dipId && a.data === f.data);
        if (turniStessoGiorno.some((a) => sovrapposte(a, f))) return false;
        if (oreSettimana[dipId] + durata > (d.tettoOre ?? 9999)) return false;
        if ((oreGiorno[dipId][f.data] || 0) + durata > (d.oreMaxGiorno ?? 24)) return false;
        if (!giorniLavorati[dipId].has(f.data)) {
          const potenziali = giorniLavorati[dipId].size + 1;
          if (7 - potenziali < (d.minGiorniLiberi ?? 0)) return false;
        }
        if (d.preferenzeOrarie?.abilitato && d.preferenzeOrarie.tolleranza === "rigida" && !rientraNellePreferenze(d, f)) return false;
        return true;
      };
      const assegna = (dipId) => {
        const continuazione = assegnazioniPrecedenti.some((a) => a.dipendenteId === dipId);
        assegnazioni.push({ fabId: f.id, data: f.data, oraInizio: f.oraInizio, oraFine: f.oraFine, skillId: req.skillId, dipendenteId: dipId, continuazione });
        oreSettimana[dipId] += durata;
        oreGiorno[dipId][f.data] = (oreGiorno[dipId][f.data] || 0) + durata;
        giorniLavorati[dipId].add(f.data);
        usatiQuestaFascia.add(dipId);
        assegnati++;
      };

      const candidatiContinuita = assegnazioniPrecedenti
        .map((a) => a.dipendenteId)
        .filter((id, i, arr) => arr.indexOf(id) === i && idoneo(id))
        .sort((a, b) => lista.indexOf(a) - lista.indexOf(b));
      for (const dipId of candidatiContinuita) {
        if (assegnati >= req.numero) break;
        assegna(dipId);
      }
      // Prima passata: rispetta chi ha una preferenza "morbida" e rientra nella fascia preferita
      for (const dipId of lista) {
        if (assegnati >= req.numero) break;
        if (!idoneo(dipId)) continue;
        const d = dipendenti.find((x) => x.id === dipId);
        if (d.preferenzeOrarie?.abilitato && d.preferenzeOrarie.tolleranza === "preferenza" && !rientraNellePreferenze(d, f)) continue;
        assegna(dipId);
      }
      // Seconda passata: se restano posti scoperti, ripesca anche chi preferirebbe un altro orario
      for (const dipId of lista) {
        if (assegnati >= req.numero) break;
        if (usatiQuestaFascia.has(dipId)) continue;
        if (!idoneo(dipId)) continue;
        assegna(dipId);
      }
      if (assegnati < req.numero) {
        scoperture.push({ data: f.data, oraInizio: f.oraInizio, oraFine: f.oraFine, skillId: req.skillId, mancanti: req.numero - assegnati });
      }
    });
  });

  return { assegnazioni, scoperture, oreSettimana, settimanaData: fmtData(lunediSettimanaTarget) };
}
