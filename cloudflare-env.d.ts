declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    FUJI_BACKUP_KEY?: string;
    FUJI_OPERATIONS_TOKEN?: string;
    FUJI_DAILY_BACKUP_VERIFIER?: string;
  }
}
