import type { CollectionConfig } from 'payload'
import { pipelineAccess, adminOnlyDelete } from '../access'

export const Sources: CollectionConfig = {
  slug: 'sources',
  admin: {
    useAsTitle: 'name',
    group: 'Pipeline',
    defaultColumns: ['name', 'type', 'trustTier', 'enabled', 'lastPolledAt'],
  },
  access: {
    read: pipelineAccess,
    create: pipelineAccess,
    update: pipelineAccess,
    delete: adminOnlyDelete,
  },
  fields: [
    { name: 'key', type: 'text', required: true, unique: true, index: true },
    { name: 'name', type: 'text', required: true },
    { name: 'url', type: 'text', required: true },
    {
      name: 'type',
      type: 'select',
      required: true,
      options: [
        { label: 'RSS', value: 'rss' },
        { label: 'Google News', value: 'gnews' },
        { label: 'X account', value: 'x_account' },
        { label: 'X list', value: 'x_list' },
        { label: 'Data', value: 'data' },
      ],
    },
    {
      name: 'trustTier',
      type: 'number',
      required: true,
      min: 1,
      max: 3,
    },
    {
      name: 'language',
      type: 'select',
      options: [
        { label: 'English', value: 'en' },
        { label: 'Urdu', value: 'ur' },
        { label: 'Mixed', value: 'mixed' },
      ],
    },
    { name: 'categoryHint', type: 'text' },
    { name: 'pollIntervalSec', type: 'number', defaultValue: 300 },
    { name: 'enabled', type: 'checkbox', defaultValue: true },
    { name: 'lastPolledAt', type: 'date' },
    { name: 'etag', type: 'text' },
    { name: 'robotsOk', type: 'checkbox', defaultValue: true },
  ],
}
