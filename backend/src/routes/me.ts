import express from 'express';
import { asyncHandler, parse } from '../errors';
import { userId } from '../middleware/userId';
import { paginationSchema } from '../validators/pagination';
import { getBalance } from '../services/userService';
import { listTransactions, listInventory } from '../services/ledgerService';

const router = express.Router();

router.use(userId);

router.get('/balance', asyncHandler(async (req, res) => {
  const balance = await getBalance(req.userId);
  res.json(balance);
}));

router.get('/transactions', asyncHandler(async (req, res) => {
  const query = parse(paginationSchema, req.query);
  const page = await listTransactions(req.userId, query.limit, query.cursor);
  res.json(page);
}));

router.get('/inventory', asyncHandler(async (req, res) => {
  const inventory = await listInventory(req.userId);
  res.json(inventory);
}));

export { router };
