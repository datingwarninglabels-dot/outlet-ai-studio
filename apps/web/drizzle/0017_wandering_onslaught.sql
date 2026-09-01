-- Metadata-only change (the column's DEFAULT, not existing rows) — safe
-- as generated, no backfill needed. Every row that can already exist was
-- inserted with role set explicitly (setup/actions.ts's bootstrap always
-- sets "owner"), so no existing account is affected; this only changes
-- what a future insert gets if it omits role.
ALTER TABLE "user" ALTER COLUMN "role" SET DEFAULT 'customer';
