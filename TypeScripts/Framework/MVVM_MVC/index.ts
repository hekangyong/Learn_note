/**
 * MVVM / MVC 框架统一出口。业务代码只从这里引用。
 */
export { setErrorHandler, reportError } from './core/errors'
export type { ErrorHandler } from './core/errors'

export { DisposableStore, disposeSafely } from './core/Disposable'
export type { IDisposable, DisposableLike } from './core/Disposable'

export { Emitter } from './core/Emitter'
export type { EventMap, Listener } from './core/Emitter'

export { signal, computed, effect, batch, untracked, watch, isReadonlySignal, shallowEqual } from './core/reactive'
export type {
    Signal,
    ReadonlySignal,
    SignalOptions,
    SignalListener,
    SubscribeOptions,
    EqualityFn,
    EffectFn,
    Disposer,
} from './core/reactive'

export { Model } from './model/Model'

export { MvcView } from './mvc/MvcView'
export type { IntentsOf } from './mvc/MvcView'
export { Controller } from './mvc/Controller'

export { ViewModel } from './mvvm/ViewModel'
export { MvvmView } from './mvvm/MvvmView'
export { Command, AsyncCommand } from './mvvm/Command'
export type { CommandResult, CommandOptions, AsyncCommandOptions, ConcurrencyPolicy } from './mvvm/Command'
