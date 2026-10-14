import express from 'express';
import { errorHandler } from './errors';
import { router as usersRouter } from './routes/users';
import { router as coinPacksRouter } from './routes/coinPacks';
import { router as productsRouter } from './routes/products';
import { router as topUpsRouter } from './routes/topUps';
import { router as purchasesRouter } from './routes/purchases';
import { router as meRouter } from './routes/me';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/users', usersRouter);
  app.use('/api/v1/coin-packs', coinPacksRouter);
  app.use('/api/v1/products', productsRouter);
  app.use('/api/v1/top-ups', topUpsRouter);
  app.use('/api/v1/purchases', purchasesRouter);
  app.use('/api/v1/me', meRouter);
  app.use(errorHandler);
  return app;
}

export { createApp };
