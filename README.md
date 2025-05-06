# Amazon Prismatic Bot

This is a Node.js Telegram bot designed to monitor a specific Amazon store page (in this case, dedicated to "Prismatic Evolutions" of the Pokémon TCG on Amazon.it) and notify users on Telegram about changes in available products.

## How It Works

1.  **Data Retrieval:** The script uses [Jina AI Reader](https://jina.ai/reader/) to obtain a simplified text version of the specified Amazon store page. This helps bypass the complexity of direct HTML rendering.
2.  **Parsing:** Analyzes the text received from Jina AI to extract key product information, such as:
    *   Product image
    *   Title
    *   Price
    *   Product page link
    *   Rating (if available)
      <p align="center">
        <img width="323" alt="image" src="https://github.com/user-attachments/assets/be103a78-78d9-41e5-b79e-c893aa995c12" />

      </p>
3.  **Comparison:** Compares the newly retrieved product list with the list from the last check. Identifies:
    *   Added products (truly new products never seen before)
    *   Removed products
    *   Modified products (changes in price, title, rating, or image)
    *   Reappeared products (previously removed products that are available again)
      <p align="center">
      <img width="411" alt="image" src="https://github.com/user-attachments/assets/b3630a56-6590-47f6-818a-056cebfe2b05" />
      </p>
4.  **Notification:** If changes are detected, sends detailed notifications via Telegram bot to subscribed users. Notifications include:
    *   A summary of changes (how many added, removed, modified, reappeared).
    *   Individual messages for each added, removed, modified, or reappeared product, with specific details and a link to the product. Product image is also included when possible.
    *   Option to disable reappeared product notifications when sellers frequently add/remove the same products
5.  **Persistence:** Telegram chat IDs of subscribed users are saved in the `user_data.json` file to ensure notifications are sent to the correct users even after script restart.
6.  **Periodic Execution:** The script performs checks at regular intervals (configurable via `CHECK_INTERVAL_MS` in `index.js`) to continuously monitor the page.
7.  **Web Server:** A simple Express server (`server.js`) is included to keep the process active, useful for hosting platforms like Replit, Glitch, or similar.

## Main Features

*   Automatic monitoring of an Amazon store page.
*   Extraction of product details (title, price, image, link, rating).
*   Detection of new, removed, or modified products.
*   Detailed notifications via Telegram.
*   Management of subscribed users through bot commands.
*   Configuration through environment variables (`.env`).
*   Customization of notification preferences for each user.

## Setup and Installation

1.  **Clone the repository:**
    ```bash
    git clone <your-repository-url>
    cd Amazon-Prismatic-Bot
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Create a `.env` file:**
    In the project's root directory, create a file called `.env` and add your Telegram bot token:
    ```dotenv
    TELEGRAM_TOKEN=YOUR_TELEGRAM_TOKEN_HERE
    ```
    *Note: Get the token from BotFather on Telegram.*
4.  **Start the bot:**
    ```bash
    npm start
    ```
    This command will run `node server.js`, which in turn will start the monitoring defined in `index.js`.

## Usage (Telegram Commands)

Interact with the bot on Telegram:

*   `/start`: Register your chat to receive notifications and show the main keyboard.
*   `/check`: Start a manual check to verify products.
*   `/settings`: Configure your notification preferences.
*   `/info`: Show information about the bot and available commands.

## Quick Keys

*   🛒 Gotta Buy 'Em All - Open Amazon page
*   🔄 Gotta Check 'Em All - Check products now
*   ⚙️ Gotta Set 'Em All - Configure settings
*   🛍️ Gotta Go to Store - Amazon Store Link
*   ℹ️ Gotta Info 'Em All - Show information
  <p align="center">
     <img width="426" alt="image" src="https://github.com/user-attachments/assets/e15ff31e-e0f8-4333-9985-11f2254d9ee3" />

  </p>

## Main Dependencies

*   `axios`: For making HTTP requests (to Jina AI Reader).
*   `node-telegram-bot-api`: For interacting with Telegram API.
*   `dotenv`: For loading environment variables from `.env` file.
*   `express`: For creating the basic web server.

*(See `package.json` for complete list)*

## Important Note

This script depends on the external Jina AI Reader service to interpret the Amazon page. Changes in Amazon's page layout or in Jina AI Reader's functionality might require updates to the script to continue working correctly.
<p align="center">
<img width="454" alt="image" src="https://github.com/user-attachments/assets/641f5b85-5178-4d5a-8788-dae0ec6ea47a" />

</p>
