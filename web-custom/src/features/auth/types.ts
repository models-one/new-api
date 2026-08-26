import { z } from 'zod'

export const authUserSchema = z.object({
  id: z.number().int().positive(),
  username: z.string(),
  display_name: z.string().optional(),
  email: z.string().optional(),
  role: z.number().int(),
  status: z.number().int().optional(),
  group: z.string().optional(),
  quota: z.number().optional(),
  used_quota: z.number().optional(),
  request_count: z.number().optional(),
  language: z.string().optional(),
  sidebar_modules: z.string().optional(),
}).passthrough()

export const loginSessionSchema = z.object({
  sid: z.string().min(1),
  current: z.boolean(),
  login_method: z.string(),
  ip: z.string(),
  user_agent: z.string(),
  created_at: z.number(),
  last_active_at: z.number(),
  expires_at: z.number(),
})

export const authBundleSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().min(1),
  access_expires_at: z.number().positive(),
  user: authUserSchema,
  session: loginSessionSchema,
})

export const authRotationSchema = authBundleSchema.omit({ user: true }).extend({
  token_type: z.literal('Bearer'),
  session: loginSessionSchema.extend({ current: z.literal(true) }),
})

export type AuthUser = z.infer<typeof authUserSchema>
export type LoginSession = z.infer<typeof loginSessionSchema>
export type AuthBundle = z.infer<typeof authBundleSchema>
export type AuthRotation = z.infer<typeof authRotationSchema>
