-- sql/reset.sql
TRUNCATE coin_ledger, purchases, top_ups, user_balances, users RESTART IDENTITY CASCADE;
UPDATE coin_packs SET is_active = true;
UPDATE products   SET is_active = true;
