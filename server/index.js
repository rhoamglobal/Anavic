const { app } = require('./app');
const db = require('./db');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`  ANAVIC GAS STATION MANAGEMENT SYSTEM RUNNING    `);
  console.log(`  Local server URL: http://localhost:${PORT}      `);
  console.log(`==================================================`);
});
