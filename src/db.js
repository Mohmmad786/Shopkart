const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.PG_POOL_MAX) || 1,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 5000
});

function toPostgres(sql) {
  let parameter = 0;
  return sql.replace(/\?/g, () => `$${++parameter}`);
}

const db = {
  prepare(sql) {
    return {
      get: async (...params) => {
        const result = await pool.query(toPostgres(sql), params);
        return result.rows[0];
      },
      all: async (...params) => {
        const result = await pool.query(toPostgres(sql), params);
        return result.rows;
      },
      run: async (...params) => {
        let statement = toPostgres(sql.trim().replace(/;$/, ''));
        if (/^INSERT\b/i.test(statement) && !/\bRETURNING\b/i.test(statement)) {
          statement += ' RETURNING id';
        }
        const result = await pool.query(statement, params);
        return { lastInsertRowid: result.rows[0]?.id, changes: result.rowCount };
      }
    };
  },
  exec: (sql) => pool.query(sql)
};

let initialization;
async function initializeDatabase() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Add your Neon connection string to the environment.');
  }
  if (!initialization) {
    initialization = (async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(731904221)');
        await client.query(`
          CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL DEFAULT 'User',
            mobile TEXT NOT NULL UNIQUE,
            email TEXT UNIQUE,
            passkey_hash TEXT NOT NULL,
            role TEXT NOT NULL CHECK (role IN ('developer', 'seller', 'customer')),
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
          );
          CREATE TABLE IF NOT EXISTS categories (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
          );
          CREATE TABLE IF NOT EXISTS products (
            id SERIAL PRIMARY KEY,
            seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            category_id INTEGER REFERENCES categories(id) ON DELETE RESTRICT,
            title TEXT NOT NULL,
            image TEXT NOT NULL,
            price DOUBLE PRECISION NOT NULL CHECK (price > 0),
            description TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
          );
          ALTER TABLE products ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES categories(id) ON DELETE RESTRICT;
          CREATE INDEX IF NOT EXISTS idx_products_seller ON products(seller_id);
          CREATE INDEX IF NOT EXISTS idx_products_title ON products(title);
          CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
          CREATE TABLE IF NOT EXISTS invite_codes (
            id SERIAL PRIMARY KEY,
            code TEXT NOT NULL UNIQUE,
            active SMALLINT NOT NULL DEFAULT 1,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
          );
          CREATE TABLE IF NOT EXISTS auth_rate_limits (
            client_ip TEXT PRIMARY KEY,
            window_started_at BIGINT NOT NULL,
            request_count INTEGER NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
          );
          CREATE UNIQUE INDEX IF NOT EXISTS idx_single_developer ON users(role) WHERE role = 'developer';
          CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_name_ci ON categories(LOWER(name));
        `);
        if (process.env.DEVELOPER_INVITE_CODE) {
          await client.query(
            'INSERT INTO invite_codes (code) VALUES ($1) ON CONFLICT (code) DO NOTHING',
            [process.env.DEVELOPER_INVITE_CODE.trim()]
          );
        }
        await client.query("DELETE FROM auth_rate_limits WHERE updated_at < CURRENT_TIMESTAMP - INTERVAL '1 day'");
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    })().catch((error) => {
      initialization = undefined;
      throw error;
    });
  }
  return initialization;
}

module.exports = { ...db, initializeDatabase, pool };