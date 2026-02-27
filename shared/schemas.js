import { z } from 'zod';

const vec3 = z.object({ x: z.number(), y: z.number(), z: z.number() });

export const inputSchema = z.object({
  unitId: z.string(),
  seq: z.number(),
  move: z.object({ forward: z.number(), right: z.number() }),
  aim: vec3,
  fire: z.boolean(),
  reload: z.boolean(),
  mountToggle: z.boolean()
});

export const orderSchema = z.object({
  unitIds: z.array(z.string()),
  type: z.enum(['move', 'attack']),
  targetPos: vec3.optional(),
  targetId: z.string().optional()
});

export const inventoryRequestSchema = z.object({
  unitId: z.string(),
  fromSlot: z.string(),
  toSlot: z.string()
});

export const debugSettingsSchema = z.object({
  bulletGravity: z.number(),
  muzzleVelocity: z.number(),
  drag: z.number(),
  spread: z.number(),
  explosionRadius: z.number(),
  penetrationMultiplier: z.number(),
  ricochetThreshold: z.number()
});

export function safeParse(schema, payload) {
  const parsed = schema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}
