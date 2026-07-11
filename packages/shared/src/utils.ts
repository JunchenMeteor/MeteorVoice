/**
 * Returns a promise that resolves after the specified milliseconds.
 * 返回一个在指定毫秒后 resolve 的 promise。
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
