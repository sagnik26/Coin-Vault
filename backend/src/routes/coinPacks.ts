import express from 'express';
import { asyncHandler } from '../errors';
import { listCoinPacks } from '../services/userService';

const router = express.Router();

router.get('/', asyncHandler(async (req, res) => {
  const packs = await listCoinPacks();
  res.json(packs);
}));

export { router };
