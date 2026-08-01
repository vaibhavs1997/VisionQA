import { Pool } from "pg";

export interface User {
  id: string;
  email: string;
  createdAt: string;
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  password_salt: string;
  created_at: Date;
}

function toUser(row: UserRow): User {
  return { id: row.id, email: row.email, createdAt: row.created_at.toISOString() };
}

export async function createUser(
  pool: Pool,
  input: { email: string; passwordHash: string; passwordSalt: string }
): Promise<User> {
  const result = await pool.query<UserRow>(
    `INSERT INTO users (email, password_hash, password_salt) VALUES ($1, $2, $3) RETURNING *`,
    [input.email.toLowerCase(), input.passwordHash, input.passwordSalt]
  );
  return toUser(result.rows[0]);
}

export async function findUserByEmail(
  pool: Pool,
  email: string
): Promise<(User & { passwordHash: string; passwordSalt: string }) | null> {
  const result = await pool.query<UserRow>(`SELECT * FROM users WHERE email = $1`, [email.toLowerCase()]);
  const row = result.rows[0];
  if (!row) return null;
  return { ...toUser(row), passwordHash: row.password_hash, passwordSalt: row.password_salt };
}

export async function getUserById(pool: Pool, id: string): Promise<User | null> {
  const result = await pool.query<UserRow>(`SELECT * FROM users WHERE id = $1`, [id]);
  return result.rows[0] ? toUser(result.rows[0]) : null;
}
