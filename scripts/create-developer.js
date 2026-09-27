// CLI helper: npm run create-developer -- "Dev Name" 9876543210 "StrongPasskey123" "dev-invite-2026"
require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../src/db');

async function createDeveloper() {
  const [name = 'Developer', mobile, passkey, inviteCode] = process.argv.slice(2);

  if (!mobile || !passkey || !inviteCode) {
    throw new Error('Usage: npm run create-developer -- "Name" <mobile> <passkey> <invite-code>');
  }
  if (inviteCode !== process.env.DEVELOPER_INVITE_CODE) throw new Error('Invalid developer invite code.');

  await db.initializeDatabase();
  const existing = await db.prepare("SELECT id FROM users WHERE role = 'developer' LIMIT 1").get();
  if (existing) throw new Error('A Developer account already exists. Only one is allowed.');

  const hash = bcrypt.hashSync(passkey, 12);
  await db.prepare("INSERT INTO users (name, mobile, passkey_hash, role) VALUES (?, ?, ?, 'developer')")
    .run(name, mobile, hash);
  console.log('Developer account created for mobile', mobile);
}

createDeveloper().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});