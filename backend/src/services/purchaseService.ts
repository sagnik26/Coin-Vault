import { withTransaction } from '../db/withTransaction';
import { AppError, rethrow } from '../errors';

type ProductPriceRow = { price_coins: number; is_consumable: boolean };
type BalanceRow = { balance: number };
type PurchaseIdRow = { id: string };

async function createPurchase(userId: string, productId: string) {
  try {
    return await withTransaction(async (client) => {
      const productResult = await client.query<ProductPriceRow>(
        `SELECT price_coins, is_consumable
         FROM products
         WHERE id = $1 AND is_active = true`,
        [productId],
      );
      const product = productResult.rows[0];
      if (!product) {
        throw new AppError(404, 'product_not_found', 'Product not found');
      }

      const price = Number(product.price_coins);
      const isConsumable = product.is_consumable;

      const balanceResult = await client.query<BalanceRow>(
        `SELECT balance
         FROM user_balances
         WHERE user_id = $1`,
        [userId],
      );
      const balanceRow = balanceResult.rows[0];
      if (!balanceRow) {
        throw new AppError(404, 'user_not_found', 'User not found');
      }

      const balance = Number(balanceRow.balance);
      if (balance < price) {
        throw new AppError(402, 'insufficient_coins', 'Not enough coins');
      }

      const purchaseResult = await client.query<PurchaseIdRow>(
        `INSERT INTO purchases (user_id, product_id, price_coins, is_consumable)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [userId, productId, price, isConsumable],
      );
      const purchase = purchaseResult.rows[0];
      if (!purchase) {
        throw new AppError(500, 'internal_error', 'Internal error');
      }

      const updated = await client.query<BalanceRow>(
        `UPDATE user_balances
         SET balance = balance - $1, updated_at = now()
         WHERE user_id = $2
         RETURNING balance`,
        [price, userId],
      );
      const updatedRow = updated.rows[0];
      if (!updatedRow) {
        throw new AppError(404, 'user_not_found', 'User not found');
      }
      const balanceAfter = Number(updatedRow.balance);

      await client.query(
        `INSERT INTO coin_ledger (user_id, delta, balance_after, purchase_id)
         VALUES ($1, $2, $3, $4)`,
        [userId, -price, balanceAfter, purchase.id],
      );

      return {
        id: purchase.id,
        product_id: productId,
        price_coins: price,
        balance_after: balanceAfter,
      };
    });
  } catch (err) {
    rethrow(err, 'purchase');
  }
}

export { createPurchase };
