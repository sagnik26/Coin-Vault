import { z } from 'zod';

const paginationSchema = z.object({
  limit: z
    .union([z.string(), z.undefined()])
    .transform((value, ctx) => {
      if (value === undefined || value === '') {
        return 20;
      }
      if (!/^-?\d+$/.test(value)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'limit must be an integer from 1 to 100',
        });
        return z.NEVER;
      }
      const limit = Number(value);
      if (limit < 1 || limit > 100) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'limit must be an integer from 1 to 100',
        });
        return z.NEVER;
      }
      return limit;
    }),
  cursor: z
    .string()
    .optional()
    .transform((value) => (value ? value : undefined)),
});

export { paginationSchema };
