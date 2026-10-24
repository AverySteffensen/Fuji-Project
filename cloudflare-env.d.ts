declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    FUJI_MFA_KEY?: string;
    FUJI_BACKUP_KEY?: string;
    FUJI_OPERATIONS_TOKEN?: string;
  }
}
