import type { CollectionConfig } from 'payload'
import { usersCollectionAccess } from '../access'

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'email',
    group: 'System',
  },
  auth: {
    useAPIKey: true,
  },
  access: usersCollectionAccess,
  fields: [
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'editor',
      options: [
        { label: 'Admin', value: 'admin' },
        { label: 'Editor', value: 'editor' },
        { label: 'Bot', value: 'bot' },
      ],
      saveToJWT: true,
    },
  ],
}
