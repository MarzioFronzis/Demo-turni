import { useEffect, useState } from "react";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";

export function useFirestoreCollection(nomeCollection) {
  const [dati, setDati] = useState([]);
  const [caricamento, setCaricamento] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, nomeCollection), (snap) => {
      setDati(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setCaricamento(false);
    });
    return unsub;
  }, [nomeCollection]);

  return { dati, caricamento };
}

// Mappa dell'intera collection "proposte", chiave = id documento (settimana ISO es. "2026-W50")
export function useFirestoreMappa(nomeCollection) {
  const [mappa, setMappa] = useState({});
  const [caricamento, setCaricamento] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, nomeCollection), (snap) => {
      const m = {};
      snap.docs.forEach((d) => (m[d.id] = d.data()));
      setMappa(m);
      setCaricamento(false);
    });
    return unsub;
  }, [nomeCollection]);

  return { mappa, caricamento };
}
