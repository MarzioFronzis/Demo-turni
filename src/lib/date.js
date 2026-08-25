// Helper date condivisi (stessa logica del demo)
export const GIORNI_LABEL = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
export const MESI_LABEL = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

export function fmtData(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
export function parseData(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}
export function lunediSettimana(d) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const giorno = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - giorno);
  return date;
}
export function addGiorni(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
export function addSettimane(d, n) {
  return addGiorni(d, n * 7);
}
export function addMesi(d, n) {
  const r = new Date(d);
  r.setMonth(r.getMonth() + n);
  return lunediSettimana(r);
}
export function numeroSettimanaISO(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const primoGiovedi = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const diff = (date - primoGiovedi) / 86400000;
  return 1 + Math.round(diff / 7);
}
export function annoISO(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  return date.getUTCFullYear();
}
export function stringaSettimanaISO(d) {
  return `${annoISO(d)}-W${String(numeroSettimanaISO(d)).padStart(2, "0")}`;
}
export function dataDaStringaSettimanaISO(str) {
  const [anno, sett] = str.split("-W").map(Number);
  const gen4 = new Date(Date.UTC(anno, 0, 4));
  const dayNum = (gen4.getUTCDay() + 6) % 7;
  const lunediSett1 = new Date(gen4);
  lunediSett1.setUTCDate(gen4.getUTCDate() - dayNum);
  const target = new Date(lunediSett1);
  target.setUTCDate(lunediSett1.getUTCDate() + (sett - 1) * 7);
  return new Date(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate());
}
export function etichettaGiorno(d) {
  return `${GIORNI_LABEL[(d.getDay() + 6) % 7]} ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}
export function etichettaRangeSettimana(lun) {
  const dom = addGiorni(lun, 6);
  const stessoMese = lun.getMonth() === dom.getMonth();
  return stessoMese ? `${lun.getDate()}–${dom.getDate()} ${MESI_LABEL[lun.getMonth()]}` : `${lun.getDate()} ${MESI_LABEL[lun.getMonth()]} – ${dom.getDate()} ${MESI_LABEL[dom.getMonth()]}`;
}
export function toMin(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
export function sovrapposte(a, b) {
  return toMin(a.oraInizio) < toMin(b.oraFine) && toMin(b.oraInizio) < toMin(a.oraFine);
}
export function durataOre(f) {
  return (toMin(f.oraFine) - toMin(f.oraInizio)) / 60;
}
