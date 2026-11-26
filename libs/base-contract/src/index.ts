export * from './action.js'
export * from './storage.js'
export * from './runtime.js'
export * from './shell.js'
export * from './frame.js'
export * from './manifest.js'
export * from './ui-service.js'
export * from './interactions.js'

declare module '@deepseek-ai/cordis' {
  interface Context {
    folioStorage: import('./storage.js').FolioStorageService
    folioRuntime: import('./runtime.js').FolioRuntimeService
    folioShell: import('./shell.js').FolioShellService
    folioFrame: import('./frame.js').FolioFrameService
    folioUi: import('./ui-service.js').FolioUiService
    folioInteractions?: import('./interactions.js').FolioInteractionsService
    effect(execute: () => (() => void) | void, label?: string): () => void

    /**
     * Register a service owned by this context's fiber; the returned disposer
     * unregisters it. Mixed onto every context by cordis' reflect service, but
     * cordis' package types do not re-export `reflect.d.ts`, so the overloads
     * are mirrored here (same signatures as `ReflectService.provide`).
     */
    provide<K extends string & keyof this>(name: K, value: this[K]): () => void
    provide(name: string, value?: unknown): () => void

    /** Read a service without declaring an `inject` dependency. */
    get<K extends string & keyof this>(name: K, strict?: boolean): this[K] | undefined
    get(name: string, strict?: boolean): unknown
  }
}
