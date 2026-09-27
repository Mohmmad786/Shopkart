const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

function readHidden(prompt) {
  const { stdin, stdout } = process;
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
    return Promise.reject(new Error('Run this script directly in an interactive terminal.'));
  }

  return new Promise((resolve, reject) => {
    let value = '';
    const restore = () => {
      stdin.removeListener('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write('\n');
    };
    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === '\u0003') {
          restore();
          reject(new Error('Cancelled.'));
          return;
        }
        if (character === '\r' || character === '\n') {
          restore();
          resolve(value);
          return;
        }
        if (character === '\u007f' || character === '\b') {
          value = value.slice(0, -1);
        } else if (character >= ' ') {
          value += character;
        }
      }
    };

    stdout.write(prompt);
    stdin.setEncoding('utf8');
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}

async function resetDeveloperPasskey() {
  const connectionString = await readHidden('Vercel PostgreSQL URL (input hidden): ');
  let parsedUrl;
  try {
    parsedUrl = new URL(connectionString);
  } catch {
    throw new Error('The database URL is invalid.');
  }
  if (!['postgres:', 'postgresql:'].includes(parsedUrl.protocol)) {
    throw new Error('The database URL must use PostgreSQL.');
  }

  const passkey = await readHidden('New Developer passkey (input hidden): ');
  if (passkey.length < 8 || passkey.length > 72) {
    throw new Error('Passkey must be between 8 and 72 characters.');
  }

  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 10000 });
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const developers = await client.query("SELECT id FROM users WHERE role = 'developer' LIMIT 2");
    if (developers.rowCount !== 1) {
      throw new Error(`Expected exactly one Developer account; found ${developers.rowCount}. No changes were made.`);
    }

    const passkeyHash = await bcrypt.hash(passkey, 12);
    const result = await client.query('UPDATE users SET passkey_hash = $1 WHERE id = $2 AND role = $3', [
      passkeyHash,
      developers.rows[0].id,
      'developer'
    ]);
    if (result.rowCount !== 1) throw new Error('Developer account changed during reset. No changes were committed.');
    await client.query('COMMIT');
    console.log('Developer passkey reset successfully.');
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client?.release();
    await pool.end();
  }
}

resetDeveloperPasskey().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});