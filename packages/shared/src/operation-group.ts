/**
 * Parallel operation group execution.
 * 并行操作组执行。
 */
import type { AppFeedbackInput } from './feedback'
import {
  hideAppFeedback,
  showAppFeedback,
} from './feedback'

export type AppOperationGroupTasks = Record<string, () => Promise<unknown>>

export type AppOperationGroupResults<TTasks extends AppOperationGroupTasks> = {
  [K in keyof TTasks]: PromiseSettledResult<Awaited<ReturnType<TTasks[K]>>>
}

export type AppOperationGroupOptions<TTasks extends AppOperationGroupTasks> = {
  source: string
  feedback?: Omit<AppFeedbackInput, 'source'>
  tasks: TTasks
}

/**
 * Runs a group of async tasks with feedback display and returns settled results keyed by task name.
 * 运行一组带有反馈显示的异步任务，返回按任务名索引的 settled 结果。
 */
export async function runAppOperationGroup<TTasks extends AppOperationGroupTasks>(
  options: AppOperationGroupOptions<TTasks>,
): Promise<AppOperationGroupResults<TTasks>> {
  if (options.feedback) {
    showAppFeedback({
      ...options.feedback,
      source: options.source,
    })
  }

  try {
    const entries = Object.entries(options.tasks) as [keyof TTasks, TTasks[keyof TTasks]][]
    const settled = await Promise.allSettled(entries.map(([, task]) => task()))
    return entries.reduce((acc, [key], index) => {
      acc[key] = settled[index] as AppOperationGroupResults<TTasks>[typeof key]
      return acc
    }, {} as AppOperationGroupResults<TTasks>)
  } finally {
    if (options.feedback) {
      hideAppFeedback(options.source)
    }
  }
}
