import type { CollectionConfig } from 'payload'
import { pipelineAccess, adminOnlyDelete } from '../access'

export const PromptVersions: CollectionConfig = {
  slug: 'prompt-versions',
  admin: {
    useAsTitle: 'key',
    group: 'Pipeline',
  },
  access: {
    read: pipelineAccess,
    create: pipelineAccess,
    update: pipelineAccess,
    delete: adminOnlyDelete,
  },
  fields: [
    {
      name: 'key',
      type: 'select',
      required: true,
      options: ['triage', 'write_en', 'write_ur', 'qa', 'social_copy'].map((v) => ({ label: v, value: v })),
    },
    { name: 'version', type: 'number', required: true },
    { name: 'template', type: 'textarea', required: true },
    { name: 'active', type: 'checkbox', defaultValue: false },
  ],
}
