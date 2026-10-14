import express from 'express';
import { asyncHandler, parse } from '../errors';
import { userId } from '../middleware/userId';
import { createPurchaseSchema } from '../validators/purchases';
import { createPurchase } from '../services/purchaseService';

const router = express.Router();

router.use(userId);

router.post('/', asyncHandler(async (req, res) => {
  const body = parse(createPurchaseSchema, req.body ?? {});
  const purchase = await createPurchase(req.userId, body.product_id);
  res.status(201).json(purchase);
}));

export { router };
