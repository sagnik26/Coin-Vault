import { z } from 'zod';

const listProductsSchema = z.object({
  category: z
    .enum(['skin', 'emote', 'battle_pass'], {
      errorMap: () => ({ message: 'category must be skin, emote, or battle_pass' }),
    })
    .optional(),
});

export type ProductCategory = 'skin' | 'emote' | 'battle_pass';

export { listProductsSchema };
