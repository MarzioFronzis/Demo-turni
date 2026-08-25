import { writeBatch, doc, collection } from "firebase/firestore";
import { db } from "./firebase";
import { addGiorni, fmtData } from "./date";
import { COLL } from "./collections";

export async function seedEsempio(lunediSettimanaVista) {
  const batch = writeBatch(db);

  const skills = [
    { ref: doc(collection(db, COLL.skills)), nome: "cassa" },
    { ref: doc(collection(db, COLL.skills)), nome: "forno" },
    { ref: doc(collection(db, COLL.skills)), nome: "pasticceria" },
    { ref: doc(collection(db, COLL.skills)), nome: "aperitivo" },
  ];
  skills.forEach((s) => batch.set(s.ref, { nome: s.nome }));
  const [sCassa, sForno, sPasticceria, sAperitivo] = skills.map((s) => s.ref.id);

  const dipendenti = [
    { ref: doc(collection(db, COLL.dipendenti)), nome: "Mario", telefono: "", skillIds: [sCassa, sForno], tettoOre: 30, oreMaxGiorno: 8, minGiorniLiberi: 1, assenze: [] },
    { ref: doc(collection(db, COLL.dipendenti)), nome: "Anna", telefono: "", skillIds: [sCassa, sPasticceria], tettoOre: 24, oreMaxGiorno: 6, minGiorniLiberi: 2, assenze: [] },
    { ref: doc(collection(db, COLL.dipendenti)), nome: "Luca", telefono: "", skillIds: [sForno], tettoOre: 40, oreMaxGiorno: 8, minGiorniLiberi: 1, assenze: [] },
    { ref: doc(collection(db, COLL.dipendenti)), nome: "Giulia", telefono: "", skillIds: [sCassa, sAperitivo], tettoOre: 20, oreMaxGiorno: 5, minGiorniLiberi: 3, assenze: [] },
    { ref: doc(collection(db, COLL.dipendenti)), nome: "Sara", telefono: "", skillIds: [sPasticceria, sAperitivo], tettoOre: 28, oreMaxGiorno: 7, minGiorniLiberi: 2, assenze: [] },
  ];
  dipendenti.forEach((d) => {
    const { ref, ...campi } = d;
    batch.set(ref, campi);
  });

  function fascia(offsetGiorno, oraInizio, oraFine, requisiti) {
    return { data: fmtData(addGiorni(lunediSettimanaVista, offsetGiorno)), oraInizio, oraFine, requisiti };
  }

  const fasce = [
    ...[0, 1, 2].flatMap((g) => [
      fascia(g, "06:00", "09:00", [{ skillId: sCassa, numero: 1 }]),
      fascia(g, "09:00", "13:00", [{ skillId: sCassa, numero: 1 }, { skillId: sForno, numero: 1 }, { skillId: sPasticceria, numero: 1 }]),
      fascia(g, "13:00", "17:00", [{ skillId: sCassa, numero: 1 }, { skillId: sForno, numero: 1 }]),
      fascia(g, "17:00", "19:00", [{ skillId: sCassa, numero: 1 }]),
    ]),
    ...[3, 4].flatMap((g) => [
      fascia(g, "06:00", "09:00", [{ skillId: sCassa, numero: 1 }]),
      fascia(g, "09:00", "13:00", [{ skillId: sCassa, numero: 1 }, { skillId: sForno, numero: 1 }, { skillId: sPasticceria, numero: 1 }]),
      fascia(g, "13:00", "17:00", [{ skillId: sCassa, numero: 1 }, { skillId: sForno, numero: 1 }]),
      fascia(g, "17:00", "19:00", [{ skillId: sCassa, numero: 1 }, { skillId: sAperitivo, numero: 1 }]),
    ]),
    fascia(5, "07:00", "13:00", [{ skillId: sCassa, numero: 2 }, { skillId: sForno, numero: 1 }, { skillId: sPasticceria, numero: 1 }]),
    fascia(5, "13:00", "17:00", [{ skillId: sCassa, numero: 1 }, { skillId: sPasticceria, numero: 1 }]),
    fascia(5, "17:00", "20:00", [{ skillId: sCassa, numero: 1 }, { skillId: sAperitivo, numero: 1 }]),
    fascia(6, "07:00", "13:00", [{ skillId: sCassa, numero: 1 }, { skillId: sForno, numero: 1 }, { skillId: sPasticceria, numero: 1 }]),
  ];
  fasce.forEach((f) => batch.set(doc(collection(db, COLL.fabbisogno)), f));

  await batch.commit();
}
