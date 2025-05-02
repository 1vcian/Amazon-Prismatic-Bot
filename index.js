const axios = require('axios');
// const cheerio = require('cheerio'); // Non più necessario se usi Jina
const fs = require('fs');
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api'); // Importa la libreria

// --- Configurazione ---
const JINA_URL = 'https://r.jina.ai/https://www.amazon.it/stores/page/BA1E70A5-3500-44A3-BC30-B0FB450B17BB';
const CHECK_INTERVAL_MS = 1 * 60 * 1000; // Controlla ogni 15 minuti (esempio)
const CHATS_FILE = './chats.json'; // File per memorizzare gli ID chat

// --- Stato Globale ---
let previousProducts = [];
let knownChatIds = loadChatIds(); // Carica gli ID chat all'avvio
let lastCheckTimestamp = null; // Aggiunta variabile per l'ultimo controllo

// --- Inizializzazione Bot Telegram ---
const token = process.env.TELEGRAM_TOKEN;
if (!token) {
    console.error("Errore: TELEGRAM_TOKEN non trovato nel file .env!");
    process.exit(1); // Esce se il token manca
}
const bot = new TelegramBot(token, { polling: true });
console.log("Bot Telegram avviato...");

// --- Funzioni Helper ---

function loadChatIds() {
    try {
        if (fs.existsSync(CHATS_FILE)) {
            const data = fs.readFileSync(CHATS_FILE);
            const ids = JSON.parse(data);
            // Assicurati che sia un array di numeri o stringhe
            if (Array.isArray(ids) && ids.every(id => typeof id === 'number' || typeof id === 'string')) {
                 console.log(`Caricati ${ids.length} chat ID da ${CHATS_FILE}`);
                 return new Set(ids.map(String)); // Usa un Set per evitare duplicati e converte in stringa
            }
        }
    } catch (error) {
        console.error(`Errore nel caricamento di ${CHATS_FILE}:`, error.message);
    }
    console.log(`${CHATS_FILE} non trovato o non valido, inizio con un set vuoto.`);
    return new Set(); // Inizia con un Set vuoto se il file non esiste o è invalido
}

function saveChatIds() {
    try {
        // Converte il Set in Array prima di salvare
        fs.writeFileSync(CHATS_FILE, JSON.stringify(Array.from(knownChatIds), null, 2));
        // console.log(`Chat ID salvati in ${CHATS_FILE}`); // Log opzionale
    } catch (error) {
        console.error(`Errore nel salvataggio di ${CHATS_FILE}:`, error.message);
    }
}

// --- Funzioni Principali (fetchData, compareProducts) ---

async function fetchData() {
    try {
        const response = await axios.get(JINA_URL, {
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Accept-Language': 'it-IT'
            }
        });

        const rawData = response.data;
        const products = [];
        // Dividiamo il testo grezzo in linee per facilitare l'analisi contestuale
        const allLines = rawData.split('\n');

        let currentProduct = null;

        for (let i = 0; i < allLines.length; i++) {
            const line = allLines[i].trim();

            // Cerca l'inizio di un blocco prodotto basato sull'immagine specifica
            const imageMatch = line.match(/^!\[Image \d+: Image of.*?\]\((https:\/\/m\.media-amazon\.com\/images\/I\/[^)]+)\)/);
            if (imageMatch) {
                // Se troviamo un'immagine, iniziamo un nuovo potenziale prodotto
                // Se c'era un prodotto precedente non finalizzato, lo scartiamo
                currentProduct = {
                    image: imageMatch[1].trim(),
                    title: '',
                    price: '',
                    link: '',
                    rating: '',
                    foundVisualizzazione: false,
                    foundTitle: false
                };
                // console.log(`Trovata immagine potenziale prodotto: ${currentProduct.image}`);
                continue; // Passa alla riga successiva
            }

            // Se non abbiamo un prodotto corrente in costruzione, ignoriamo la riga
            if (!currentProduct) continue;

            // Cerca "Visualizzazione rapida" solo se abbiamo già un'immagine
            if (line.includes('Visualizzazione rapida')) {
                currentProduct.foundVisualizzazione = true;
                // console.log("Trovato 'Visualizzazione rapida'");
                continue;
            }

            // Se abbiamo trovato "Visualizzazione rapida", la riga successiva NON vuota è il titolo
            if (currentProduct.foundVisualizzazione && !currentProduct.foundTitle && line) {
                currentProduct.title = line;
                currentProduct.foundTitle = true;
                // console.log(`Trovato Titolo: ${currentProduct.title}`);
                continue;
            }

            // Cerca le altre informazioni solo dopo aver trovato il titolo
            if (currentProduct.foundTitle) {
                // Prezzo
                if (line.includes('€')) {
                    const priceMatch = line.match(/([\d.,]+\s*€)/);
                    if (priceMatch) {
                        currentProduct.price = priceMatch[1].trim();
                        // console.log(`Trovato Prezzo: ${currentProduct.price}`);
                    }
                }
                // Rating
                else if (line.includes('su 5 stelle')) {
                    const ratingMatch = line.match(/(\d+,\d+)\s*su\s*5\s*stelle/);
                    if (ratingMatch) {
                        currentProduct.rating = ratingMatch[1] + ' su 5';
                    } else {
                        currentProduct.rating = line; // Fallback
                    }
                    // console.log(`Trovato Rating: ${currentProduct.rating}`);
                }
                // Link (cerca [Testo Bottone](URL))
                else {
                    const linkMatch = line.match(/\[(?:Vedi opzioni|Scopri di più|Acquista ora|Maggiori dettagli)\]\((https:\/\/www\.amazon\.it\/[^)]+)\)/);
                    if (linkMatch) {
                        currentProduct.link = linkMatch[1].trim();
                        // console.log(`Trovato Link: ${currentProduct.link}`);
                        // Una volta trovato il link, consideriamo il prodotto completo e lo aggiungiamo
                        if (currentProduct.image && currentProduct.title) {
                             products.push({ ...currentProduct });
                             // console.log("--- Prodotto Aggiunto ---");
                        }
                        // Resettiamo per cercare il prossimo prodotto
                        currentProduct = null;
                    }
                     // Aggiungiamo un fallback: se troviamo "*   []" potrebbe indicare la fine
                     // del blocco utile, anche se non abbiamo trovato un link esplicito.
                     else if (line.startsWith('*   []') && currentProduct.image && currentProduct.title) {
                         // console.log("Trovato marcatore di fine blocco '*   []', aggiungo prodotto se valido.");
                         products.push({ ...currentProduct });
                         currentProduct = null;
                     }
                }
            }
        }

        // Potrebbe esserci un ultimo prodotto non finalizzato se il file termina bruscamente
        if (currentProduct && currentProduct.image && currentProduct.title) {
             // console.log("Aggiungo ultimo prodotto trovato alla fine del file.");
             products.push({ ...currentProduct });
        }


        return products;

    } catch (error) {
        console.error('Errore durante il fetch o parsing da Jina AI Reader:', error.message);
        if (error.response) {
            console.error('Status Code Jina:', error.response.status);
            console.error('Dati Errore Jina (anteprima):', String(error.response.data).substring(0, 500));
        }
        return []; // Ritorna array vuoto in caso di errore
    }
}

function compareProducts(oldList, newList) {
    const changes = {
        added: [],
        removed: [],
        changed: []
    };

    // Funzione helper per ottenere una chiave univoca (link o titolo)
    const getKey = (product) => product.link || product.title || `no-key-${Math.random()}`;

    const oldProductMap = new Map(oldList.map(p => [getKey(p), p]));
    const newProductMap = new Map(newList.map(p => [getKey(p), p]));

    // Cerca prodotti aggiunti e modificati
    newList.forEach(newItem => {
        const key = getKey(newItem);
        const oldItem = oldProductMap.get(key);

        if (oldItem) {
            // Prodotto esistente, controlla le modifiche
            const changedFields = [];
            if (newItem.title !== oldItem.title) changedFields.push({ field: 'Titolo', old: oldItem.title, new: newItem.title });
            if (newItem.price !== oldItem.price) changedFields.push({ field: 'Prezzo', old: oldItem.price, new: newItem.price });
            if (newItem.link !== oldItem.link) changedFields.push({ field: 'Link', old: oldItem.link, new: newItem.link }); // Anche se usato come chiave, può cambiare? Meglio controllare.
            if (newItem.image !== oldItem.image) changedFields.push({ field: 'Immagine', old: oldItem.image, new: newItem.image });
            if (newItem.rating !== oldItem.rating) changedFields.push({ field: 'Rating', old: oldItem.rating, new: newItem.rating });

            if (changedFields.length > 0) {
                changes.changed.push({
                    key: key, // Identificatore
                    title: newItem.title, // Titolo attuale per riferimento
                    link: newItem.link,   // Link attuale per riferimento
                    image: newItem.image, // Immagine attuale per riferimento
                    details: changedFields // Array con i dettagli delle modifiche
                });
            }
            // Rimuovi dal map vecchio per trovare facilmente i rimossi dopo
            oldProductMap.delete(key);
        } else {
            // Prodotto non trovato nel vecchio map -> Aggiunto
            changes.added.push(newItem);
        }
    });

    // I prodotti rimasti in oldProductMap sono quelli rimossi
    changes.removed = Array.from(oldProductMap.values());

    return changes; // Ritorna un oggetto con le tre liste
}

// --- Funzione Notifica Telegram (Modificata per gestire added, removed, changed) ---
async function notifyTelegram(changes) { // Ora riceve l'oggetto changes
    if (knownChatIds.size === 0) {
        console.log("Nessun chat ID conosciuto a cui inviare notifiche.");
        return;
    }

    const { added, removed, changed } = changes;
    const totalChanges = added.length + removed.length + changed.length;

    if (totalChanges === 0) {
        console.log("Nessun cambiamento rilevato da notificare.");
        return;
    }

    console.log(`Invio notifiche per ${added.length} aggiunti, ${removed.length} rimossi, ${changed.length} modificati a ${knownChatIds.size} chat...`);

    // Invia un messaggio riassuntivo (opzionale)
    let summaryMessage = "ℹ️ *Riepilogo Cambiamenti Prodotti:*\n";
    if (added.length > 0) summaryMessage += `➕ *${added.length}* Prodotti Aggiunti\n`;
    if (removed.length > 0) summaryMessage += `➖ *${removed.length}* Prodotti Rimossi\n`;
    if (changed.length > 0) summaryMessage += `✏️ *${changed.length}* Prodotti Modificati\n`;

    for (const chatId of knownChatIds) {
        try {
            await bot.sendMessage(chatId, summaryMessage, { parse_mode: 'Markdown' });
            await new Promise(resolve => setTimeout(resolve, 200)); // Pausa breve
        } catch (error) {
             console.error(`Errore invio messaggio riassuntivo a ${chatId}:`, error.message);
             // Gestione errore 403 come prima
             if (error.response && error.response.statusCode === 403) {
                 console.log(`Rimuovo chat ID ${chatId} a causa di errore 403.`);
                 knownChatIds.delete(chatId);
                 saveChatIds();
             }
        }
    }

    // Notifica Prodotti Aggiunti
    for (const product of added) {
        const message = `
➕ *Nuovo Prodotto Aggiunto*
📦 *${product.title}*
💰 Prezzo: *${product.price || 'N/D'}*
⭐ Rating: ${product.rating || 'N/A'}
🔗 [Link al prodotto](${product.link || '#'})
`;
        await sendProductNotification(product, message);
    }

    // Notifica Prodotti Rimossi
    for (const product of removed) {
        const message = `
➖ *Prodotto Rimosso*
📦 *${product.title}*
_(Prezzo precedente: ${product.price || 'N/D'})_
_(Rating precedente: ${product.rating || 'N/A'})_
${product.link ? `🔗 [Link (potrebbe non funzionare)](${product.link})` : ''}
`;
        // Per i rimossi, inviamo solo testo, l'immagine potrebbe non essere più rilevante/accessibile
         await sendProductNotification(product, message, true); // true = force text only
    }

    // Notifica Prodotti Modificati
    for (const productChange of changed) {
        let message = `
✏️ *Prodotto Modificato*
📦 *${productChange.title}*
`;
        productChange.details.forEach(detail => {
            // Tronca valori lunghi (es. link immagine) per leggibilità
            const oldValue = String(detail.old).length > 50 ? String(detail.old).substring(0, 47) + '...' : detail.old;
            const newValue = String(detail.new).length > 50 ? String(detail.new).substring(0, 47) + '...' : detail.new;
            message += `  • ${detail.field}: ~${oldValue || 'N/D'}~ → *${newValue || 'N/D'}*\n`;
        });
        message += `🔗 [Link al prodotto](${productChange.link || '#'})`;

        // Trova l'oggetto prodotto completo per l'immagine (se necessario)
        const fullProduct = changed.find(p => p.key === productChange.key); // Dovrebbe essere productChange stesso
        await sendProductNotification(fullProduct || productChange, message);
    }
}

// Funzione helper per inviare notifiche (evita duplicazione codice)
async function sendProductNotification(product, message, forceTextOnly = false) {
     for (const chatId of knownChatIds) {
        try {
            // Se l'immagine esiste ed è valida E non forziamo solo testo
            if (!forceTextOnly && product.image && product.image.startsWith('http')) {
                await bot.sendPhoto(chatId, product.image, {
                    caption: message,
                    parse_mode: 'Markdown'
                });
            } else {
                await bot.sendMessage(chatId, message, {
                    parse_mode: 'Markdown',
                    disable_web_page_preview: true
                });
            }
        } catch (error) {
            console.error(`Errore invio notifica prodotto a ${chatId} (Titolo: ${product.title}):`, error.message);
             // Gestione errore 403 come prima
             if (error.response && error.response.statusCode === 403) {
                 console.log(`Rimuovo chat ID ${chatId} a causa di errore 403.`);
                 knownChatIds.delete(chatId);
                 saveChatIds();
             }
             // Potresti aggiungere gestione per altri errori specifici qui (es. immagine non valida)
             else if (error.response && error.response.statusCode === 400) {
                 // Se l'invio foto fallisce, prova a inviare solo testo
                 console.warn(`Invio foto fallito per ${product.title}, tento invio solo testo.`);
                 try {
                     await bot.sendMessage(chatId, message, { parse_mode: 'Markdown', disable_web_page_preview: true });
                 } catch (textError) {
                     console.error(`Errore invio messaggio di fallback a ${chatId}:`, textError.message);
                 }
             }
        }
    }
    // Aggiungi un piccolo ritardo
    await new Promise(resolve => setTimeout(resolve, 500));
}


// --- Gestori Comandi Bot ---

// Definisci la tastiera personalizzata
const opts = {
    reply_markup: {
        keyboard: [ // Array di righe di bottoni
            [{ text: '🛒 Gotta Buy \'Em All' }, { text: '🔄 Gotta Check \'Em All' }] // Aggiunto bottone "Controlla Ora"
        ],
        resize_keyboard: false, // Rende la tastiera più piccola se possibile
        one_time_keyboard: false // Mantiene la tastiera visibile
    }
};

// Comando /start: Saluta l'utente, salva il suo ID chat e invia la tastiera
bot.onText(/\/start/, (msg) => {
    const chatId = String(msg.chat.id); // Usa sempre stringhe per gli ID
    const firstName = msg.from.first_name;

    // Invia il messaggio di benvenuto CON la tastiera
    bot.sendMessage(chatId, `Ciao ${firstName}! 👋 Sono il bot per monitorare i prodotti Prismatic. Riceverai notifiche quando ci sono cambiamenti. Usa il bottone qui sotto o il comando /prezzi per vedere la lista attuale.`, opts); // Aggiunto 'opts'

    if (!knownChatIds.has(chatId)) {
        knownChatIds.add(chatId);
        saveChatIds(); // Salva il nuovo ID
        console.log(`Nuovo utente registrato: ${chatId}`);
    }
});

// Gestore per il testo del bottone (che invierà "/prezzi")
// Telegram invierà il testo del bottone come un normale messaggio
// Quindi il gestore /prezzi esistente lo catturerà.
// Assicuriamoci che il testo del bottone corrisponda a un comando o testo gestito.
// In questo caso, facciamo in modo che il bottone invii implicitamente /prezzi
// modificando il gestore /prezzi per catturare ANCHE il testo del bottone.

// Comando /prezzi: Invia la lista corrente dei prodotti con immagini
// Modificato per accettare sia il comando che il testo del bottone
bot.onText(/\/prezzi|🛒 Gotta Buy 'Em All/, async (msg) => { // Aggiunto '|🛒 Gotta Buy 'Em All'
    const chatId = String(msg.chat.id);
    const waitMessage = await bot.sendMessage(chatId, "Recupero la lista dei prodotti, attendi un momento..."); // Messaggio di attesa

    if (!previousProducts || previousProducts.length === 0) {
        bot.editMessageText("La lista dei prodotti è ancora vuota o non è stato ancora effettuato un controllo. Usa '🔄 Gotta Check \\'Em All' per avviare il primo controllo.", { // Messaggio aggiornato
             chat_id: chatId,
             message_id: waitMessage.message_id
        });
        return;
    }

    // Rimuovi il messaggio di attesa
    await bot.deleteMessage(chatId, waitMessage.message_id);

    bot.sendMessage(chatId, `🛒 *Lista Prodotti Attuali (${previousProducts.length}):*`);

    for (const product of previousProducts) {
        const caption = `
📦 *${product.title}*
💰 Prezzo: *${product.price || 'N/D'}*
⭐ Rating: ${product.rating || 'N/A'}
🔗 [Link al prodotto](${product.link || '#'})
`;

        try {
            if (product.image && product.image.startsWith('http')) {
                // Invia foto se l'immagine è valida
                await bot.sendPhoto(chatId, product.image, {
                    caption: caption,
                    parse_mode: 'Markdown'
                });
            } else {
                // Altrimenti invia solo testo
                await bot.sendMessage(chatId, caption, {
                    parse_mode: 'Markdown',
                    disable_web_page_preview: true
                });
            }
            // Aggiungi un piccolo ritardo per evitare rate limiting
            await new Promise(resolve => setTimeout(resolve, 300)); // 0.3 secondi
        } catch (error) {
            console.error(`Errore invio prodotto (Chat ID: ${chatId}, Titolo: ${product.title}):`, error.message);
            // Invia un messaggio di errore specifico per quel prodotto, se fallisce
            if (error.response && error.response.statusCode === 400 && error.response.body?.includes('PHOTO_INVALID_DIMENSIONS')) { // Aggiunto optional chaining
                 await bot.sendMessage(chatId, `⚠️ Impossibile inviare l'immagine per *${product.title}* (dimensioni non valide).\n${caption}`, { parse_mode: 'Markdown', disable_web_page_preview: true });
            } else if (error.response && error.response.statusCode === 400 && error.response.body?.includes('URL_INVALID')) { // Aggiunto optional chaining
                 await bot.sendMessage(chatId, `⚠️ Impossibile inviare l'immagine per *${product.title}* (URL non valido).\n${caption}`, { parse_mode: 'Markdown', disable_web_page_preview: true });
            } else {
                 await bot.sendMessage(chatId, `⚠️ Errore nell'invio del prodotto: *${product.title}*`, { parse_mode: 'Markdown' });
            }
             // Attendi un po' di più dopo un errore
             await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
     // Messaggio finale aggiornato con timestamp
     const lastCheckTimeString = lastCheckTimestamp
         ? lastCheckTimestamp.toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Europe/Rome' }) // Aggiunto timeZone
         : 'Mai';
     bot.sendMessage(chatId, `✅ Lista prodotti inviata.\n🕒 Ultimo controllo effettuato: *${lastCheckTimeString}*`, { parse_mode: 'Markdown' });
});

// --- Funzione di Controllo e Notifica ---
async function checkAndNotify() {
    console.log("Avvio controllo prodotti...");
    const currentProducts = await fetchData();

    if (!currentProducts || currentProducts.length === 0) {
        console.log("Fetch fallito o nessun prodotto trovato. Controllo saltato.");
        return false; // Indica che il controllo non è andato a buon fine completamente
    }

    // Aggiorna il timestamp SOLO se il fetch ha avuto successo
    lastCheckTimestamp = new Date();
    console.log(`Controllo completato il: ${lastCheckTimestamp.toLocaleString('it-IT')}`);

    if (previousProducts.length > 0) {
        const changes = compareProducts(previousProducts, currentProducts);
        const totalChanges = changes.added.length + changes.removed.length + changes.changed.length;

        if (totalChanges > 0) {
            console.log(`Rilevati ${totalChanges} cambiamenti.`);
            await notifyTelegram(changes);
        } else {
            console.log("Nessun cambiamento rilevato.");
        }
    } else {
        console.log("Primo controllo eseguito, memorizzo la lista iniziale.");
        // Opzionale: invia notifica per il primo controllo
        // await notifyTelegram({ added: currentProducts, removed: [], changed: [] });
    }

    previousProducts = currentProducts; // Aggiorna la lista precedente
    return true; // Indica che il controllo è stato eseguito
}

// --- Gestore Comando /check e Bottone ---
bot.onText(/\/check|🔄 Gotta Check 'Em All/, async (msg) => { // Aggiunto gestore per il testo del bottone
    const chatId = String(msg.chat.id);
    const waitMsg = await bot.sendMessage(chatId, "🔄 Avvio controllo manuale dei prodotti...");

    const success = await checkAndNotify(); // Esegui il controllo

    if (success && lastCheckTimestamp) {
         const lastCheckTimeString = lastCheckTimestamp.toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Europe/Rome' }); // Aggiunto timeZone
         await bot.editMessageText(`✅ Controllo manuale completato.\n🕒 Ora controllo: *${lastCheckTimeString}*`, {
              chat_id: chatId,
              message_id: waitMsg.message_id,
              parse_mode: 'Markdown'
         });
    } else {
         await bot.editMessageText("⚠️ Si è verificato un errore durante il controllo manuale o nessun prodotto trovato. Controlla i log.", {
              chat_id: chatId,
              message_id: waitMsg.message_id
         });
    }
});


// --- Loop Principale ---
async function mainLoop() {
    console.log("Eseguo il primo controllo all'avvio...");
    await checkAndNotify(); // Esegui subito un controllo

    setInterval(async () => {
        console.log(`Eseguo controllo periodico (ogni ${CHECK_INTERVAL_MS / 60000} minuti)...`);
        await checkAndNotify();
    }, CHECK_INTERVAL_MS);
}

// --- Avvio ---
mainLoop(); // Avvia il loop principale
