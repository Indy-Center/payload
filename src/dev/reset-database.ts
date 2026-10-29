import type { Payload } from 'payload'
import type { PostgresAdapter } from '@payloadcms/db-postgres'

/** Empties the database's tables, below the API so retire-not-delete doesn't stop it. */
export async function resetDatabase(payload: Payload): Promise<void> {
  const { pool } = payload.db as unknown as PostgresAdapter
  const { rows } = await pool.query<{ tablename: string }>(
    `select tablename from pg_tables where schemaname = 'public' and tablename not like 'payload_migrations%'`,
  )
  if (rows.length === 0) return
  const tables = rows.map((row) => `"${row.tablename}"`).join(', ')
  await pool.query(`truncate ${tables} cascade`)
}
