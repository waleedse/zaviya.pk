import type { Access, FieldAccess, PayloadRequest } from 'payload'

export type UserRole = 'admin' | 'editor' | 'bot'

export function getRole(req: PayloadRequest): UserRole | undefined {
  const role = req.user?.role
  if (role === 'admin' || role === 'editor' || role === 'bot') return role
  return undefined
}

export const isAdmin: Access = ({ req }) => getRole(req) === 'admin'

export const isAdminOrBot: Access = ({ req }) => {
  const role = getRole(req)
  return role === 'admin' || role === 'bot'
}

export const isStaff: Access = ({ req }) => {
  const role = getRole(req)
  return role === 'admin' || role === 'editor'
}

export const isStaffOrBot: Access = ({ req }) => Boolean(getRole(req))

/** Pipeline collections: admin + bot only. */
export const pipelineAccess: Access = isAdminOrBot

export const pipelineRead: Access = isAdminOrBot

export const publicRead: Access = () => true

export const staffWriteBotRead: Access = ({ req }) => {
  const role = getRole(req)
  if (role === 'admin' || role === 'bot') return true
  if (role === 'editor') return true
  return false
}

export const staffWriteNoBotDelete: Access = ({ req }) => {
  const role = getRole(req)
  return role === 'admin' || role === 'editor'
}

export const adminOnlyDelete: Access = isAdmin

export const botCanCreateUpdateNotDelete: Access = ({ req }) => {
  const role = getRole(req)
  return role === 'admin' || role === 'editor' || role === 'bot'
}

export const publishedArticleRead: Access = ({ req }) => {
  if (isStaffOrBot({ req })) return true
  return {
    _status: { equals: 'published' },
    workflow: { not_equals: 'retracted' },
  }
}

export const adminOnlyFieldRead: FieldAccess = ({ req }) => getRole(req) === 'admin'

export const usersCollectionAccess = {
  read: isStaffOrBot,
  create: isAdmin,
  update: isAdmin,
  delete: isAdmin,
}
