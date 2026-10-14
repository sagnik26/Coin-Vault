import express from 'express';
import { asyncHandler, parse } from '../errors';
import { userId } from '../middleware/userId';
import { createTopUpSchema, topUpIdSchema } from '../validators/topUps';
import { createTopUp, confirmTopUp } from '../services/topUpService';

const router = express.Router();

router.use(userId);

router.post('/', asyncHandler(async (req, res) => {
  const body = parse(createTopUpSchema, req.body ?? {});
  const topUp = await createTopUp(req.userId, body.coin_pack_id);
  res.status(201).json(topUp);
}));

router.post('/:id/confirm', asyncHandler(async (req, res) => {
  const params = parse(topUpIdSchema, req.params);
  const confirmed = await confirmTopUp(req.userId, params.id);
  res.json(confirmed);
}));

export { router };
