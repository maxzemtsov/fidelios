import { afterEach, describe, expect, it } from "vitest";
import postgres from "postgres";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./test-embedded-postgres.js";

const cleanups: Array<() => Promise<void>> = [];
const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported
  ? describe
  : describe.skip;

async function createTempDatabase(): Promise<string> {
  const db = await startEmbeddedPostgresTestDatabase(
    "fidelios-db-analytics-",
  );
  cleanups.push(db.cleanup);
  return db.connectionString;
}

afterEach(async () => {
  while (cleanups.length > 0) {
    const cleanup = cleanups.pop();
    await cleanup?.();
  }
});

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping analytics tests: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("analytics schema", () => {
  it(
    "creates all 4 analytics tables with correct structure",
    async () => {
      const connectionString = await createTempDatabase();
      const sql = postgres(connectionString, { max: 1, onnotice: () => {} });

      try {
        const tables = await sql`
          SELECT tablename FROM pg_tables
          WHERE tablename LIKE 'analytics_%'
          ORDER BY tablename
        `;
        expect(tables.map((r) => r.tablename)).toEqual([
          "analytics_articles",
          "analytics_markets",
          "analytics_price_history",
          "analytics_signals",
        ]);
      } finally {
        await sql.end();
      }
    },
    { timeout: 120_000 },
  );

  it(
    "pgvector extension is enabled and vector columns work",
    async () => {
      const connectionString = await createTempDatabase();
      const sql = postgres(connectionString, { max: 1, onnotice: () => {} });

      try {
        const extensions = await sql`
          SELECT extname FROM pg_extension WHERE extname = 'vector'
        `;
        expect(extensions).toHaveLength(1);

        // Insert article with embedding
        const embedding = new Array(768).fill(0).map((_, i) => Math.sin(i / 100));
        const embeddingStr = `[${embedding.join(",")}]`;

        await sql`
          INSERT INTO analytics_articles (title, content, published_at, source, tags, embedding)
          VALUES (
            'Test Vector Article',
            'Testing pgvector embeddings for similarity search',
            '2026-04-01T00:00:00Z',
            'test',
            ${sql.array(["test", "vector"])},
            ${embeddingStr}::vector
          )
        `;

        const rows = await sql`SELECT id, embedding FROM analytics_articles LIMIT 1`;
        expect(rows).toHaveLength(1);
        expect(rows[0].embedding).toBeTruthy();
      } finally {
        await sql.end();
      }
    },
    { timeout: 120_000 },
  );

  it(
    "tsvector search_vector column is auto-generated",
    async () => {
      const connectionString = await createTempDatabase();
      const sql = postgres(connectionString, { max: 1, onnotice: () => {} });

      try {
        await sql`
          INSERT INTO analytics_articles (title, content, published_at)
          VALUES ('Prediction Markets Rise', 'Polymarket sees record volume in election markets', '2026-04-01T00:00:00Z')
        `;

        const rows = await sql`
          SELECT search_vector::text FROM analytics_articles
          WHERE search_vector @@ to_tsquery('english', 'market')
        `;
        expect(rows).toHaveLength(1);

        const noRows = await sql`
          SELECT id FROM analytics_articles
          WHERE search_vector @@ to_tsquery('english', 'blockchain')
        `;
        expect(noRows).toHaveLength(0);
      } finally {
        await sql.end();
      }
    },
    { timeout: 120_000 },
  );

  it(
    "inserts sample rows into all 4 tables with foreign key relationships",
    async () => {
      const connectionString = await createTempDatabase();
      const sql = postgres(connectionString, { max: 1, onnotice: () => {} });

      try {
        // Insert article
        const [article] = await sql`
          INSERT INTO analytics_articles (title, content, published_at, source, tags)
          VALUES ('Election Coverage', 'Detailed analysis of prediction market movements', '2026-04-01T00:00:00Z', 'reuters', ARRAY['politics', 'markets']::text[])
          RETURNING id
        `;

        // Insert market
        const [market] = await sql`
          INSERT INTO analytics_markets (external_id, question, description, category, outcome_prices, volume_total)
          VALUES ('poly-123', 'Will candidate X win?', 'Presidential election market', 'politics', '{"Yes": 0.65, "No": 0.35}'::jsonb, 1500000)
          RETURNING id
        `;

        // Insert price history
        await sql`
          INSERT INTO analytics_price_history (market_id, timestamp, price)
          VALUES
            (${market.id}, '2026-04-01T00:00:00Z', 0.55),
            (${market.id}, '2026-04-02T00:00:00Z', 0.60),
            (${market.id}, '2026-04-03T00:00:00Z', 0.65)
        `;

        // Insert signal
        await sql`
          INSERT INTO analytics_signals (article_id, market_id, similarity_score, time_delta_hours, price_at_publish, signal_quality)
          VALUES (${article.id}, ${market.id}, 0.87, 12, 0.55, 'high')
        `;

        // Verify counts
        const articleCount = await sql`SELECT count(*) as c FROM analytics_articles`;
        const marketCount = await sql`SELECT count(*) as c FROM analytics_markets`;
        const priceCount = await sql`SELECT count(*) as c FROM analytics_price_history`;
        const signalCount = await sql`SELECT count(*) as c FROM analytics_signals`;

        expect(Number(articleCount[0].c)).toBe(1);
        expect(Number(marketCount[0].c)).toBe(1);
        expect(Number(priceCount[0].c)).toBe(3);
        expect(Number(signalCount[0].c)).toBe(1);
      } finally {
        await sql.end();
      }
    },
    { timeout: 120_000 },
  );

  it(
    "hybrid search (RRF) query returns ranked results",
    async () => {
      const connectionString = await createTempDatabase();
      const sql = postgres(connectionString, { max: 1, onnotice: () => {} });

      try {
        // Insert multiple articles with embeddings
        const baseEmbedding = new Array(768).fill(0).map((_, i) => Math.sin(i / 100));
        const similarEmbedding = baseEmbedding.map((v) => v + Math.random() * 0.01);
        const differentEmbedding = new Array(768).fill(0).map((_, i) => Math.cos(i / 50));

        await sql`
          INSERT INTO analytics_articles (title, content, published_at, embedding) VALUES
          ('Prediction Markets Surge', 'Polymarket trading volume hits all-time high as election approaches', '2026-04-01T00:00:00Z', ${`[${baseEmbedding.join(",")}]`}::vector),
          ('Market Analysis Report', 'Election prediction markets show increased activity and accuracy', '2026-04-02T00:00:00Z', ${`[${similarEmbedding.join(",")}]`}::vector),
          ('Weather Forecast Today', 'Sunny skies expected across the region with mild temperatures', '2026-04-03T00:00:00Z', ${`[${differentEmbedding.join(",")}]`}::vector)
        `;

        // Hybrid search: combine full-text search with vector similarity using RRF
        const queryEmbedding = `[${baseEmbedding.join(",")}]`;
        const searchQuery = "prediction markets election";
        const k = 60; // RRF constant

        const results = await sql`
          WITH text_ranked AS (
            SELECT id, title,
              ROW_NUMBER() OVER (ORDER BY ts_rank(search_vector, websearch_to_tsquery('english', ${searchQuery})) DESC) as text_rank
            FROM analytics_articles
            WHERE search_vector @@ websearch_to_tsquery('english', ${searchQuery})
          ),
          vector_ranked AS (
            SELECT id, title,
              ROW_NUMBER() OVER (ORDER BY embedding <=> ${queryEmbedding}::vector) as vec_rank
            FROM analytics_articles
            WHERE embedding IS NOT NULL
            ORDER BY embedding <=> ${queryEmbedding}::vector
            LIMIT 10
          )
          SELECT
            COALESCE(t.id, v.id) as id,
            COALESCE(t.title, v.title) as title,
            COALESCE(1.0 / (${k} + t.text_rank), 0) + COALESCE(1.0 / (${k} + v.vec_rank), 0) as rrf_score
          FROM text_ranked t
          FULL OUTER JOIN vector_ranked v ON t.id = v.id
          ORDER BY rrf_score DESC
        `;

        // The prediction markets article should rank highest (matches both text and vector)
        expect(results.length).toBeGreaterThanOrEqual(2);
        expect(results[0].title).toBe("Prediction Markets Surge");

        // The weather article should rank lower or not appear in text search
        const weatherResult = results.find(
          (r) => r.title === "Weather Forecast Today",
        );
        if (weatherResult) {
          expect(Number(weatherResult.rrf_score)).toBeLessThan(
            Number(results[0].rrf_score),
          );
        }
      } finally {
        await sql.end();
      }
    },
    { timeout: 120_000 },
  );
});
