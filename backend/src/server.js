import 'dotenv/config';
import { createApp } from './app.js';
import { initDb } from './db/schema.js';

const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

initDb(process.env.DB_PATH || './data/fluenttype.db');
const app = createApp();
app.listen(PORT, () => console.log(`FluentType running on http://localhost:${PORT} [${isProd ? 'production' : 'dev'}]`));
