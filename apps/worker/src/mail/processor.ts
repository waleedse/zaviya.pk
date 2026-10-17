import { authenticateSender } from './auth.js'
import { confirmRetract, executeAction, type ExecDeps, type MailContext } from './execute.js'
import type { Kv } from './kv.js'
import { parseMail } from './mime.js'
import { applyConfidenceGate, type Understood } from './schema.js'
import type { Mailbox, Mailer } from './transport.js'
import { EXAMPLES, findConfirmCode, keywordParse, ModelUnavailable, understandWithModel } from './understand.js'

const BATCH = 5
const DONE_TTL = 30 * 86400
const RESULT_TTL = 30 * 86400

export interface ProcessorDeps {
  box: Mailbox
  mailer: Mailer
  kv: Kv
  exec: ExecDeps
  /** Allowed sender addresses and our host, for the authentication rule */
  auth: { host: string; allowed: string[] }
  router: Parameters<typeof understandWithModel>[0]
  notifyAdmin: (text: string) => Promise<void>
  log: (line: Record<string, unknown>, msg: string) => void
  /** Dry run: never marks mail seen, never records state; mutating actions only say what they would do */
  dry?: boolean
}

export interface RunSummary {
  seen: number
  handled: number
  rejected: number
  waiting: number
  errors: number
}

const onePerHour = async (deps: ProcessorDeps, text: string) => {
  if (await deps.kv.set('mailcmd:notify-rejected', '1', 3600, { nx: true })) await deps.notifyAdmin(text).catch(() => {})
}

function composeReply(summary: Understood | null, lines: string[], held: string[]): string {
  const parts: string[] = []
  if (summary?.summary) parts.push(`Understood: ${summary.summary}`)
  if (held.length) {
    parts.push('', 'I was not sure enough about these, so I did NOT do them. Reply with the exact command to confirm:', ...held.map((h) => `- ${h}`))
  }
  parts.push('', ...lines)
  return parts.join('\n').replace(/^\n+/, '').trim()
}

const describe = (a: { type: string; args: unknown }) => `${a.type} ${JSON.stringify(a.args)}`

/** One pass over the unread mail: up to 5 messages, oldest first. */
export async function processMailbox(deps: ProcessorDeps): Promise<RunSummary> {
  const sum: RunSummary = { seen: 0, handled: 0, rejected: 0, waiting: 0, errors: 0 }
  const uids = (await deps.box.listUnseen()).slice(0, BATCH)
  for (const uid of uids) {
    sum.seen++
    try {
      const raw = await deps.box.fetchRaw(uid)
      const mail = parseMail(raw)
      const id = mail.messageId ?? `uid:${uid}:${mail.subject}`
      const markSeen = async () => {
        if (!deps.dry) await deps.box.markSeen(uid)
      }

      // 1. Already finished (a crash between "reply sent" and "marked seen")
      if (!deps.dry && (await deps.kv.get(`mailcmd:done:${id}`))) {
        await markSeen()
        deps.log({ uid, decision: 'already-done' }, 'mail command')
        continue
      }

      // 2. Who is this? Anything that fails is silent: no reply (no backscatter)
      const auth = authenticateSender(mail, deps.auth)
      if (!auth.ok) {
        await markSeen()
        sum.rejected++
        deps.log({ uid, decision: 'rejected', reason: auth.reason }, 'mail command')
        await onePerHour(deps, `Mail commands: ignored a mail to ops@ (${auth.reason}). Subject: ${mail.subject.slice(0, 80)}`)
        continue
      }

      const ctx: MailContext = { sender: auth.sender, subject: mail.subject, text: mail.text }
      const replyTo = (body: string) =>
        deps.mailer.send({
          to: auth.sender,
          subject: /^re:/i.test(mail.subject) ? mail.subject : `Re: ${mail.subject || 'your command'}`,
          body,
          inReplyTo: mail.messageId,
          references: mail.references,
        })

      // 3. A reply already prepared by an earlier run (executed, reply not sent yet): send it, do not execute again
      const prepared = deps.dry ? null : await deps.kv.get(`mailcmd:result:${id}`)
      let reply = prepared
      let decision = prepared ? 'resend' : ''
      let actionsLog: string[] = []

      if (reply === null) {
        const confirm = findConfirmCode(mail.text)
        let understood: Understood | null = null
        let lines: string[] = []
        let held: string[] = []

        if (confirm) {
          decision = 'confirm'
          actionsLog = ['confirm']
          lines = await confirmRetract(confirm, ctx, deps.exec)
        } else {
          const slotNames = deps.exec.slots.map((s) => s.name)
          try {
            understood = await understandWithModel(deps.router, mail, slotNames, new Date(deps.exec.now()))
          } catch (e) {
            if (!(e instanceof ModelUnavailable)) throw e
            understood = keywordParse(mail, slotNames)
            if (!understood) {
              // Model is down and it is not a core command: leave it unread, tell him once
              sum.waiting++
              deps.log({ uid, decision: 'model-down', reason: e.message }, 'mail command')
              if (!deps.dry && (await deps.kv.set(`mailcmd:modelwait:${id}`, '1', 3 * 86400, { nx: true }))) {
                await replyTo('I could not read this yet because my language model is unavailable right now. I will process it when the model is back; no need to resend.\n\nCore commands work without it: status, pause, resume, video now <slot>, skip <slot>, CONFIRM <code>.')
              }
              continue
            }
          }
          const { run, held: heldActions } = applyConfidenceGate(understood.actions)
          held = heldActions.map(describe)
          const doable = run.filter((a) => a.type !== 'unknown')
          if (!doable.length && !heldActions.length) {
            decision = 'unknown'
            lines = ['I could not tell what you want me to do. Try, for example:', ...EXAMPLES.map((x) => `  ${x}`)]
          } else {
            decision = heldActions.length && !doable.length ? 'held' : 'run'
            for (const a of doable) {
              actionsLog.push(a.type)
              const res = await executeAction(a, ctx, deps.exec).catch((e) => [`${a.type}: failed: ${e instanceof Error ? e.message.slice(0, 200) : String(e)}`])
              lines.push(`== ${a.type} ==`, ...res, '')
            }
          }
        }
        reply = composeReply(understood, lines, held)
        // Keep the result before sending, so a failed send never causes a second execution
        if (!deps.dry) await deps.kv.set(`mailcmd:result:${id}`, reply, RESULT_TTL)
      }

      // 4. Reply, then record done and mark seen (in that order)
      await replyTo(reply)
      if (!deps.dry) await deps.kv.set(`mailcmd:done:${id}`, '1', DONE_TTL)
      await markSeen()
      sum.handled++
      deps.log({ uid, decision, actions: actionsLog, from: auth.sender }, 'mail command')
    } catch (e) {
      sum.errors++
      deps.log({ uid, decision: 'error', error: e instanceof Error ? e.message.slice(0, 200) : String(e) }, 'mail command')
    }
  }
  return sum
}
