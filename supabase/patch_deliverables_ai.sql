-- Patch: allow descriptions on deliverables and mark AI-generated rows

ALTER TABLE deliverables
  ADD COLUMN IF NOT EXISTS description text,
  ALTER COLUMN url DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS is_ai_generated boolean NOT NULL DEFAULT false;

