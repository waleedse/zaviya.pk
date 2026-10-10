import type { CollectionConfig } from 'payload'
import { DATA_PAGES } from '@zaviya/shared'
import { publicRead, staffWriteNoBotDelete, adminOnlyDelete } from '../access'

const dataPageKeys = DATA_PAGES.map((d) => d.key)

export const DataPages: CollectionConfig = {
  slug: 'data-pages',
  admin: {
    useAsTitle: 'title',
    group: 'Data',
    defaultColumns: ['key', 'slug', 'updatedAt'],
  },
  access: {
    read: publicRead,
    create: staffWriteNoBotDelete,
    update: staffWriteNoBotDelete,
    delete: adminOnlyDelete,
  },
  fields: [
    {
      name: 'key',
      type: 'select',
      required: true,
      unique: true,
      options: dataPageKeys.map((k) => ({ label: k, value: k })),
    },
    { name: 'title', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, unique: true },
    { name: 'intro', type: 'textarea', localized: true },
    {
      name: 'faqs',
      type: 'array',
      localized: true,
      fields: [
        { name: 'q', type: 'text', required: true },
        { name: 'a', type: 'textarea', required: true },
      ],
    },
    { name: 'latestSnapshot', type: 'json' },
    { name: 'updatedAt', type: 'date' },
  ],
}
