import type { CollectionConfig } from 'payload'
import { APPLIANCE_BRANDS, APPLIANCE_CATEGORIES } from '@zaviya/shared'
import { publicRead, botCanCreateUpdateNotDelete, adminOnlyDelete } from '../access'
import { revalidateAppliancesHook } from '../hooks/appliances'

/**
 * A home appliance sold in Pakistan (zaviya.pk/prices). Prices are only what the brand's own Pakistan store
 * shows; `officialUrl` is that product page and is the "Buy from the official store" button.
 * Importer and daily refresh: lib/appliances/importer.ts, POST /api/pipeline/appliances/import.
 */
export const Appliances: CollectionConfig = {
  slug: 'appliances',
  labels: { singular: 'Appliance', plural: 'Appliances' },
  admin: {
    useAsTitle: 'name',
    group: 'Prices',
    defaultColumns: ['name', 'brand', 'category', 'pricePkr', 'priceUpdatedAt'],
    listSearchableFields: ['name', 'slug', 'model'],
  },
  access: {
    read: publicRead,
    create: botCanCreateUpdateNotDelete,
    update: botCanCreateUpdateNotDelete,
    delete: adminOnlyDelete,
  },
  hooks: { afterChange: [revalidateAppliancesHook] },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, unique: true, index: true },
    { name: 'brand', type: 'select', required: true, index: true, options: APPLIANCE_BRANDS.map((b) => ({ label: b.name, value: b.slug })) },
    { name: 'category', type: 'select', required: true, index: true, options: APPLIANCE_CATEGORIES.map((c) => ({ label: c.name, value: c.slug })) },
    { name: 'model', type: 'text' },
    { name: 'hidden', type: 'checkbox', defaultValue: false, admin: { description: 'Keep out of the site and the sitemap' } },
    { name: 'popularity', type: 'number', defaultValue: 0, index: true },
    { name: 'imageUrl', type: 'text' },
    { name: 'officialUrl', type: 'text', required: true, admin: { description: "The product page on the brand's own store (the Buy button)" } },
    { name: 'summary', type: 'textarea' },
    { name: 'pricePkr', type: 'number', index: true },
    { name: 'listPricePkr', type: 'number', admin: { description: "The brand's own 'was' price, when shown" } },
    { name: 'inStock', type: 'checkbox' },
    { name: 'priceUpdatedAt', type: 'date', admin: { readOnly: true } },
    {
      name: 'specs',
      type: 'array',
      fields: [
        { name: 'label', type: 'text', required: true },
        { name: 'value', type: 'text', required: true },
      ],
    },
    {
      name: 'priceHistory',
      type: 'array',
      admin: { description: 'One row per official price change (written by the daily refresh)' },
      fields: [
        { name: 'date', type: 'date', required: true },
        { name: 'pricePkr', type: 'number', required: true },
        { name: 'sourceUrl', type: 'text' },
      ],
    },
  ],
}
