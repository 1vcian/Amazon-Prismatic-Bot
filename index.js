const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
require('dotenv').config();

const URL = 'https://www.amazon.it/stores/page/BA1E70A5-3500-44A3-BC30-B0FB450B17BB';

let previousProducts = [];

async function fetchData() {
  const response = await axios.get(URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept-Language': 'it-IT'
    }
  });

  const $ = cheerio.load(response.data);
  const items = $('.ProductGridItem__itemInfoChild__hUHB0');
  
  const products = [];

  items.each((_, item) => {
    const title = $(item).find('a[data-testid="product-grid-title"]').text().trim();
    const price = $(item).find('[data-testid="grid-item-buy-price"]').text().trim().replace(/\n/g, '');
    if (title) products.push({ title, price });
  });

  return products;
}

function compareProducts(oldList, newList) {
  const changes = [];

  if (oldList.length !== newList.length) {
    changes.push(`📦 Numero di prodotti cambiato: da ${oldList.length} a ${newList.length}`);
  }

  newList.forEach((newItem, i) => {
    const oldItem = oldList[i];
    if (!oldItem) return;

    if (newItem.title !== oldItem.title) {
      changes.push(`🆕 Nome cambiato:\n${oldItem.title} → ${newItem.title}`);
    }
    if (newItem.price !== oldItem.price) {
      changes.push(`💰 Prezzo cambiato:\n${newItem.title}\n${oldItem.price} → ${newItem.price}`);
    }
  });

  return changes;
}

async function notifyTelegram(message) {
  const chats = JSON.parse(fs.readFileSync('./chats.json'));
  for (const chatId of chats) {
    await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`, {
      chat_id: chatId,
      text: message,
      parse_mode: 'Markdown'
    });
  }
}

module.exports = async function runCheck() {
  try {
    const current = await fetchData();

    if (previousProducts.length === 0) {
      previousProducts = current;
      return;
    }

    const changes = compareProducts(previousProducts, current);

    if (changes.length > 0) {
      const msg = `⚠️ *Cambiamenti rilevati su Amazon:*\n\n${changes.join('\n\n')}`;
      await notifyTelegram(msg);
    }

    previousProducts = current;
  } catch (error) {
    console.error('Errore nel check:', error.message);
  }
};
