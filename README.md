# Amazon Prismatic Bot

Questo è un bot Telegram Node.js progettato per monitorare una specifica pagina dello store Amazon (in questo caso, dedicata a "Evoluzioni Prismatiche" del GCC Pokémon su Amazon.it) e notificare gli utenti su Telegram riguardo a cambiamenti nei prodotti disponibili.

## Come Funziona

1.  **Recupero Dati:** Lo script utilizza [Jina AI Reader](https://jina.ai/reader/) per ottenere una versione testuale semplificata della pagina dello store Amazon specificata. Questo aiuta a bypassare la complessità del rendering HTML diretto.
2.  **Parsing:** Analizza il testo ricevuto da Jina AI per estrarre informazioni chiave sui prodotti, come:
    *   Immagine del prodotto
    *   Titolo
    *   Prezzo
    *   Link alla pagina del prodotto
    *   Rating (se disponibile)
3.  **Confronto:** Confronta l'elenco dei prodotti appena recuperato con l'elenco dell'ultimo controllo. Identifica:
    *   Prodotti aggiunti
    *   Prodotti rimossi
    *   Prodotti modificati (cambiamenti nel prezzo, titolo, rating o immagine)
4.  **Notifica:** Se vengono rilevati cambiamenti, invia notifiche dettagliate tramite un bot Telegram agli utenti iscritti. Le notifiche includono:
    *   Un riepilogo dei cambiamenti (quanti aggiunti, rimossi, modificati).
    *   Messaggi individuali per ogni prodotto aggiunto, rimosso o modificato, con dettagli specifici e un link al prodotto. Viene inclusa anche l'immagine del prodotto quando possibile.
5.  **Persistenza:** Gli ID delle chat Telegram degli utenti iscritti vengono salvati nel file `chats.json` per garantire che le notifiche vengano inviate agli utenti corretti anche dopo il riavvio dello script.
6.  **Esecuzione Periodica:** Lo script esegue controlli a intervalli regolari (configurabili tramite `CHECK_INTERVAL_MS` in `index.js`) per monitorare continuamente la pagina.
7.  **Server Web:** Un semplice server Express (`server.js`) è incluso per mantenere il processo attivo, utile per piattaforme di hosting come Replit, Glitch, o simili.

## Funzionalità Principali

*   Monitoraggio automatico di una pagina store Amazon.
*   Estrazione di dettagli dei prodotti (titolo, prezzo, immagine, link, rating).
*   Rilevamento di prodotti nuovi, rimossi o modificati.
*   Notifiche dettagliate tramite Telegram.
*   Gestione degli utenti iscritti tramite comandi del bot.
*   Configurazione tramite variabili d'ambiente (`.env`).

## Setup e Installazione

1.  **Clona il repository:**
    ```bash
    git clone <url-del-tuo-repository>
    cd Amazon-Prismatic-Bot
    ```
2.  **Installa le dipendenze:**
    ```bash
    npm install
    ```
3.  **Crea un file `.env`:**
    Nella directory principale del progetto, crea un file chiamato `.env` e aggiungi il token del tuo bot Telegram:
    ```dotenv
    TELEGRAM_TOKEN=IL_TUO_TOKEN_TELEGRAM_QUI
    ```
    *Nota: Ottieni il token da BotFather su Telegram.*
4.  **Avvia il bot:**
    ```bash
    npm start
    ```
    Questo comando eseguirà `node server.js`, che a sua volta avvierà il monitoraggio definito in `index.js`.

## Utilizzo (Comandi Telegram)

Interagisci con il bot su Telegram:

*   `/start`: Registra la tua chat per ricevere le notifiche.
*   `/prezzi`: Mostra i prodotti disponibili e il loro prezzo.
*   `/Check`: Avvia un controllo manuale per verificare i prodotti.

## Dipendenze Principali

*   `axios`: Per effettuare richieste HTTP (a Jina AI Reader).
*   `node-telegram-bot-api`: Per interagire con l'API di Telegram.
*   `dotenv`: Per caricare variabili d'ambiente dal file `.env`.
*   `express`: Per creare il server web di base.

*(Vedi `package.json` per l'elenco completo)*

## Nota Importante

Questo script dipende dal servizio esterno Jina AI Reader per interpretare la pagina Amazon. Cambiamenti nel layout della pagina Amazon o nel funzionamento di Jina AI Reader potrebbero richiedere aggiornamenti allo script per continuare a funzionare correttamente.