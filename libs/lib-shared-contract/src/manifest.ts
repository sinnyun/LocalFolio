import { z } from 'zod'

export const DshPluginCategorySchema = z.enum(['core', 'shell', 'app', 'bridge', 'bundle'])
export type DshPluginCategory = z.infer<typeof DshPluginCategorySchema>

export const DshPluginRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  loaderId: z.string().min(1),
  category: DshPluginCategorySchema,
  slots: z.array(z.string()).default([]),
  services: z.array(z.string()).default([]),
  description: z.string().default(''),
  enabled: z.boolean().default(true),
  dependsOn: z.array(z.string()).default([]),
})
export type DshPluginRecord = z.infer<typeof DshPluginRecordSchema>

export const InternalExtensionSourceSchema = z.enum(['official', 'community', 'custom'])
export type InternalExtensionSource = z.infer<typeof InternalExtensionSourceSchema>

export const InternalExtensionRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  hostPluginId: z.string().min(1),
  ecosystem: z.string().min(1),
  source: InternalExtensionSourceSchema,
  description: z.string().default(''),
  enabled: z.boolean().default(true),
})
export type InternalExtensionRecord = z.infer<typeof InternalExtensionRecordSchema>

export const PluginManifestSchema = z.object({
  version: z.literal(1),
  dshPlugins: z.array(DshPluginRecordSchema),
  internalExtensions: z.array(InternalExtensionRecordSchema),
})
export type PluginManifest = z.infer<typeof PluginManifestSchema>
