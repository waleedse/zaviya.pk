import type { CollectionConfig } from 'payload'
import { RATE_SERIES } from '@zaviya/shared'
import { publicRead, pipelineAccess, adminOnlyDelete } from '../access'
import { revalidateDataPoint } from '../hooks/revalidate'

export const DataPoints: CollectionConfig = {
  slug: 'data-points',
  admin: {
    useAsTitle: 'series',
    group: 'Data',
    defaultColumns: ['series', 'value', 'observedAt', 'source'],
  },
  access: {
    read: publicRead,
    create: pipelineAccess,
    update: pipelineAccess,
    delete: adminOnlyDelete,
  },
  hooks: {
    afterChange: [revalidateDataPoint],
  },
  fields: [
    {
      name: 'series',
      type: 'select',
      required: true,
      options: RATE_SERIES.map((s) => ({ label: s, value: s })),
      index: true,
    },
    { name: 'city', type: 'text', index: true },
    { name: 'value', type: 'number', required: true },
    { name: 'unit', type: 'text', required: true },
    { name: 'source', type: 'text', required: true },
    { name: 'observedAt', type: 'date', required: true, index: true },
  ],
}
