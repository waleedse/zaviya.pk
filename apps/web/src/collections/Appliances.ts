import type { CollectionConfig } from 'payload'
import { APPLIANCE_BRANDS, APPLIANCE_CATEGORIES } from '@zaviya/shared'
import { publicRead, botCanCreateUpdateNotDelete, adminOnlyDelete } from '../access'
import { revalidateAppliancesHook } from '../hooks/appliances'

/**
 * One priced item on zaviya.pk/prices: a home appliance, a motorcycle or car, or a weekly grocery price (6 Nov 2026,
 * docs/PRICE-ENGINE.md). Prices are only what an official source shows; `officialUrl` is that page.
 * Brand and category are text checked against the lists in @zaviya/shared, so a new source needs no migration.
 * Importer and daily refresh: lib/appliances/importer.ts, POST /api/pipeline/appliances/import.
 */
const brandList = APPLIANCE_BRANDS.map((b) => b.slug).join(', ')
const categoryList = APPLIANCE_CATEGORIES.map((c) => c.slug).join(', ')
const oneOf = (allowed: readonly { slug: string }[]) => (value: unknown) =>
  typeof value === 'string' && allowed.some((x) => x.slug === value) ? true : `Must be one of: ${allowed.map((x) => x.slug).join(', ')}`
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
    { name: 'brand', type: 'text', required: true, index: true, validate: oneOf(APPLIANCE_BRANDS), admin: { description: `One of: ${brandList}` } },
    { name: 'category', type: 'text', required: true, index: true, validate: oneOf(APPLIANCE_CATEGORIES), admin: { description: `One of: ${categoryList}` } },
    { name: 'nameUr', type: 'text', admin: { description: 'Urdu name (groceries)' } },
    { name: 'model', type: 'text' },
    { name: 'unit', type: 'text', admin: { description: 'What the price is for: "20 kg bag", "Ex-factory price"' } },
    { name: 'hidden', type: 'checkbox', defaultValue: false, admin: { description: 'Keep out of the site and the sitemap' } },
    { name: 'popularity', type: 'number', defaultValue: 0, index: true },
    { name: 'hotScore', type: 'number', defaultValue: 0, index: true, admin: { readOnly: true, description: 'Views in the last 7 days plus search demand (POST /api/pipeline/prices/hot, daily)' } },
    { name: 'imageUrl', type: 'text' },
    { name: 'officialUrl', type: 'text', required: true, admin: { description: "The product page on the brand's own store (the Buy button), the maker's price list, or the official release" } },
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
      name: 'cityPrices',
      type: 'array',
      admin: { description: 'Per-city prices from an official release (PBS weekly SPI: lowest, average, highest)' },
      fields: [
        { name: 'city', type: 'text', required: true },
        { name: 'min', type: 'number' },
        { name: 'avg', type: 'number', required: true },
        { name: 'max', type: 'number' },
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
