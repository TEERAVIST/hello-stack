// backend/index.js
import cors from 'cors';
import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import mssql from 'mssql';

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('tiny'));

const {
  SQL_HOST = '172.16.23.221',
  SQL_PORT = '3369',
  SQL_USER = 'sa',
  SQL_PASSWORD = 'Kanasorn123',
  SQL_DB = 'hello_app',
  DEBUG_SQL = '0',
} = process.env;

const baseConfig = {
  server: SQL_HOST,
  port: Number(SQL_PORT),
  user: SQL_USER,
  password: SQL_PASSWORD,
  options: {
    encrypt: false,
    trustServerCertificate: true, // useful on LAN/self-signed
    enableArithAbort: true
  },
  pool: { max: 5, min: 0, idleTimeoutMillis: 30000 }
};

const logSql = (sql) => { if (DEBUG_SQL === '1') console.log(sql); };

// Ensure DB + table exist, then seed one row
async function migrateAndSeed() {
  // 1) connect to master to create DB if missing
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

  // 2) connect to target DB
  const dbPool = await mssql.connect({ ...baseConfig, database: SQL_DB });

  // 3) create table if missing
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

  // 4) seed a welcome row if table is empty
  const countRes = await dbPool.request().query('SELECT COUNT(1) AS c FROM dbo.AppLog;');
  if (countRes.recordset[0].c === 0) {
    await dbPool.request()
      .input('msg', mssql.NVarChar, 'Hello from auto-seed!')
      .query('INSERT INTO dbo.AppLog (Message) VALUES (@msg);');
  }

  return dbPool; // keep pool open for app usage
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
