import express from 'express';
import { asyncHandler, parse } from '../errors';
import { createUserSchema } from '../validators/users';
import { createUser, listUsers } from '../services/userService';

const router = express.Router();

router.get('/', asyncHandler(async (_req, res) => {
  const users = await listUsers();
  res.status(200).json(users);
}));

router.post('/', asyncHandler(async (req, res) => {
  const body = parse(createUserSchema, req.body ?? {});
  const user = await createUser(body.display_name, body.email);
  res.status(201).json(user);
}));

export { router };
