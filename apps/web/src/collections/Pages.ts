import type { CollectionConfig } from 'payload'
import { publicRead, staffWriteNoBotDelete, adminOnlyDelete } from '../access'

export const Pages: CollectionConfig = {
  slug: 'pages',
  admin: {
    useAsTitle: 'title',
    group: 'Newsroom',
    defaultColumns: ['title', 'slug'],
  },
  access: {
    read: publicRead,
    create: staffWriteNoBotDelete,
    update: staffWriteNoBotDelete,
    delete: adminOnlyDelete,
  },
  fields: [
    { name: 'title', type: 'text', required: true, localized: true },
    { name: 'slug', type: 'text', required: true, unique: true, index: true },
    { name: 'body', type: 'richText', localized: true },
  ],
}
