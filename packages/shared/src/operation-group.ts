import { hideAppFeedback, showAppFeedback, type AppFeedbackInput } from './feedback'

export type AppOperationGroupTasks = Record<string, () => Promise<unknown>>

export type AppOperationGroupResults<TTasks extends AppOperationGroupTasks> = {
  [K in keyof TTasks]: PromiseSettledResult<Awaited<ReturnType<TTasks[K]>>>
}

export type AppOperationGroupOptions<TTasks extends AppOperationGroupTasks> = {
  source: string
  feedback?: Omit<AppFeedbackInput, 'source'>
  tasks: TTasks
}

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
