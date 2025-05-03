const axios = require('axios');
// const cheerio = require('cheerio'); // Non più necessario se usi Jina
const fs = require('fs');
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api'); // Importa la libreria

// --- Configurazione ---
const JINA_URL = 'https://r.jina.ai/https://www.amazon.it/stores/page/BA1E70A5-3500-44A3-BC30-B0FB450B17BB';
const CHECK_INTERVAL_MS = 1 * 60 * 1000; // Controlla ogni 15 minuti (esempio)
const USER_DATA_FILE = './user_data.json'; // Nuovo file per dati utente e preferenze

// --- Preferenze Default ---
const defaultPreferences = {
    notifyNew: true,
    notifyRemoved: false,
    notifyPriceIncrease: false,
    notifyAllChanges: false, // Se true, ignora le altre impostazioni e notifica tutto
    priceDecreaseThreshold: 40, // Percentuale (0 = qualsiasi diminuzione)
    notificationsEnabled: true // Nuova opzione per abilitare/disabilitare tutte le notifiche
};
// --- Stato Globale ---
let previousProducts = [];
// let knownChatIds = loadChatIds(); // Non più usato direttamente
let userData = loadUserData(); // Carica dati utente e preferenze all'avvio
let lastCheckTimestamp = null; // Aggiunta 

// --- Inizializzazione Bot Telegram ---
const token = process.env.TELEGRAM_TOKEN;
if (!token) {
    console.error("Errore: TELEGRAM_TOKEN non trovato nel file .env!");
    process.exit(1); // Esce se il token manca
}
const bot = new TelegramBot(token, { polling: true });
console.log("Bot Telegram avviato...");

// --- Funzioni Helper ---
function loadUserData() {
    try {
        if (fs.existsSync(USER_DATA_FILE)) {
            const data = fs.readFileSync(USER_DATA_FILE);
            const parsedData = JSON.parse(data);
            // Validazione semplice: assicurati che sia un oggetto
            if (typeof parsedData === 'object' && parsedData !== null) {
                 console.log(`Caricati dati per ${Object.keys(parsedData).length} chat da ${USER_DATA_FILE}`);
                 // Assicurati che ogni utente abbia tutte le preferenze (aggiungi quelle mancanti con i default)
                 for (const chatId in parsedData) {
                     parsedData[chatId].preferences = {
                         ...defaultPreferences, // Inizia con i default
                         ...(parsedData[chatId].preferences || {}) // Sovrascrivi con quelle salvate
                     };
                 }
                 return parsedData;
            }
        }
    } catch (error) {
        console.error(`Errore nel caricamento di ${USER_DATA_FILE}:`, error.message);
    }
    console.log(`${USER_DATA_FILE} non trovato o non valido, inizio con un oggetto vuoto.`);
    return {}; // Inizia con un oggetto vuoto
}

function saveUserData() {
    try {
        fs.writeFileSync(USER_DATA_FILE, JSON.stringify(userData, null, 2));
        // console.log(`Dati utente salvati in ${USER_DATA_FILE}`); // Log opzionale
    } catch (error) {
        console.error(`Errore nel salvataggio di ${USER_DATA_FILE}:`, error.message);
    }
}

// Funzione per ottenere le preferenze di un utente, usando i default se non esistono
function getUserPreferences(chatId) {
    return userData[chatId]?.preferences || defaultPreferences;
}
// --- Funzioni Principali (fetchData, compareProducts) ---

async function fetchData() {
    try {
        const response = await axios.get(JINA_URL, {
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Accept-Language': 'it-IT',
                'X-No-Cache': 'true' // Aggiunto header per evitare la cache di Jina
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

    if (newList.length === 0) {
        console.log("Lista prodotti nuova vuota, non posso confrontare. potrebbe esserci stato un errore nella get");
        return changes; // Ritorna un oggetto vuoto
    }

    // Funzione helper per ottenere una chiave univoca (link o titolo)
    const getKey = (product) => {
        // Normalizza il link rimuovendo i parametri di query
        let normalizedLink = '';
        if (product.link) {
            try {
                const url = new URL(product.link);
                // Mantieni solo il pathname, rimuovi i parametri di query
                normalizedLink = url.origin + url.pathname;
            } catch (e) {
                normalizedLink = product.link; // Fallback al link originale
            }
        }
        
        // Normalizza il titolo (rimuovi spazi extra, converti in minuscolo)
        const normalizedTitle = (product.title || '').trim().toLowerCase();
        
        // Usa prima il link normalizzato, poi il titolo, poi un fallback con l'immagine
        return normalizedLink || normalizedTitle || (product.image ? product.image.split('/').pop() : `no-key-${Date.now()}`);
    };

    const oldProductMap = new Map(oldList.map(p => [getKey(p), p]));

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
    if(changes.length)

    return changes; // Ritorna un oggetto con le tre liste
}

// --- Funzione Notifica Telegram (Modificata per gestire added, removed, changed) ---
async function processNotifications(changes) {
    const { added, removed, changed } = changes;
    const totalChanges = added.length + removed.length + changed.length;

    if (totalChanges === 0) {
        console.log("Nessun cambiamento rilevato.");
        return;
    }

    const chatIds = Object.keys(userData);
    if (chatIds.length === 0) {
        console.log("Nessun utente registrato a cui inviare notifiche.");
        return;
    }

    console.log(`Processo notifiche per ${added.length} aggiunti, ${removed.length} rimossi, ${changed.length} modificati per ${chatIds.length} chat...`);

    for (const chatId of chatIds) {
        const prefs = getUserPreferences(chatId);
        
        // Controlla se le notifiche sono disabilitate per questo utente
        if (!prefs.notificationsEnabled) {
            console.log(`Notifiche disabilitate per l'utente ${chatId}, salto.`);
            continue; // Salta questo utente e passa al prossimo
        }
        
        let messagesToSend = []; // Array di messaggi da inviare a questo utente
        // 1. Summary Message (always sent if there are changes)
        let summaryMessage = "ℹ️ *Product Changes Summary:*\n";
        if (added.length > 0) summaryMessage += `➕ *${added.length}* Products Added\n`;
        if (removed.length > 0) summaryMessage += `➖ *${removed.length}* Products Removed\n`;
        if (changed.length > 0) summaryMessage += `✏️ *${changed.length}* Products Modified\n`;
        messagesToSend.push({ type: 'summary', text: summaryMessage });

        // 2. Added Products Notification
        if (prefs.notifyNew) {
            for (const product of added) {
                const message = `
➕ *New Product Added*
📦 *${product.title}*
💰 Price: *${product.price || 'N/A'}*
⭐ Rating: ${product.rating || 'N/A'}
🔗 [Product Link](${product.link || '#'})
`;
                messagesToSend.push({ type: 'product', product: product, text: message, forceTextOnly: false });
            }
        }

        // 3. Removed Products Notification
        if (prefs.notifyRemoved || prefs.notifyAllChanges) {
            for (const product of removed) {
                const message = `
➖ *Product Removed*
📦 *${product.title}*
_(Previous price: ${product.price || 'N/A'})_
_(Previous rating: ${product.rating || 'N/A'})_
${product.link ? `🔗 [Link (may not work)](${product.link})` : ''}
`;
                messagesToSend.push({ type: 'product', product: product, text: message, forceTextOnly: true });
            }
        }

        // 4. Notifica Prodotti Modificati
        for (const productChange of changed) {
            let changeDetailsText = '';
            let shouldNotifyThisChange = false;
            let priceDecreasedSignificantly = false;
            let priceIncreased = false;
            let otherChange = false;

            productChange.details.forEach(detail => {
                const oldValue = String(detail.old).length > 50 ? String(detail.old).substring(0, 47) + '...' : detail.old;
                const newValue = String(detail.new).length > 50 ? String(detail.new).substring(0, 47) + '...' : detail.new;
                changeDetailsText += `  • ${detail.field}: ~${oldValue || 'N/D'}~ → *${newValue || 'N/D'}*\n`;

                if (detail.field === 'Prezzo') {
                    const oldPriceNum = parseFloat(String(detail.old).replace('€', '').replace(',', '.'));
                    const newPriceNum = parseFloat(String(detail.new).replace('€', '').replace(',', '.'));

                    if (!isNaN(oldPriceNum) && !isNaN(newPriceNum)) {
                        if (newPriceNum < oldPriceNum) {
                            const decreasePercentage = ((oldPriceNum - newPriceNum) / oldPriceNum) * 100;
                            // Modifica qui: usa >= invece di >
                            if (prefs.priceDecreaseThreshold === 0 || decreasePercentage >= prefs.priceDecreaseThreshold) {
                                priceDecreasedSignificantly = true;
                            }
                        } else if (newPriceNum > oldPriceNum) {
                            priceIncreased = true;
                        }
                    }
                } else {
                    otherChange = true; // Cambio di titolo, immagine, rating, link
                }
            });

            // Decidi se notificare basandoti sulle preferenze
            if (prefs.notifyAllChanges) {
                shouldNotifyThisChange = true;
            } else {
                if (priceDecreasedSignificantly) {
                    shouldNotifyThisChange = true;
                }
                if (priceIncreased && prefs.notifyPriceIncrease) {
                    shouldNotifyThisChange = true;
                }
                // Nota: Altri cambiamenti (otherChange) vengono notificati solo se notifyAllChanges è true
            }


            if (shouldNotifyThisChange) {
                const message = `
✏️ *Modified Product*
📦 *${productChange.title}*
${changeDetailsText}🔗 [Product Link](${productChange.link || '#'})`;
                // Find complete product object for image
                const fullProduct = changed.find(p => p.key === productChange.key); // Should be productChange itself
                messagesToSend.push({ type: 'product', product: fullProduct || productChange, text: message, forceTextOnly: false });
            }
        }

        // Invia i messaggi accumulati per questo chatId
        if (messagesToSend.length > 1) { // Invia solo se c'è più del riepilogo
             await sendNotificationsToChat(chatId, messagesToSend);
        }
    }
}

async function sendNotificationsToChat(chatId, messages) {
    console.log(`Invio ${messages.length} notifiche a ${chatId}`);
    for (const msgData of messages) {
        try {
            if (msgData.type === 'summary') {
                await bot.sendMessage(chatId, msgData.text, { parse_mode: 'Markdown' });
            } else if (msgData.type === 'product') {
                const product = msgData.product;
                const message = msgData.text;
                const forceTextOnly = msgData.forceTextOnly;

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
            }
            await new Promise(resolve => setTimeout(resolve, 500)); // Pausa tra messaggi
        } catch (error) {
            console.error(`Errore invio notifica a ${chatId}:`, error.message);
            if (error.response && error.response.statusCode === 403) {
                console.log(`Rimuovo chat ID ${chatId} a causa di errore 403.`);
                delete userData[chatId]; // Rimuovi l'utente dai dati
                saveUserData();
                break; // Interrompi l'invio a questo utente se bloccato
            } else if (error.response && error.response.statusCode === 400 && msgData.type === 'product') {
                 // Se l'invio foto fallisce, prova a inviare solo testo (come prima)
                 console.warn(`Invio foto fallito per ${msgData.product.title}, tento invio solo testo.`);
                 try {
                     await bot.sendMessage(chatId, msgData.text, { parse_mode: 'Markdown', disable_web_page_preview: true });
                 } catch (textError) {
                     console.error(`Errore invio messaggio di fallback a ${chatId}:`, textError.message);
                 }
            }
            // Considera di aggiungere altre gestioni errori se necessario
        }
    }
}


// --- Gestori Comandi Bot ---

// Definisci la tastiera personalizzata
const opts = {
    reply_markup: {
        keyboard: [ // Array di righe di bottoni
            [{ text: '🛒 Gotta Buy \'Em All' }, { text: '🔄 Gotta Check \'Em All' }],
            [{text:'⚙️ Gotta Set \'Em All'}, {text:'ℹ️ Gotta Info \' Em All'}]
        ],
        resize_keyboard: true, // Rende la tastiera più piccola se possibile
        one_time_keyboard: false // Mantiene la tastiera visibile
    }
};

// Comando /start: Saluta l'utente, salva il suo ID chat e invia la tastiera
bot.onText(/\/start/, (msg) => {
    const chatId = String(msg.chat.id);
    const firstName = msg.from.first_name || `User ${chatId}`; // Fallback for name

    // Send welcome message WITH keyboard
    bot.sendMessage(chatId, `Hello ${firstName}! 👋 I'm the bot for monitoring Prismatic products. You'll receive notifications based on your preferences (see /settings). Use the buttons or commands to interact.`, opts);

    if (!userData[chatId]) {
        userData[chatId] = {
            preferences: { ...defaultPreferences }, // Assign default preferences
            registered: true,
            firstName: firstName // Also save the name if you want
        };
        saveUserData(); // Save new user data
        console.log(`New user/group registered: ${chatId}`);
    } else if (!userData[chatId].preferences) {
         // If user existed but had no preferences (old format)
         userData[chatId].preferences = { ...defaultPreferences };
         saveUserData();
         console.log(`Updated preferences for existing user: ${chatId}`);
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
bot.onText(/\/prices|🛒 Gotta Buy 'Em All/, async (msg) => { // Aggiunto '|🛒 Gotta Buy 'Em All'
    const chatId = String(msg.chat.id);
    const waitMessage = await bot.sendMessage(chatId, "Retrieving product list, please wait..."); // Wait message

    if (!previousProducts || previousProducts.length === 0) {
        bot.editMessageText("The product list is empty or no check has been performed yet. Use '🔄 Gotta Check \\'Em All' to start the first check.", { // Updated message
             chat_id: chatId,
             message_id: waitMessage.message_id
        });
        return;
    }

    // Rimuovi il messaggio di attesa
    await bot.deleteMessage(chatId, waitMessage.message_id);

    bot.sendMessage(chatId, `🛒 *Current Products List (${previousProducts.length}):*`);

    for (const product of previousProducts) {
        const caption = `
📦 *${product.title}*
💰 Price: *${product.price || 'N/A'}*
⭐ Rating: ${product.rating || 'N/A'}
🔗 [Product Link](${product.link || '#'})
`;

        try {
            if (product.image && product.image.startsWith('http')) {
                // Send photo if image is valid
                await bot.sendPhoto(chatId, product.image, {
                    caption: caption,
                    parse_mode: 'Markdown'
                });
            } else {
                // Otherwise send text only
                await bot.sendMessage(chatId, caption, {
                    parse_mode: 'Markdown',
                    disable_web_page_preview: true
                });
            }
            // Add small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 300)); // 0.3 seconds
        } catch (error) {
            console.error(`Error sending product (Chat ID: ${chatId}, Title: ${product.title}):`, error.message);
            // Send specific error message for that product if it fails
            if (error.response && error.response.statusCode === 400 && error.response.body?.includes('PHOTO_INVALID_DIMENSIONS')) { // Added optional chaining
                 await bot.sendMessage(chatId, `⚠️ Unable to send image for *${product.title}* (invalid dimensions).\n${caption}`, { parse_mode: 'Markdown', disable_web_page_preview: true });
            } else if (error.response && error.response.statusCode === 400 && error.response.body?.includes('URL_INVALID')) { // Added optional chaining
                 await bot.sendMessage(chatId, `⚠️ Unable to send image for *${product.title}* (invalid URL).\n${caption}`, { parse_mode: 'Markdown', disable_web_page_preview: true });
            } else {
                 await bot.sendMessage(chatId, `⚠️ Error sending product: *${product.title}*`, { parse_mode: 'Markdown' });
            }
             // Wait a bit longer after an error
             await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

     // Final message updated with timestamp
     const lastCheckTimeString = lastCheckTimestamp
         ? lastCheckTimestamp.toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Europe/Rome' })
         : 'Never';
     bot.sendMessage(chatId, `✅ Products list sent.\n🕒 Last check performed: *${lastCheckTimeString}*`, { parse_mode: 'Markdown' });
});
// --- Funzione di Controllo e Notifica ---
async function checkAndNotify() {
    console.log("Avvio controllo prodotti...");
    const currentProducts = await fetchData();

    if (!currentProducts) { // fetchData ora ritorna null o undefined in caso di errore grave
        console.error("Fetch fallito, controllo saltato.");
        return false;
    }
     if (currentProducts.length === 0 && previousProducts.length === 0) {
         console.log("Nessun prodotto trovato e nessuna lista precedente. Controllo saltato.");
         // Non aggiorniamo il timestamp se non troviamo nulla la prima volta
         return false;
     }


    // Aggiorna il timestamp SOLO se il fetch ha prodotto risultati o c'era una lista precedente
    lastCheckTimestamp = new Date();
    console.log(`Controllo completato il: ${lastCheckTimestamp.toLocaleString('it-IT', { timeZone: 'Europe/Rome' })}`);

    if (previousProducts.length > 0 || currentProducts.length > 0) { // Compara solo se c'è qualcosa da comparare
        const changes = compareProducts(previousProducts, currentProducts);
        await processNotifications(changes); // Usa la nuova funzione per gestire le notifiche per utente
    } else {
        console.log("Primo controllo eseguito, ma nessun prodotto trovato.");
    }

    previousProducts = currentProducts; // Aggiorna la lista precedente
    return true; // Indica che il controllo è stato eseguito (anche se non c'erano prodotti)
}


// --- Gestore Comando /check e Bottone ---
bot.onText(/\/check|🔄 Gotta Check 'Em All/, async (msg) => {
    const chatId = String(msg.chat.id);
    const waitMsg = await bot.sendMessage(chatId, "🔄 Starting manual product check...");

    const success = await checkAndNotify(); // Execute check and notifications

    if (success && lastCheckTimestamp) {
         const lastCheckTimeString = lastCheckTimestamp.toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Europe/Rome' });
         await bot.editMessageText(`✅ Manual check completed.\n🕒 Check time: *${lastCheckTimeString}*`, {
              chat_id: chatId,
              message_id: waitMsg.message_id,
              parse_mode: 'Markdown'
         });
    } else {
         await bot.editMessageText("⚠️ An error occurred during manual check or no products found. Check logs.", {
              chat_id: chatId,
              message_id: waitMsg.message_id
         });
    }
});




// Comando /settings
bot.onText(/\/settings|⚙️ Gotta Set 'Em All/, (msg) => {
    const chatId = String(msg.chat.id);
    showSettings(chatId);
});



// Gestore per i bottoni inline delle impostazioni
bot.on('callback_query', async (callbackQuery) => {
    const msg = callbackQuery.message;
    const chatId = String(msg.chat.id);
    const data = callbackQuery.data; // Es: 'toggle_new', 'set_threshold'

    // Rispondi subito alla callback query per rimuovere l'icona di caricamento dal bottone
    await bot.answerCallbackQuery(callbackQuery.id);

    // Assicurati che l'utente esista nei dati, altrimenti inizializza
    if (!userData[chatId]) {
        userData[chatId] = { preferences: { ...defaultPreferences }, registered: true };
    }
    // Assicurati che le preferenze esistano
    if (!userData[chatId].preferences) {
        userData[chatId].preferences = { ...defaultPreferences };
    }

    const prefs = userData[chatId].preferences; // Lavora direttamente sull'oggetto utente

    switch (data) {
        case 'toggle_new':
            prefs.notifyNew = !prefs.notifyNew;
            break;
        case 'toggle_removed':
            prefs.notifyRemoved = !prefs.notifyRemoved;
            break;
        case 'toggle_increase':
            prefs.notifyPriceIncrease = !prefs.notifyPriceIncrease;
            break;
        case 'toggle_all':
            prefs.notifyAllChanges = !prefs.notifyAllChanges;
            break;
        case 'toggle_notifications':
            prefs.notificationsEnabled = !prefs.notificationsEnabled;
            break;
        case 'close_settings':
            // Elimina il messaggio delle impostazioni
            try {
                await bot.deleteMessage(chatId, msg.message_id);
                console.log(`[${chatId}] Messaggio impostazioni chiuso.`);
            } catch (error) {
                console.error(`[${chatId}] Errore durante l'eliminazione del messaggio:`, error.message);
                // Se non possiamo eliminare, proviamo a modificarlo
                try {
                    await bot.editMessageText("✅ Impostazioni salvate.", {
                        chat_id: chatId,
                        message_id: msg.message_id,
                        reply_markup: { inline_keyboard: [] } // Rimuove i bottoni
                    });
                } catch (editError) {
                    console.error(`[${chatId}] Errore anche durante la modifica del messaggio:`, editError.message);
                }
            }
            return; // Esce dallo switch
        case 'set_threshold':
            // Invia un messaggio per richiedere la percentuale
            bot.sendMessage(chatId, "Inserisci la percentuale di diminuzione prezzo (0-100):").then(sentMsg => {
                console.log(`[${chatId}] Inviato messaggio ${sentMsg.message_id} per impostare soglia, attendo prossimo messaggio...`);
                
                // Variabile per tenere traccia se stiamo aspettando una risposta da questo utente
                userData[chatId].awaitingThreshold = true;
                userData[chatId].settingsMessageId = msg.message_id; // Salva l'ID del messaggio delle impostazioni
                saveUserData();
                
                // Imposta un timeout per cancellare lo stato di attesa dopo 5 minuti
                setTimeout(() => {
                    if (userData[chatId] && userData[chatId].awaitingThreshold) {
                        userData[chatId].awaitingThreshold = false;
                        saveUserData();
                        console.log(`[${chatId}] Timeout attesa soglia, stato di attesa rimosso.`);
                    }
                }, 5 * 60 * 1000); // 5 minuti
            }).catch(error => {
                console.error(`[${chatId}] Errore invio messaggio richiesta soglia:`, error);
                bot.sendMessage(chatId, "⚠️ Si è verificato un errore nell'invio della richiesta. Riprova.");
            });
            return; // Esce dallo switch
        default:
            console.log(`[${chatId}] Callback query non gestita: ${data}`);
            return; // Non fare nulla per callback non riconosciute
    }

    // Salva le modifiche (tranne per set_threshold che salva nel suo handler)
    saveUserData();
    console.log(`[${chatId}] Preferenze aggiornate:`, prefs);

    // Modifica il messaggio originale delle impostazioni per riflettere i cambiamenti (solo per i toggle)
    try {
        // Passa message_id per modificare il messaggio esistente
        await showSettings(chatId, msg.message_id);
    } catch (error) {
        console.error(`[${chatId}] Errore aggiornamento messaggio impostazioni:`, error.message);
        // Se la modifica fallisce (es. messaggio troppo vecchio), invia un nuovo messaggio
        if (error.response && error.response.body && error.response.body.description.includes("message to edit not found")) {
            console.log(`[${chatId}] Messaggio originale non trovato, invio nuove impostazioni.`);
            await showSettings(chatId); // Invia un nuovo messaggio
        } else {
            // Per altri errori di modifica, potresti voler solo loggare o inviare comunque un nuovo messaggio
            await showSettings(chatId);
        }
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


// Aggiungi questo gestore di messaggi generali dopo gli altri gestori
bot.on('message', (msg) => {
    const chatId = String(msg.chat.id);
    
    // Verifica se stiamo aspettando una soglia da questo utente
    if (userData[chatId] && userData[chatId].awaitingThreshold) {
        console.log(`[${chatId}] Ricevuto messaggio mentre si attendeva soglia: "${msg.text}"`);
        
        // Rimuovi lo stato di attesa
        userData[chatId].awaitingThreshold = false;
        const settingsMessageId = userData[chatId].settingsMessageId; // Recupera l'ID del messaggio delle impostazioni
        delete userData[chatId].settingsMessageId; // Pulisci il campo
        
        // Processa il messaggio come soglia
        const newThreshold = parseInt(msg.text, 10);
        if (!isNaN(newThreshold) && newThreshold >= 0) {
            // Aggiorna la soglia
            userData[chatId].preferences.priceDecreaseThreshold = newThreshold;
            saveUserData();
            console.log(`[${chatId}] Soglia impostata a: ${newThreshold}`);
            
            // Invia conferma
            bot.sendMessage(chatId, `✅ Price decrease threshold set to ${newThreshold}%.`);
            // Aggiorna il messaggio delle impostazioni se abbiamo salvato l'ID
            if (settingsMessageId) {
                showSettings(chatId, settingsMessageId);
            }
        } else {
            console.log(`[${chatId}] Invalid threshold received: "${msg.text}"`);
            bot.sendMessage(chatId, "❌ Invalid value. Please enter a positive integer or 0.");
            // Ripristina lo stato di attesa per permettere un nuovo tentativo
            userData[chatId].awaitingThreshold = true;
            saveUserData();
        }
        
        return; // Interrompe l'esecuzione per non processare ulteriormente il messaggio
    }
    
    // Qui puoi aggiungere altri gestori per messaggi generici se necessario
});


// Modifica showSettings per accettare opzionalmente un message_id da modificare
async function showSettings(chatId, messageIdToEdit = null) {
    const prefs = getUserPreferences(chatId);
    const message = `
⚙️ *Notification Settings*

Current status:
🔔 New Products: ${prefs.notifyNew ? '✅ Active' : '❌ Inactive'}
🗑️ Removed Products: ${prefs.notifyRemoved ? '✅ Active' : '❌ Inactive'} 
📈 Price Increases: ${prefs.notifyPriceIncrease ? '✅ Active' : '❌ Inactive'}
📉 Price Decrease Threshold: *${prefs.priceDecreaseThreshold}%* (0% = any decrease)
🚨 Notify All Changes: ${prefs.notifyAllChanges ? '✅ Active' : '❌ Inactive'} _(ignores other settings)_
🔕 Notifications: ${prefs.toggle_notifications ? '✅ Active' : '❌ Inactive'}

Click buttons to modify:
`;
    const keyboard = {
        inline_keyboard: [
            [
                { text: `New: ${prefs.notifyNew ? '✅' : '❌'}`, callback_data: 'toggle_new' },
                { text: `Removed: ${prefs.notifyRemoved ? '✅' : '❌'}`, callback_data: 'toggle_removed' }
            ],
            [
                { text: `Increases: ${prefs.notifyPriceIncrease ? '✅' : '❌'}`, callback_data: 'toggle_increase' },
                { text: `Threshold: ${prefs.priceDecreaseThreshold}%`, callback_data: 'set_threshold' }
            ],
            [
                { text: `Notify All: ${prefs.notifyAllChanges ? '✅' : '❌'}`, callback_data: 'toggle_all' },
                { text: `Enable Notifications: ${prefs.notificationsEnabled ? '✅' : '❌'}`, callback_data: 'toggle_notifications' }
            ],
            [
                { text: '✅ Close', callback_data: 'close_settings' }
            ]
        ]
    };

    if (messageIdToEdit) {
        try {
            await bot.editMessageText(message, {
                chat_id: chatId,
                message_id: messageIdToEdit,
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
            console.log(`[${chatId}] Messaggio impostazioni ${messageIdToEdit} modificato.`);
        } catch (editError) {
            console.error(`[${chatId}] Errore durante la modifica del messaggio ${messageIdToEdit}:`, editError.message);
            // Se la modifica fallisce, invia comunque un nuovo messaggio come fallback
            await bot.sendMessage(chatId, message, { parse_mode: 'Markdown', reply_markup: keyboard });
            console.log(`[${chatId}] Inviato nuovo messaggio impostazioni come fallback causa errore modifica.`);
        }
    } else {
        await bot.sendMessage(chatId, message, { parse_mode: 'Markdown', reply_markup: keyboard });
        console.log(`[${chatId}] Inviato nuovo messaggio impostazioni.`);
    }
}

bot.onText(/\/info|ℹ️ Gotta Info \' Em All/, (msg) => {
    showInfo(msg.chat.id);
});


function showInfo(chatId) {
    const infoMessage = `
ℹ️ *Amazon Prismatic Bot*

This bot automatically monitors Amazon's Prismatic collection products and sends you notifications when changes occur.

*Features:*
• Automatic monitoring every ${CHECK_INTERVAL_MS/60000} minutes
• Notifications for new products, removed products and price changes
• Customizable settings for each user
• Product image support

*Commands:*
• /start - Start the bot and show keyboard
• /check - Check products now
• /settings - Configure your notification preferences
• /info - Show this message

*Quick Keys:*
• 🛒 Gotta Buy 'Em All - Open Amazon page
• 🔄 Gotta Check 'Em All - Check products now
• ⚙️ Gotta Set 'Em All - Configure settings
• ℹ️ Gotta Info 'Em All - Show this message

Developed by @1vcian
GitHub: [1vcian/Amazon-Prismatic-Bot](https://github.com/1vcian/Amazon-Prismatic-Bot)
`;
    bot.sendMessage(chatId, infoMessage, { parse_mode: 'Markdown', disable_web_page_preview: true });
}