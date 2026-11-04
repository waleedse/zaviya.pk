import type { CollectionConfig } from 'payload'
import { publicRead, botCanCreateUpdateNotDelete, adminOnlyDelete } from '../access'
import { revalidatePhonesHook } from '../hooks/phones'

/** Mobile brands sold in Pakistan (zaviya.pk/mobile-prices/<brand>). */
export const PhoneBrands: CollectionConfig = {
  slug: 'phone-brands',
  labels: { singular: 'Phone brand', plural: 'Phone brands' },
  admin: {
    useAsTitle: 'name',
    group: 'Mobile prices',
    defaultColumns: ['name', 'slug', 'order'],
  },
  access: {
    read: publicRead,
    create: botCanCreateUpdateNotDelete,
    update: botCanCreateUpdateNotDelete,
    delete: adminOnlyDelete,
  },
  hooks: { afterChange: [revalidatePhonesHook] },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, unique: true, index: true },
    { name: 'order', type: 'number', defaultValue: 100 },
    { name: 'officialSite', type: 'text', admin: { description: "The brand's Pakistan website" } },
    { name: 'description', type: 'textarea', admin: { description: 'Our own short intro for the brand page (no copied text)' } },
  ],
}
