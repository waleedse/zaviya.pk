import type { CollectionConfig } from 'payload'
import { publicRead, staffWriteNoBotDelete, adminOnlyDelete } from '../access'

export const Authors: CollectionConfig = {
  slug: 'authors',
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
    { name: 'name', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, unique: true, index: true },
    { name: 'role', type: 'text' },
    { name: 'bio', type: 'textarea', localized: true },
    { name: 'avatar', type: 'upload', relationTo: 'media' },
    {
      name: 'socials',
      type: 'array',
      fields: [
        { name: 'platform', type: 'text', required: true },
        { name: 'url', type: 'text', required: true },
      ],
    },
  ],
}
