-- 329 — expert-signed blog: posts, their sources, reader reactions (Lane C; ledger
-- `2026-09-27-blog-lifecycle`; decision-maker rulings in docs/planning/briefs/lane-c.md).
--
-- ADDITIVE. Three NEW tables, born empty, with their indexes. NO DB CHECK (value sets are
-- app-enforced in shared/blog.ts) and NO DEFAULT on any status column (publish-trap posture).
-- Every table and index is DECLARED in shared/schema.ts (deploy-push durability rule). Because the
-- tables are created in this same migration, the UNIQUE indexes cannot be violated by existing rows,
-- which is what makes them approvable under §20's new-object carve-out. Idempotent (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS blog_posts (
  id                  varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                varchar(160) NOT NULL,
  content_type        varchar(40)  NOT NULL,
  authorship          varchar(20)  NOT NULL,
  status              varchar(20)  NOT NULL,
  market_slug         varchar(40),
  occasion_slug       varchar(80),
  title               varchar(200) NOT NULL,
  summary             text,
  body                text NOT NULL,
  content_sha256      varchar(64)  NOT NULL,
  byline_expert_id    varchar REFERENCES users(id) ON DELETE SET NULL,
  signed_by           varchar REFERENCES users(id) ON DELETE SET NULL,
  signed_at           timestamp,
  signed_content_sha256 varchar(64),
  consent_at          timestamp,
  published_by        varchar REFERENCES users(id) ON DELETE SET NULL,
  published_at        timestamp,
  withdrawn_by        varchar REFERENCES users(id) ON DELETE SET NULL,
  withdrawn_at        timestamp,
  withdraw_reason     varchar(200),
  created_by          varchar REFERENCES users(id) ON DELETE SET NULL,
  created_at          timestamp DEFAULT now(),
  updated_at          timestamp DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS blog_posts_slug_uq ON blog_posts (slug);
CREATE INDEX IF NOT EXISTS blog_posts_status_published_idx ON blog_posts (status, published_at);
CREATE INDEX IF NOT EXISTS blog_posts_byline_idx ON blog_posts (byline_expert_id);

CREATE TABLE IF NOT EXISTS blog_post_sources (
  id            varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id       varchar NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
  "position"    integer NOT NULL,
  url           text NOT NULL,
  title         varchar(300),
  publisher     varchar(200),
  quote         text,
  retrieved_at  timestamp,
  created_at    timestamp DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS blog_post_sources_post_position_uq ON blog_post_sources (post_id, "position");

CREATE TABLE IF NOT EXISTS blog_post_reactions (
  id          varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     varchar NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
  user_id     varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        varchar(20) NOT NULL,
  created_at  timestamp DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS blog_post_reactions_post_user_kind_uq ON blog_post_reactions (post_id, user_id, kind);
CREATE INDEX IF NOT EXISTS blog_post_reactions_post_idx ON blog_post_reactions (post_id);
