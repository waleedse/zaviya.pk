import type { CollectionConfig } from 'payload'
import { pipelineAccess, adminOnlyDelete } from '../access'

export const StoryClusters: CollectionConfig = {
  slug: 'story-clusters',
  admin: {
    useAsTitle: 'headline',
    group: 'Pipeline',
    defaultColumns: ['headline', 'status', 'itemCount', 'lastSeenAt'],
  },
  access: {
    read: pipelineAccess,
    create: pipelineAccess,
    update: pipelineAccess,
    delete: adminOnlyDelete,
  },
  fields: [
    { name: 'headline', type: 'text', required: true },
    { name: 'firstSeenAt', type: 'date', required: true },
    { name: 'lastSeenAt', type: 'date', required: true },
    { name: 'itemCount', type: 'number', defaultValue: 1 },
    { name: 'distinctSources', type: 'number', defaultValue: 1 },
    {
      name: 'maxTier',
      type: 'number',
      admin: {
        description: 'Best (most trusted) tier in cluster: minimum numeric tier (1 = official/wire).',
      },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'new',
      options: [
        'new',
        'triaged',
        'rejected',
        'in_review',
        'writing',
        'published',
        'updated',
      ].map((v) => ({ label: v, value: v })),
    },
    { name: 'triage', type: 'json' },
    { name: 'article', type: 'relationship', relationTo: 'articles' },
  ],
}
