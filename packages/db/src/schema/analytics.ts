import {
  pgTable,
  uuid,
  text,
  timestamp,
  numeric,
  integer,
  jsonb,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core";
import { vector } from "drizzle-orm/pg-core";

// Note: search_vector (tsvector GENERATED ALWAYS AS) is added via raw SQL in the migration
// because Drizzle does not support generated tsvector columns natively.

export const analyticsArticles = pgTable(
  "analytics_articles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    source: text("source"),
    sourceUrl: text("source_url"),
    tags: text("tags").array(),
    embedding: vector("embedding", { dimensions: 768 }),
  },
  (table) => ({
    embeddingIdx: index("analytics_articles_embedding_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops"),
    ),
    publishedAtIdx: index("analytics_articles_published_at_idx").on(
      table.publishedAt,
    ),
  }),
);

export const analyticsMarkets = pgTable(
  "analytics_markets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    externalId: text("external_id").unique(),
    question: text("question").notNull(),
    description: text("description"),
    category: text("category"),
    outcome: text("outcome"),
    outcomePrices: jsonb("outcome_prices"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }),
    volumeTotal: numeric("volume_total"),
    embedding: vector("embedding", { dimensions: 768 }),
  },
  (table) => ({
    embeddingIdx: index("analytics_markets_embedding_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops"),
    ),
    closedAtIdx: index("analytics_markets_closed_at_idx").on(table.closedAt),
  }),
);

export const analyticsPriceHistory = pgTable(
  "analytics_price_history",
  {
    marketId: uuid("market_id")
      .notNull()
      .references(() => analyticsMarkets.id),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
    price: numeric("price").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.marketId, table.timestamp] }),
  }),
);

export const analyticsSignals = pgTable("analytics_signals", {
  id: uuid("id").primaryKey().defaultRandom(),
  articleId: uuid("article_id").references(() => analyticsArticles.id),
  marketId: uuid("market_id").references(() => analyticsMarkets.id),
  similarityScore: numeric("similarity_score"),
  timeDeltaHours: integer("time_delta_hours"),
  priceAtPublish: numeric("price_at_publish"),
  priceAtResolution: numeric("price_at_resolution"),
  signalQuality: text("signal_quality"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
