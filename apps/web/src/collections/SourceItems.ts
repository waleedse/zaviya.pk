import type { CollectionConfig } from 'payload'
import { pipelineAccess, adminOnlyDelete } from '../access'

export const SourceItems: CollectionConfig = {
  slug: 'source-items',
  admin: {
    useAsTitle: 'title',
    group: 'Pipeline',
    defaultColumns: ['title', 'source', 'publishedAt', 'cluster'],
  },
  access: {
    read: pipelineAccess,
    create: pipelineAccess,
    update: pipelineAccess,
    delete: adminOnlyDelete,
  },
  fields: [
    { name: 'source', type: 'relationship', relationTo: 'sources', required: true, index: true },
    { name: 'externalId', type: 'text', required: true, index: true },
    { name: 'url', type: 'text', required: true },
    { name: 'title', type: 'text', required: true },
    { name: 'summary', type: 'textarea' },
    { name: 'contentText', type: 'textarea' },
    { name: 'publishedAt', type: 'date', required: true },
    {
      name: 'lang',
      type: 'select',
      options: [
        { label: 'en', value: 'en' },
        { label: 'ur', value: 'ur' },
      ],
    },
    {
      name: 'cluster',
      type: 'relationship',
      relationTo: 'story-clusters',
      index: true,
    },
    { name: 'hash', type: 'text', index: true },
  ],
}
