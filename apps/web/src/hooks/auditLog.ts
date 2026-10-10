import type { CollectionAfterChangeHook } from 'payload'

export const articleAuditLogHook: CollectionAfterChangeHook = async ({ doc, operation, req, previousDoc }) => {
  const user = req.user
  const actor = user ? `user:${user.id}` : 'system'
  let action = operation
  if (operation === 'update' && doc._status === 'published' && previousDoc?._status !== 'published') {
    action = 'publish' as typeof operation
  }
  try {
    await req.payload.create({
      collection: 'audit-log',
      data: {
        entity: 'articles',
        entityId: String(doc.id),
        action: String(action),
        actor,
        payload: { workflow: doc.workflow, _status: doc._status },
        at: new Date().toISOString(),
      },
      req,
      overrideAccess: true,
    })
  } catch (err) {
    req.payload.logger.warn({ err }, 'audit log write failed')
  }
  return doc
}
