import { z } from 'zod'

/**
 * Plugin roles in the LocalFolio taxonomy:
 * - `base`     工作台通用基础能力（存储 / 运行时 / UI / 外壳 / 布局框架 / 设置页）
 * - `workspace` 工作区：顶部工作区栏里的一项完整功能
 * - `feature`  功能插件：只在一个工作区内部贡献功能
 * - `test`     测试界面：只为验证界面与集成方式而存在
 * - `bridge`   桥接插件：把某项基础能力接进外壳或工具链
 */
export const DshPluginCategorySchema = z.enum(['base', 'workspace', 'feature', 'test', 'bridge'])
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
  version: z.literal(2),
  dshPlugins: z.array(DshPluginRecordSchema),
  internalExtensions: z.array(InternalExtensionRecordSchema),
})
export type PluginManifest = z.infer<typeof PluginManifestSchema>
