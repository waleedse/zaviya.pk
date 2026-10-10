import type { CollectionConfig } from 'payload'
import { botCanCreateUpdateNotDelete, pipelineAccess, adminOnlyDelete } from '../access'

export const SocialPosts: CollectionConfig = {
  slug: 'social-posts',
  admin: {
    useAsTitle: 'idempotencyKey',
    group: 'Pipeline',
  },
  access: {
    read: pipelineAccess,
    create: botCanCreateUpdateNotDelete,
    update: botCanCreateUpdateNotDelete,
    delete: adminOnlyDelete,
  },
  fields: [
    { name: 'article', type: 'relationship', relationTo: 'articles', required: true },
    {
      name: 'platform',
      type: 'select',
      required: true,
      options: ['facebook', 'instagram', 'x', 'whatsapp'].map((v) => ({ label: v, value: v })),
    },
    {
      name: 'format',
      type: 'select',
      required: true,
      options: ['link', 'card', 'carousel', 'reel', 'text'].map((v) => ({ label: v, value: v })),
    },
    { name: 'copy', type: 'textarea', required: true },
    { name: 'mediaUrls', type: 'json' },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'queued',
      options: ['queued', 'posting', 'posted', 'failed', 'deleted'].map((v) => ({ label: v, value: v })),
    },
    { name: 'scheduledAt', type: 'date' },
    { name: 'postedAt', type: 'date' },
    { name: 'externalId', type: 'text' },
    {
      name: 'via',
      type: 'select',
      options: [
        { label: 'API', value: 'api' },
        { label: 'Extension', value: 'extension' },
      ],
    },
    { name: 'idempotencyKey', type: 'text', required: true, unique: true, index: true },
    { name: 'error', type: 'textarea' },
    { name: 'metrics', type: 'json' },
  ],
}
