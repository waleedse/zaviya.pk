import type { CollectionConfig } from 'payload'
import { pipelineAccess, adminOnlyDelete } from '../access'

export const ReviewQueue: CollectionConfig = {
  slug: 'review-queue',
  admin: {
    useAsTitle: 'reason',
    group: 'Pipeline',
  },
  access: {
    read: pipelineAccess,
    create: pipelineAccess,
    update: pipelineAccess,
    delete: adminOnlyDelete,
  },
  fields: [
    { name: 'cluster', type: 'relationship', relationTo: 'story-clusters', required: true },
    { name: 'article', type: 'relationship', relationTo: 'articles' },
    { name: 'reason', type: 'textarea', required: true },
    { name: 'flags', type: 'json' },
    { name: 'telegramMessageId', type: 'text' },
    {
      name: 'decision',
      type: 'select',
      options: [
        { label: 'Approve', value: 'approve' },
        { label: 'Reject', value: 'reject' },
        { label: 'Hold', value: 'hold' },
        { label: 'Edit', value: 'edit' },
      ],
    },
    { name: 'decidedBy', type: 'text' },
    { name: 'decidedAt', type: 'date' },
  ],
}
