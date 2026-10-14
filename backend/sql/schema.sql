-- sql/schema.sql
-- Target: PostgreSQL 13+ (gen_random_uuid() is built in).

CREATE TABLE users (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 60),
  email        text NOT NULL CHECK (length(trim(email)) BETWEEN 3 AND 254),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX users_email_lower ON users (lower(email));

CREATE TABLE coin_packs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  coins       integer NOT NULL CHECK (coins > 0),
  price_cents integer NOT NULL CHECK (price_cents > 0),
  is_active   boolean NOT NULL DEFAULT true
);

CREATE TABLE products (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  category      text NOT NULL CHECK (category IN ('skin', 'emote', 'battle_pass')),
  price_coins   integer NOT NULL CHECK (price_coins > 0),
  is_consumable boolean NOT NULL DEFAULT false,
  is_active     boolean NOT NULL DEFAULT true
);

-- One row per user. The row lock on this table serializes all balance changes for that user.
CREATE TABLE user_balances (
  user_id    uuid PRIMARY KEY REFERENCES users(id),
  balance    integer NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE top_ups (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id),
  coin_pack_id uuid NOT NULL REFERENCES coin_packs(id),
  coins        integer NOT NULL CHECK (coins > 0),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  status       text NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE purchases (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id),
  product_id    uuid NOT NULL REFERENCES products(id),
  price_coins   integer NOT NULL CHECK (price_coins > 0),
  is_consumable boolean NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- One-time items: a user can own each non-consumable product at most once.
-- Enforced in the database so concurrent requests cannot both succeed.
CREATE UNIQUE INDEX purchases_one_time_owned
  ON purchases (user_id, product_id)
  WHERE is_consumable = false;

CREATE TABLE coin_ledger (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES users(id),
  delta         integer NOT NULL CHECK (delta <> 0),
  balance_after integer NOT NULL CHECK (balance_after >= 0),
  top_up_id     uuid REFERENCES top_ups(id),
  purchase_id   uuid REFERENCES purchases(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (top_up_id IS NOT NULL AND purchase_id IS NULL AND delta > 0) OR
    (purchase_id IS NOT NULL AND top_up_id IS NULL AND delta < 0)
  )
);

CREATE INDEX coin_ledger_user_order   ON coin_ledger (user_id, created_at DESC, id DESC);
CREATE INDEX purchases_user_order     ON purchases (user_id, created_at DESC, id DESC);
CREATE INDEX top_ups_user             ON top_ups (user_id);
