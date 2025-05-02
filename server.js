const express = require('express');
const runCheck = require('./index');
const app = express();

app.get('/check', async (req, res) => {
  await runCheck();
  res.send('Check completato.');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server attivo su porta ${PORT}`);
});
