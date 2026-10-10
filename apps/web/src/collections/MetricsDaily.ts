import type { CollectionConfig } from 'payload'
import { pipelineAccess, adminOnlyDelete } from '../access'

export const MetricsDaily: CollectionConfig = {
  slug: 'metrics-daily',
  admin: {
    group: 'System',
    defaultColumns: ['article', 'date', 'pageviews'],
  },
  access: {
    read: pipelineAccess,
    create: pipelineAccess,
    update: pipelineAccess,
    delete: adminOnlyDelete,
  },
  fields: [
    { name: 'article', type: 'relationship', relationTo: 'articles', required: true },
    { name: 'date', type: 'date', required: true },
    { name: 'gscImpressions', type: 'number' },
    { name: 'gscClicks', type: 'number' },
    { name: 'gscCtr', type: 'number' },
    { name: 'gscPosition', type: 'number' },
    { name: 'pageviews', type: 'number' },
    { name: 'fbReach', type: 'number' },
    { name: 'igReach', type: 'number' },
    { name: 'xImpressions', type: 'number' },
  ],
}
