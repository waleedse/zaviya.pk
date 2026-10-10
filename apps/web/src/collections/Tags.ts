import type { CollectionConfig } from 'payload'
import { publicRead, staffWriteNoBotDelete, adminOnlyDelete } from '../access'

export const Tags: CollectionConfig = {
  slug: 'tags',
  admin: {
    useAsTitle: 'name',
    group: 'Newsroom',
  },
  access: {
    read: publicRead,
    create: staffWriteNoBotDelete,
    update: staffWriteNoBotDelete,
    delete: adminOnlyDelete,
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      localized: true,
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      index: true,
    },
  ],
}
