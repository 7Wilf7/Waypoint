import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const entries = sqliteTable('entries', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(),
  published: integer('published').notNull().default(0),
  payload: text('payload').notNull(),
  updatedAt: text('updated_at').notNull(),
}, table => [index('entries_public_kind').on(table.published, table.kind)]);

export const media = sqliteTable('media', {
  id: text('id').primaryKey(),
  mime: text('mime').notNull(),
  filename: text('filename').notNull(),
  size: integer('size').notNull(),
  createdAt: text('created_at').notNull(),
});
