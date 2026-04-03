import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { issues } from "./issues.js";
import { companies } from "./companies.js";

export const issueRelations = pgTable(
  "issue_relations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    type: text("type").notNull(), // 'related' | 'blocks' | 'blocked_by' | 'duplicate'
    issueId: uuid("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    relatedIssueId: uuid("related_issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    createdByActorType: text("created_by_actor_type"), // 'user' | 'agent'
    createdByActorId: text("created_by_actor_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    issueTypeIdx: index("issue_relations_issue_type_idx").on(
      table.companyId,
      table.issueId,
      table.type,
    ),
    relatedTypeIdx: index("issue_relations_related_type_idx").on(
      table.companyId,
      table.relatedIssueId,
      table.type,
    ),
    uniqueRelation: uniqueIndex("issue_relations_unique_idx").on(
      table.issueId,
      table.relatedIssueId,
      table.type,
    ),
  }),
);
