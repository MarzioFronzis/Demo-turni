# Gestione turni

Motore di generazione automatica turni (bar/pasticceria/forno) con Firestore:
skill, dipendenti con vincoli, fabbisogno su calendario reale, ricorrenza settimanale,
generazione automatica con priorità e continuità, KPI, export Excel/PDF, invio WhatsApp.

## 1. Crea il progetto Firebase

1. https://console.firebase.google.com → nuovo progetto (separato da altri progetti che hai)
2. Attiva **Authentication** → Email/Password
3. Attiva **Firestore Database** → modalità produzione, regione europe-west
4. Impostazioni progetto → Le tue app → aggiungi app Web → copia la configurazione
5. Incollala in `src/lib/firebase.js`

## 2. Regole Firestore

Firestore → Regole → incolla `firestore.rules` → Pubblica.

Nota: queste regole danno accesso completo a chiunque sia autenticato — pensate per un
singolo titolare. Se in futuro aggiungerai altri account, restringile.

## 3. Crea il tuo utente

Authentication → Aggiungi utente → email e password che userai per accedere all'app.

## 4. Sviluppo locale

```
npm install
npm run dev
```

Al primo accesso, se skill/dipendenti/fabbisogno sono tutti vuoti, in alto a destra
compare il pulsante **"Carica esempio"**: popola in un colpo solo uno scenario completo
di test (skill, 5 dipendenti, fabbisogno su tutta la settimana in corso) così puoi
lanciare subito una generazione senza inserire nulla a mano.

## 5. Deploy automatico su GitHub Pages

1. Se il nome del repo è diverso da `gestione-turni`, aggiorna `base` in `vite.config.js`
2. Crea il repo su GitHub, fai il primo push
3. Settings del repo → Pages → Source: **GitHub Actions**
4. Da quel momento ogni push su `main` builda e pubblica da solo (workflow già incluso in `.github/workflows/deploy.yml`)

## Struttura dati Firestore

```
skills/{id}            { nome }
dipendenti/{id}         { nome, telefono, skillIds[], tettoOre, oreMaxGiorno, minGiorniLiberi, assenze[] }
fabbisogno/{id}         { data (YYYY-MM-DD), oraInizio, oraFine, requisiti: [{skillId, numero}] }
priorita/{skillId}      { ordine: [dipendenteId, ...] }
proposte/{settimanaISO} { assegnazioni[], scoperture[], oreSettimana{}, settimanaData }
```

`settimanaISO` è nel formato `2026-W50`. Le proposte generate restano salvate per
settimana: navigando con le frecce nel tab Genera o KPI trovi quella già calcolata,
se esiste.

## Cosa manca rispetto a un sistema completo

- Nessuna app lato dipendenti (loro non vedono i turni da qui) — le proposte generate
  qui sono solo per il titolare, per ora
- Nessuna pubblicazione verso un sistema di turni "ufficiali" con cambio-turno tra
  colleghi o notifiche push — è stato intenzionalmente lasciato fuori per tenere
  questo strumento semplice e concentrato sulla generazione
- Nessun controllo sul riposo minimo tra due turni (solo tetto ore/giorno, tetto
  ore/settimana, giorni liberi minimi)
