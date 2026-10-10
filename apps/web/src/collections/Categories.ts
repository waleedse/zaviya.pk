import type { CollectionConfig } from 'payload'
import { CATEGORY_SLUGS } from '@zaviya/shared'
import { publicRead, staffWriteNoBotDelete, adminOnlyDelete } from '../access'
import { categoryAfterChange } from '../hooks/categories'

export const Categories: CollectionConfig = {
  slug: 'categories',
  admin: {
    useAsTitle: 'name',
    group: 'Newsroom',
    defaultColumns: ['name', 'slug', 'order', 'showInNav'],
  },
  access: {
    read: publicRead,
    create: staffWriteNoBotDelete,
    update: staffWriteNoBotDelete,
    delete: adminOnlyDelete,
  },
  hooks: {
    afterChange: [categoryAfterChange],
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
      type: 'select',
      required: true,
      unique: true,
      options: CATEGORY_SLUGS.map((s) => ({ label: s, value: s })),
    },
    {
      name: 'color',
      type: 'text',
      required: true,
    },
    {
      name: 'description',
      type: 'textarea',
      localized: true,
    },
    {
      name: 'order',
      type: 'number',
      defaultValue: 0,
    },
    {
      name: 'showInNav',
      type: 'checkbox',
      defaultValue: true,
    },
  ],
}
