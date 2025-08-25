// backend/index.js
import cors from 'cors';
import 'dotenv/config'; // Make sure this is at the very top
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import mssql from 'mssql';

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('tiny'));

// Get environment variables directly
const SQL_HOST = process.env.SQL_HOST;
const SQL_PORT = process.env.SQL_PORT;
const SQL_USER = process.env.SQL_USER;
const SQL_PASSWORD = process.env.SQL_PASSWORD;
const SQL_DB = process.env.SQL_DB;
const DEBUG_SQL = process.env.DEBUG_SQL;

// If a variable is missing, you might want to log an error or exit
if (!SQL_HOST || !SQL_PORT || !SQL_USER || !SQL_PASSWORD || !SQL_DB) {
  console.error("Missing required environment variables!");
  process.exit(1);
}

const baseConfig = {
  server: SQL_HOST,
  port: Number(SQL_PORT),
  user: SQL_USER,
  password: SQL_PASSWORD,
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true
  },
  pool: { max: 5, min: 0, idleTimeoutMillis: 30000 }
};

const logSql = (sql) => { if (DEBUG_SQL === '1') console.log(sql); };

// Ensure DB + table exist, then seed one row
async function migrateAndSeed() {
  const masterPool = await mssql.connect({ ...baseConfig, database: 'master' });
  const createDbSql = `
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = N'${SQL_DB}')
BEGIN
  PRINT 'Creating database ${SQL_DB}...';
  EXEC('CREATE DATABASE [${SQL_DB}]');
END
`;
  logSql(createDbSql);
  await masterPool.request().query(createDbSql);
  await masterPool.close();

  const dbPool = await mssql.connect({ ...baseConfig, database: SQL_DB });
  const createTableSql = `
IF OBJECT_ID(N'dbo.AppLog', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.AppLog (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    Message NVARCHAR(4000) NOT NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    ClientIp NVARCHAR(45) NULL,
    UserAgent NVARCHAR(512) NULL
  );
END
`;
  logSql(createTableSql);
  await dbPool.request().query(createTableSql);

  const countRes = await dbPool.request().query('SELECT COUNT(1) AS c FROM dbo.AppLog;');
  if (countRes.recordset[0].c === 0) {
    await dbPool.request()
      .input('msg', mssql.NVarChar, 'Hello from auto-seed!')
      .query('INSERT INTO dbo.AppLog (Message) VALUES (@msg);');
  }

  return dbPool;
}

// Start up sequence
let pool;
migrateAndSeed()
  .then((p) => {
    pool = p;

    // Routes
    app.get('/api/health', async (_req, res) => {
      try {
        const r = await pool.request().query('SELECT SYSUTCDATETIME() AS utcNow;');
        res.json({ ok: true, dbUtcNow: r.recordset[0].utcNow });
      } catch (e) {
        res.status(500).json({ ok: false, error: String(e) });
      }
    });

    app.post('/api/logs', async (req, res) => {
      try {
        const message = String(req.body?.message ?? '').trim() || 'Hello from frontend';
        const clientIp = req.headers['x-real-ip'] || req.socket.remoteAddress || null;
        const userAgent = req.headers['user-agent'] || null;

        const result = await pool.request()
          .input('message', mssql.NVarChar, message)
          .input('clientIp', mssql.NVarChar, clientIp)
          .input('userAgent', mssql.NVarChar, userAgent)
          .query(`
INSERT INTO dbo.AppLog (Message, ClientIp, UserAgent)
OUTPUT INSERTED.Id, INSERTED.CreatedAt
VALUES (@message, @clientIp, @userAgent);
          `);

        const row = result.recordset[0];
        res.json({ ok: true, id: row.Id, createdAt: row.CreatedAt });
      } catch (e) {
        res.status(500).json({ ok: false, error: String(e) });
      }
    });

    const port = 3000;
    app.listen(port, () => console.log(`Backend listening on :${port}`));
  })
  .catch((err) => {
    console.error('Startup error:', err);
    process.exit(1);
  });