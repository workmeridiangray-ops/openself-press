declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    GOOGLE_BOOKS_FEED_MODE?: string;
    GOOGLE_BOOKS_FEED_USERNAME?: string;
    GOOGLE_BOOKS_FEED_PASSWORD?: string;
  }
}
