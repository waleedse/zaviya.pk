import { BridgeClient } from '../lib/bridge-client'
import { runBridgeJob } from '../lib/jobs'

export default defineBackground(() => {
  const client = new BridgeClient(async (job) => {
    const result = await runBridgeJob(job)
    if (job.type === 'x.readList' && result && typeof result === 'object' && 'posts' in result) {
      return (result as { posts: unknown }).posts
    }
    return result
  })
  client.start()
})
