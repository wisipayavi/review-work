const path = require('path');
const { createApp } = require('./app');

const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'apps', 'api', 'data.sqlite');
const app = createApp({ dbPath });

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
