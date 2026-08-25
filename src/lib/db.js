import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  setDoc,
  getDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import { COLL } from "./collections";

// ---------- Skill ----------
export const aggiungiSkill = (nome) => addDoc(collection(db, COLL.skills), { nome });
export const eliminaSkill = (id) => deleteDoc(doc(db, COLL.skills, id));

// ---------- Dipendenti ----------
export const aggiungiDipendente = (dip) => addDoc(collection(db, COLL.dipendenti), dip);
export const aggiornaDipendente = (id, campi) => updateDoc(doc(db, COLL.dipendenti, id), campi);
export const eliminaDipendente = (id) => deleteDoc(doc(db, COLL.dipendenti, id));

export async function aggiungiAssenza(dipendenteId, dipendenteAttuale, assenza) {
  const nuove = [...(dipendenteAttuale.assenze || []), { ...assenza, id: `a${Date.now()}` }];
  return updateDoc(doc(db, COLL.dipendenti, dipendenteId), { assenze: nuove });
}
export async function eliminaAssenza(dipendenteId, dipendenteAttuale, assenzaId) {
  const nuove = (dipendenteAttuale.assenze || []).filter((a) => a.id !== assenzaId);
  return updateDoc(doc(db, COLL.dipendenti, dipendenteId), { assenze: nuove });
}

// ---------- Fabbisogno ----------
export const aggiungiFascia = (fascia) => addDoc(collection(db, COLL.fabbisogno), fascia);
export const aggiornaFascia = (id, campi) => updateDoc(doc(db, COLL.fabbisogno, id), campi);
export const eliminaFascia = (id) => deleteDoc(doc(db, COLL.fabbisogno, id));

// Scrittura in blocco (usata da clona giorno / clona settimana ricorrente)
export async function aggiungiFasceInBlocco(fasce) {
  const batch = writeBatch(db);
  fasce.forEach((f) => {
    const ref = doc(collection(db, COLL.fabbisogno));
    batch.set(ref, f);
  });
  await batch.commit();
}

// ---------- Priorità (un documento per skill, id documento = skillId) ----------
export const salvaPriorita = (skillId, ordineDipendentiIds) =>
  setDoc(doc(db, COLL.priorita, skillId), { ordine: ordineDipendentiIds });

// ---------- Proposte (un documento per settimana, id = "2026-W50") ----------
export const salvaProposta = (chiaveSettimana, proposta) => setDoc(doc(db, COLL.proposte, chiaveSettimana), proposta);

export async function leggiProposta(chiaveSettimana) {
  const snap = await getDoc(doc(db, COLL.proposte, chiaveSettimana));
  return snap.exists() ? snap.data() : null;
}
