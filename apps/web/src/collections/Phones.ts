import type { CollectionConfig } from 'payload'
import { publicRead, botCanCreateUpdateNotDelete, adminOnlyDelete } from '../access'
import { revalidatePhonesHook } from '../hooks/phones'

/**
 * A phone sold in Pakistan. Prices are official PKR prices only (brand Pakistan sites / PTA notices):
 * a variant without `pricePkr` is shown as "price not announced". Every price has a source URL.
 * Importer and daily refresh: lib/phones/importer.ts, POST /api/pipeline/phones/import.
 */
export const Phones: CollectionConfig = {
  slug: 'phones',
  labels: { singular: 'Phone', plural: 'Phones' },
  admin: {
    useAsTitle: 'name',
    group: 'Mobile prices',
    defaultColumns: ['name', 'brand', 'pricePkr', 'priceUpdatedAt', 'status'],
    listSearchableFields: ['name', 'slug'],
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
    { name: 'brand', type: 'relationship', relationTo: 'phone-brands', required: true, index: true },
    { name: 'launchDate', type: 'date', admin: { date: { pickerAppearance: 'dayOnly' } } },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'current',
      options: [
        { label: 'On sale', value: 'current' },
        { label: 'Discontinued', value: 'discontinued' },
        { label: 'Upcoming', value: 'upcoming' },
      ],
    },
    { name: 'hidden', type: 'checkbox', defaultValue: false, admin: { description: 'Keep out of the site and the sitemap' } },
    { name: 'popularity', type: 'number', defaultValue: 0, index: true, admin: { description: '0-100: sort order and compare pairs' } },
    { name: 'imageUrl', type: 'text', admin: { description: 'Product photo URL (official press image)' } },
    { name: 'officialUrl', type: 'text', admin: { description: "The brand's Pakistan page for this phone" } },
    { name: 'summary', type: 'textarea', admin: { description: 'Our own 2-3 sentence summary. Empty: one is generated from the specs.' } },
    {
      name: 'colours',
      type: 'array',
      fields: [{ name: 'name', type: 'text', required: true }],
    },
    {
      name: 'variants',
      type: 'array',
      admin: { description: 'RAM + storage options. pricePkr empty = price not announced.' },
      fields: [
        { name: 'ramGb', type: 'number' },
        { name: 'storageGb', type: 'number', required: true },
        { name: 'pricePkr', type: 'number' },
        { name: 'priceSourceUrl', type: 'text' },
        { name: 'priceCheckedAt', type: 'date' },
      ],
    },
    { name: 'pricePkr', type: 'number', index: true, admin: { readOnly: true, description: 'Lowest variant price (set automatically)' } },
    { name: 'priceUpdatedAt', type: 'date', admin: { readOnly: true } },
    {
      name: 'priceHistory',
      type: 'array',
      admin: { description: 'One row per official price change (written by the daily refresh)' },
      fields: [
        { name: 'date', type: 'date', required: true },
        { name: 'variant', type: 'text', required: true },
        { name: 'pricePkr', type: 'number', required: true },
        { name: 'sourceUrl', type: 'text' },
      ],
    },
    {
      name: 'pta',
      type: 'group',
      label: 'PTA',
      fields: [
        {
          name: 'status',
          type: 'select',
          options: [
            { label: 'PTA approved', value: 'approved' },
            { label: 'Not listed', value: 'not-listed' },
            { label: 'Unknown', value: 'unknown' },
          ],
        },
        { name: 'taxPkr', type: 'number', admin: { description: 'Only when an official PTA/FBR notification states it' } },
        { name: 'sourceUrl', type: 'text' },
        { name: 'note', type: 'text' },
      ],
    },
    {
      name: 'specs',
      type: 'group',
      fields: [
        { name: 'displaySize', type: 'text' },
        { name: 'displayType', type: 'text' },
        { name: 'displayResolution', type: 'text' },
        { name: 'refreshRateHz', type: 'number' },
        { name: 'chipset', type: 'text' },
        { name: 'os', type: 'text' },
        { name: 'network', type: 'text' },
        { name: 'sim', type: 'text' },
        { name: 'rearCamera', type: 'text' },
        { name: 'frontCamera', type: 'text' },
        { name: 'batteryMah', type: 'number' },
        { name: 'chargingW', type: 'number' },
        { name: 'weightG', type: 'number' },
        { name: 'dimensions', type: 'text' },
        { name: 'protection', type: 'text' },
      ],
    },
    { name: 'specsSourceUrl', type: 'text', admin: { description: 'Manufacturer spec page the specs were read from' } },
  ],
}
