-- sql/seed.sql
INSERT INTO coin_packs (name, coins, price_cents) VALUES
  ('Starter Pack', 100, 99),
  ('Value Pack',   500, 449),
  ('Mega Pack',   1200, 999);

INSERT INTO products (name, category, price_coins, is_consumable) VALUES
  ('Neon Blade',            'skin',        300, false),
  ('Victory Dance',         'emote',       150, false),
  ('Season 1 Battle Pass',  'battle_pass', 500, false),
  ('Mystery Skin Crate',    'skin',        200, false);
