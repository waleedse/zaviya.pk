import type { CollectionConfig } from 'payload'
import { adminOnlyDelete, isAdmin } from '../access'

export const PushSubscriptions: CollectionConfig = {
  slug: 'push-subscriptions',
  admin: {
    group: 'Growth',
    defaultColumns: ['endpoint', 'locale', 'updatedAt'],
    description: 'Web Push subscription endpoints (VAPID keys in env).',
  },
  access: {
    read: isAdmin,
    create: () => true,
    update: () => true,
    delete: adminOnlyDelete,
  },
  fields: [
    {
      name: 'endpoint',
      type: 'text',
      required: true,
      unique: true,
      index: true,
    },
    {
      name: 'keys',
      type: 'group',
      fields: [
        { name: 'p256dh', type: 'text', required: true },
        { name: 'auth', type: 'text', required: true },
      ],
    },
    {
      name: 'locale',
      type: 'select',
      options: [
        { label: 'English', value: 'en' },
        { label: 'Urdu', value: 'ur' },
      ],
    },
    { name: 'userAgent', type: 'text' },
  ],
}
