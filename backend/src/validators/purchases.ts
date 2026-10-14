import { z } from 'zod';

const createPurchaseSchema = z.object({
  product_id: z.string().uuid({ message: 'product_id must be a UUID' }),
});

export { createPurchaseSchema };
