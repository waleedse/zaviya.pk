import type { CollectionConfig } from 'payload'
import { botCanCreateUpdateNotDelete, publicRead, adminOnlyDelete } from '../access'

export const Media: CollectionConfig = {
  slug: 'media',
  admin: {
    group: 'Newsroom',
  },
  access: {
    read: publicRead,
    create: botCanCreateUpdateNotDelete,
    update: botCanCreateUpdateNotDelete,
    delete: adminOnlyDelete,
  },
  upload: {
    mimeTypes: ['image/*'],
    imageSizes: [
      { name: 'thumb', width: 400, height: 225, formatOptions: { format: 'webp' } },
      { name: 'card', width: 800, height: 450, formatOptions: { format: 'webp' } },
      { name: 'hero', width: 1600, height: 900, formatOptions: { format: 'webp' } },
      { name: 'square', width: 1080, height: 1080, formatOptions: { format: 'webp' } },
      { name: 'portrait', width: 1080, height: 1350, formatOptions: { format: 'webp' } },
    ],
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      localized: true,
      // Required on upload only. Not `required: true`: the R2 storage plugin re-saves the doc right
      // after upload and that internal update does not see the localized alt, so every upload failed.
      validate: (value: unknown, { operation }: { operation?: string }) =>
        operation !== 'create' || (typeof value === 'string' && value.trim().length > 0) || 'Alt text is required',
      admin: { description: 'Required: describe the image for readers using screen readers and for Google Images.' },
    },
    {
      name: 'credit',
      type: 'text',
    },
    {
      name: 'license',
      type: 'select',
      options: [
        { label: 'Own', value: 'own' },
        { label: 'AI generated', value: 'ai-generated' },
        { label: 'Handout', value: 'handout' },
        { label: 'Wikimedia', value: 'wikimedia' },
        { label: 'Stock', value: 'stock' },
      ],
    },
    {
      name: 'isAiGenerated',
      type: 'checkbox',
      defaultValue: false,
    },
  ],
}
