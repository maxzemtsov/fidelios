-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "analytics_articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"source" text,
	"source_url" text,
	"tags" text[],
	"embedding" vector(768),
	"search_vector" tsvector GENERATED ALWAYS AS (to_tsvector('english', "title" || ' ' || "content")) STORED
);
--> statement-breakpoint
CREATE TABLE "analytics_markets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_id" text,
	"question" text NOT NULL,
	"description" text,
	"category" text,
	"outcome" text,
	"outcome_prices" jsonb,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone,
	"volume_total" numeric,
	"embedding" vector(768),
	CONSTRAINT "analytics_markets_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
CREATE TABLE "analytics_price_history" (
	"market_id" uuid NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"price" numeric NOT NULL,
	CONSTRAINT "analytics_price_history_market_id_timestamp_pk" PRIMARY KEY("market_id","timestamp")
);
--> statement-breakpoint
CREATE TABLE "analytics_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" uuid,
	"market_id" uuid,
	"similarity_score" numeric,
	"time_delta_hours" integer,
	"price_at_publish" numeric,
	"price_at_resolution" numeric,
	"signal_quality" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "analytics_price_history" ADD CONSTRAINT "analytics_price_history_market_id_analytics_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."analytics_markets"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "analytics_signals" ADD CONSTRAINT "analytics_signals_article_id_analytics_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."analytics_articles"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "analytics_signals" ADD CONSTRAINT "analytics_signals_market_id_analytics_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."analytics_markets"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "analytics_articles_embedding_idx" ON "analytics_articles" USING hnsw ("embedding" vector_cosine_ops);
--> statement-breakpoint
CREATE INDEX "analytics_articles_search_vector_idx" ON "analytics_articles" USING gin ("search_vector");
--> statement-breakpoint
CREATE INDEX "analytics_articles_published_at_idx" ON "analytics_articles" USING btree ("published_at");
--> statement-breakpoint
CREATE INDEX "analytics_markets_embedding_idx" ON "analytics_markets" USING hnsw ("embedding" vector_cosine_ops);
--> statement-breakpoint
CREATE INDEX "analytics_markets_closed_at_idx" ON "analytics_markets" USING btree ("closed_at");
