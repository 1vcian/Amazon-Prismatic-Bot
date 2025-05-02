const express = require('express');
const runCheck = require('./index');
const app = express();

app.get('/', async (req, res) => {
  res.send('Sono su (:');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server attivo su porta ${PORT}`);
});
