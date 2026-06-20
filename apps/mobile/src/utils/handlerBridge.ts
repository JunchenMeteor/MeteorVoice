/**
 * HandlerBridge — ref-based callback forwarding between hooks.
 * 回调转发器 — 基于 ref 的跨 Hook 回调桥接。
 *
 * When Hook A is created before Hook B but needs B's callback,
 * create a bridge ref, pass to A, then wire to B after creation.
 * 当 Hook A 在 Hook B 之前创建，但需要调用 B 的回调时使用。
 *
 * @example
 *   const onResult = createHandlerBridge<(text: string) => void>()
 *   useHookA({ onResult: useCallback((t) => onResult.current(t), []) })
 *   const hookB = useHookB(...)
 *   useEffect(() => { onResult.current = hookB.handleResult })
 */
export function createHandlerBridge<T extends (...args: never[]) => unknown>(
  stub?: T,
): { current: T } {
  return { current: (stub ?? (() => {})) as unknown as T }
}
