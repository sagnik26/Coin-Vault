import express from 'express';
import { asyncHandler, parse } from '../errors';
import { listProductsSchema } from '../validators/products';
import { listProducts } from '../services/userService';

const router = express.Router();

router.get('/', asyncHandler(async (req, res) => {
  const query = parse(listProductsSchema, req.query);
  const products = await listProducts(query.category);
  res.json(products);
}));

export { router };
