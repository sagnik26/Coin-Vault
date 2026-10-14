import { z } from 'zod';

const createUserSchema = z.object({
  display_name: z
    .string({ required_error: 'display_name is required' })
    .trim()
    .min(1, 'display_name must be between 1 and 60 characters')
    .max(60, 'display_name must be between 1 and 60 characters'),
  email: z
    .string({ required_error: 'email is required' })
    .trim()
    .min(3, 'email must be a valid email address')
    .max(254, 'email must be at most 254 characters')
    .email('email must be a valid email address')
    .transform((value) => value.toLowerCase()),
});

export { createUserSchema };
