import { Bot, InlineKeyboard } from 'grammy'
import type { WorkerEnv } from '../config.js'
import type { PayloadClient } from '../payload-client.js'
import type { Queue } from 'bullmq'
import { logger } from '../logger.js'

export type TelegramAlerts = {
  notify: (text: string) => Promise<void>
  bot: Bot | null
}

export function createTelegramBot(
  env: WorkerEnv,
  deps: {
    payload: PayloadClient
    writeQueue: Queue
    pauseAll: () => Promise<void>
    resumeAll: () => Promise<void>
    getStats: () => Promise<string>
    /** Telegram "Skip this video" button from the separate video service */
    skipVideo?: (key: string) => Promise<void>
  },
): TelegramAlerts {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_ADMIN_CHAT_ID) {
    logger.info('Telegram bot disabled')
    return {
      bot: null,
      notify: async (text) => logger.info({ text }, 'telegram-notify-skipped'),
    }
  }

  const bot = new Bot(env.TELEGRAM_BOT_TOKEN)
  const adminId = env.TELEGRAM_ADMIN_CHAT_ID

  bot.use(async (ctx, next) => {
    if (String(ctx.chat?.id) !== adminId) return
    await next()
  })

  bot.command('status', async (ctx) => {
    await ctx.reply(await deps.getStats())
  })
  bot.command('pause', async (ctx) => {
    await deps.pauseAll()
    await ctx.reply('Queues paused')
  })
  bot.command('resume', async (ctx) => {
    await deps.resumeAll()
    await ctx.reply('Queues resumed')
  })
  bot.command('kill', async (ctx) => {
    await deps.pauseAll()
    await ctx.reply('Kill switch: queues paused locally (set settings.killSwitch on server)')
  })
  bot.command('stats', async (ctx) => {
    await ctx.reply(await deps.getStats())
  })
  bot.command('retract', async (ctx) => {
    const id = ctx.match?.trim()
    if (!id) {
      await ctx.reply('Usage: /retract <articleId>')
      return
    }
    try {
      const res = await deps.payload.retract(id, 'Telegram retract')
      await ctx.reply(`Retracted. Social posts: ${res.socialPosts.length}`)
    } catch (e) {
      await ctx.reply(`Failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  })

  bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data
    const [action, reviewId] = data.split(':')
    if (!reviewId) return
    if (action === 'videoskip') {
      await deps.skipVideo?.(reviewId)
      await ctx.answerCallbackQuery({ text: 'Video skipped' })
      return
    }
    if (action === 'approve') {
      const res = await deps.payload.patchReview(reviewId, { decision: 'approve', decidedBy: 'telegram' })
      await deps.payload.patchCluster(res.clusterId, { status: 'writing' })
      await deps.writeQueue.add('write', { clusterId: res.clusterId }, { priority: 3 })
      await ctx.answerCallbackQuery({ text: 'Approved' })
    } else if (action === 'reject') {
      await deps.payload.patchReview(reviewId, { decision: 'reject', decidedBy: 'telegram' })
      await ctx.answerCallbackQuery({ text: 'Rejected' })
    } else if (action === 'hold') {
      await deps.payload.patchReview(reviewId, { decision: 'hold', decidedBy: 'telegram' })
      await ctx.answerCallbackQuery({ text: 'On hold' })
    }
  })

  bot.catch((err) => logger.warn({ err }, 'telegram error'))

  return {
    bot,
    notify: async (text) => {
      await bot.api.sendMessage(adminId, text.slice(0, 4000))
    },
  }
}

export async function sendReviewCard(
  alerts: TelegramAlerts,
  args: { reviewId: string; clusterId: string; summary: string },
): Promise<void> {
  if (!alerts.bot) return
  const kb = new InlineKeyboard()
    .text('Approve', `approve:${args.reviewId}`)
    .text('Reject', `reject:${args.reviewId}`)
    .row()
    .text('Hold', `hold:${args.reviewId}`)
    .text('Edit title', `edit:${args.reviewId}`)
  await alerts.bot.api.sendMessage(process.env.TELEGRAM_ADMIN_CHAT_ID!, args.summary, {
    reply_markup: kb,
  })
}
