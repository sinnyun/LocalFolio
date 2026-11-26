import type * as React from 'react'

export type CompatProps<T> = T extends (props: infer P, ...args: any[]) => any
  ? Omit<P, 'ref'>
  : Record<string, unknown>

export type CompatComponent<P> = React.ComponentType<P & { ref?: React.Ref<any> }>

export function asCompat<T>(comp: T): CompatComponent<CompatProps<T>> {
  return comp as unknown as CompatComponent<CompatProps<T>>
}
