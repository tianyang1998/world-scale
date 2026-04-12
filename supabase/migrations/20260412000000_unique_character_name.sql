-- Enforce case-insensitive uniqueness on character names at the database level.
-- This prevents race conditions where two concurrent saves with the same name
-- both pass the application-level check before either upsert lands.
CREATE UNIQUE INDEX IF NOT EXISTS characters_name_lower_idx
  ON characters (LOWER(name))
  WHERE name IS NOT NULL;
