import type { CollectionConfig } from 'payload'
import { pipelineAccess, adminOnlyDelete, isAdmin } from '../access'

export const AuditLog: CollectionConfig = {
  slug: 'audit-log',
  admin: {
    useAsTitle: 'action',
    group: 'System',
    defaultColumns: ['entity', 'action', 'actor', 'at'],
  },
  access: {
    read: isAdmin,
    create: pipelineAccess,
    update: isAdmin,
    delete: adminOnlyDelete,
  },
  fields: [
    { name: 'entity', type: 'text', required: true },
    { name: 'entityId', type: 'text', required: true },
    { name: 'action', type: 'text', required: true },
    { name: 'actor', type: 'text', required: true },
    { name: 'payload', type: 'json' },
    { name: 'at', type: 'date', required: true },
  ],
}
