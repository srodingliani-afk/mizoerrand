import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';

export type StorageDriverType = 'local_json' | 'postgres_cloudsql';

export interface StorageDriverMetadata {
  driver: StorageDriverType;
  target: string;
  region: string;
  atomicWrites: boolean;
  postgresReady: boolean;
  lastSavedAt: string | null;
}

export interface StorageHealthReport {
  driver: StorageDriverType;
  target: string;
  region: string;
  connected: boolean;
  fallbackActive: boolean;
  latencyMs: number | null;
  lastSavedAt: string | null;
  pool?: {
    totalCount: number;
    idleCount: number;
    waitingCount: number;
  };
  error?: string;
}

/**
 * StorageAdapter<TState>
 * Clean repository/adapter contract decoupling ZoRun domain stores from the
 * underlying persistence medium. Uses LocalJsonStorageAdapter in development
 * and supports PostgreSQL connection pooling via SQL_HOST/SQL_USER/SQL_PASSWORD/SQL_DB_NAME.
 */
export interface StorageAdapter<TState> {
  readonly driverName: StorageDriverType;
  loadSync(): Partial<TState> | null;
  loadAsync(): Promise<Partial<TState> | null>;
  saveSync(state: TState): void;
  saveAsync(state: TState): Promise<void>;
  getMetadata(): StorageDriverMetadata;
  checkHealth(): Promise<StorageHealthReport>;
}

/**
 * LocalJsonStorageAdapter
 * Development persistence backed by atomic write-to-temp + rename on local disk,
 * preventing partial/corrupted JSON writes on unexpected restarts.
 */
export class LocalJsonStorageAdapter<TState> implements StorageAdapter<TState> {
  readonly driverName: StorageDriverType = 'local_json';
  private readonly dataDir: string;
  private readonly filePath: string;
  private lastSavedAt: string | null = null;

  constructor(options?: { dataDir?: string; fileName?: string }) {
    this.dataDir = options?.dataDir ?? path.resolve(process.cwd(), '.data');
    this.filePath = path.join(this.dataDir, options?.fileName ?? 'zorun-db.json');
  }

  loadSync(): Partial<TState> | null {
    try {
      if (!fs.existsSync(this.filePath)) {
        return null;
      }
      const raw = fs.readFileSync(this.filePath, 'utf8');
      return JSON.parse(raw) as Partial<TState>;
    } catch {
      return null;
    }
  }

  async loadAsync(): Promise<Partial<TState> | null> {
    return this.loadSync();
  }

  saveSync(state: TState): void {
    fs.mkdirSync(this.dataDir, { recursive: true });
    const tmpFile = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    const serialized = JSON.stringify(state, null, 2);
    fs.writeFileSync(tmpFile, serialized, 'utf8');
    fs.renameSync(tmpFile, this.filePath);
    this.lastSavedAt = new Date().toISOString();
  }

  async saveAsync(state: TState): Promise<void> {
    this.saveSync(state);
  }

  getMetadata(): StorageDriverMetadata {
    return {
      driver: this.driverName,
      target: '.data/zorun-db.json',
      region: 'asia-south1',
      atomicWrites: true,
      postgresReady: true,
      lastSavedAt: this.lastSavedAt,
    };
  }

  async checkHealth(): Promise<StorageHealthReport> {
    const start = Date.now();
    const exists = fs.existsSync(this.filePath);
    return {
      driver: this.driverName,
      target: '.data/zorun-db.json',
      region: 'asia-south1',
      connected: true,
      fallbackActive: true,
      latencyMs: Date.now() - start,
      lastSavedAt: this.lastSavedAt,
      error: exists ? undefined : 'Waiting for first state commit',
    };
  }
}

export const POSTGRES_STATE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS zorun_app_state (
  id TEXT PRIMARY KEY DEFAULT 'primary',
  region TEXT NOT NULL DEFAULT 'asia-south1',
  payload JSONB NOT NULL,
  version BIGINT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`.trim();

function assertSafeTableIdentifier(name: string): string {
  if (!/^[a-z_][a-z0-9_]{1,62}$/.test(name)) {
    throw new Error(`Invalid PostgreSQL table identifier: ${name}`);
  }
  return name;
}

/**
 * PostgresStorageAdapter
 * Uses standard discrete connection parameters (SQL_HOST, SQL_USER, SQL_PASSWORD, SQL_DB_NAME)
 * via the pg Object Method for Cloud SQL PostgreSQL with zero-downtime local JSON fallback.
 */
export class PostgresStorageAdapter<TState> implements StorageAdapter<TState> {
  readonly driverName: StorageDriverType = 'postgres_cloudsql';
  private readonly targetLabel: string;
  private readonly mirror: LocalJsonStorageAdapter<TState>;
  private readonly tableName: string;
  private readonly region: string;
  private readonly pool: Pool;
  private schemaBootstrapped = false;
  private lastSavedAt: string | null = null;
  private lastError: string | null = null;
  private saveInFlight = false;
  private queuedState: TState | null = null;

  constructor(options: {
    host: string;
    port?: number;
    user: string;
    password: string;
    database: string;
    tableName?: string;
    region?: string;
  }) {
    this.tableName = assertSafeTableIdentifier(options.tableName ?? 'zorun_app_state');
    this.region = options.region ?? 'asia-south1';
    this.targetLabel = `${options.host}/${options.database}`;
    this.mirror = new LocalJsonStorageAdapter<TState>();

    this.pool = new Pool({
      host: options.host,
      port: options.port ?? 5432,
      user: options.user,
      password: options.password,
      database: options.database,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      application_name: `zorun-${this.region}`,
    });

    this.pool.on('error', (err) => {
      this.lastError = err.message;
    });
  }

  private async ensureSchema(): Promise<void> {
    if (this.schemaBootstrapped) return;
    await this.pool.query(POSTGRES_STATE_SCHEMA_SQL);
    this.schemaBootstrapped = true;
  }

  loadSync(): Partial<TState> | null {
    return this.mirror.loadSync();
  }

  async loadAsync(): Promise<Partial<TState> | null> {
    try {
      await this.ensureSchema();
      const result = await this.pool.query<{ payload: Partial<TState> }>(
        `SELECT payload FROM ${this.tableName} WHERE id = $1 LIMIT 1`,
        ['primary']
      );
      if (result.rows[0]?.payload) {
        this.lastError = null;
        return result.rows[0].payload;
      }
      return this.mirror.loadSync();
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : 'PostgreSQL load failed';
      return this.mirror.loadSync();
    }
  }

  saveSync(state: TState): void {
    this.mirror.saveSync(state);
    this.lastSavedAt = new Date().toISOString();
    this.enqueueAsyncSave(state);
  }

  private enqueueAsyncSave(state: TState): void {
    this.queuedState = state;
    if (this.saveInFlight) return;
    this.saveInFlight = true;
    void (async () => {
      try {
        while (this.queuedState) {
          const next = this.queuedState;
          this.queuedState = null;
          await this.persistToPostgres(next);
        }
      } finally {
        this.saveInFlight = false;
      }
    })();
  }

  private async persistToPostgres(state: TState): Promise<void> {
    try {
      await this.ensureSchema();
      await this.pool.query(
        `INSERT INTO ${this.tableName} (id, region, payload, version, updated_at)
         VALUES ($1, $2, $3::jsonb, 1, NOW())
         ON CONFLICT (id)
         DO UPDATE SET
           payload = EXCLUDED.payload,
           version = ${this.tableName}.version + 1,
           updated_at = NOW()`,
        ['primary', this.region, JSON.stringify(state)]
      );
      this.lastSavedAt = new Date().toISOString();
      this.lastError = null;
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : 'PostgreSQL sync error';
    }
  }

  async saveAsync(state: TState): Promise<void> {
    this.mirror.saveSync(state);
    await this.persistToPostgres(state);
  }

  getMetadata(): StorageDriverMetadata {
    return {
      driver: this.driverName,
      target: this.targetLabel,
      region: this.region,
      atomicWrites: true,
      postgresReady: true,
      lastSavedAt: this.lastSavedAt,
    };
  }

  async checkHealth(): Promise<StorageHealthReport> {
    const start = Date.now();
    try {
      await this.pool.query('SELECT 1 AS ok');
      const latencyMs = Date.now() - start;
      this.lastError = null;
      return {
        driver: this.driverName,
        target: this.targetLabel,
        region: this.region,
        connected: true,
        fallbackActive: false,
        latencyMs,
        lastSavedAt: this.lastSavedAt,
        pool: {
          totalCount: this.pool.totalCount,
          idleCount: this.pool.idleCount,
          waitingCount: this.pool.waitingCount,
        },
      };
    } catch (err) {
      return {
        driver: this.driverName,
        target: this.targetLabel,
        region: this.region,
        connected: false,
        fallbackActive: true,
        latencyMs: Date.now() - start,
        lastSavedAt: this.lastSavedAt,
        pool: {
          totalCount: this.pool.totalCount,
          idleCount: this.pool.idleCount,
          waitingCount: this.pool.waitingCount,
        },
        error: err instanceof Error ? err.message : this.lastError || 'Connection failed',
      };
    }
  }
}

/**
 * Factory selecting the active StorageAdapter from environment configuration.
 * - Uses PostgresStorageAdapter when SQL_HOST, SQL_USER, SQL_PASSWORD, and SQL_DB_NAME are set.
 * - Defaults cleanly to LocalJsonStorageAdapter for zero-config local development.
 */
export function createStorageAdapter<TState>(): StorageAdapter<TState> {
  const host = (process.env.SQL_HOST || '').trim();
  const user = (process.env.SQL_USER || '').trim();
  const password = (process.env.SQL_PASSWORD || '').trim();
  const database = (process.env.SQL_DB_NAME || '').trim();
  const forcedLocal = (process.env.STORAGE_DRIVER || '').toLowerCase() === 'local_json';

  if (host && user && password && database && !forcedLocal) {
    return new PostgresStorageAdapter<TState>({
      host,
      port: Number(process.env.SQL_PORT || 5432),
      user,
      password,
      database,
      region: process.env.ZORUN_REGION || 'asia-south1',
    });
  }
  return new LocalJsonStorageAdapter<TState>();
}
