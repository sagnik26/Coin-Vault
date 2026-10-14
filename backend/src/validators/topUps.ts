import { z } from 'zod';

const createTopUpSchema = z.object({
  coin_pack_id: z.string().uuid({ message: 'coin_pack_id must be a UUID' }),
});

const topUpIdSchema = z.object({
  id: z.string().uuid({ message: 'Top-up id must be a UUID' }),
});

export { createTopUpSchema, topUpIdSchema };
