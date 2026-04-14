/**
 * Migrate orphan data (user_id IS NULL) to a specified user.
 *
 * Usage:
 *   node scripts/migrate-orphan-data.js <username_or_email>
 *
 * Example:
 *   node scripts/migrate-orphan-data.js liuzhi
 *   node scripts/migrate-orphan-data.js liuzhi465@163.com
 */

import db from '../server/db.js'

const identifier = process.argv[2]
if (!identifier) {
  console.error('Usage: node scripts/migrate-orphan-data.js <username_or_email>')
  process.exit(1)
}

const user = db.prepare('SELECT id, username, email FROM users WHERE username = ? OR email = ?').get(identifier, identifier)
if (!user) {
  console.error(`User not found: ${identifier}`)
  const users = db.prepare('SELECT id, username, email FROM users').all()
  console.error('Available users:', users)
  process.exit(1)
}

console.log(`Migrating orphan data to: ${user.username} (id=${user.id}, email=${user.email})`)

const migrate = db.transaction(() => {
  const tables = ['trades', 'weekly_notes', 'monthly_notes', 'pairs', 'policies']
  for (const table of tables) {
    const r = db.prepare(`UPDATE ${table} SET user_id = ? WHERE user_id IS NULL`).run(user.id)
    console.log(`  ${table}: ${r.changes} rows`)
  }
})
migrate()

console.log('Done.')
