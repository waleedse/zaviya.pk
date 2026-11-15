import type { CollectionConfig } from 'payload'
import { publicRead, botCanCreateUpdateNotDelete, adminOnlyDelete } from '../access'

/**
 * One product listing in a Pakistani retail store's own public feed (15 Nov 2026, docs/PRICE-ENGINE.md "Store offers").
 * Written by POST /api/pipeline/offers/import (the worker's rolling store crawl), shown as "Where to buy" on phone and
 * appliance pages and in the price search. `matchKind`/`matchSlug` link it to our phone or appliance page.
 */
export const StoreOffers: CollectionConfig = {
  slug: 'store-offers',
  labels: { singular: 'Store offer', plural: 'Store offers' },
  admin: { useAsTitle: 'title', group: 'Prices', defaultColumns: ['title', 'store', 'pricePkr', 'group', 'matchSlug', 'seenAt'], listSearchableFields: ['title', 'slug'] },
  access: { read: publicRead, create: botCanCreateUpdateNotDelete, update: botCanCreateUpdateNotDelete, delete: adminOnlyDelete },
  fields: [
    { name: 'slug', type: 'text', required: true, unique: true, index: true },
    { name: 'store', type: 'text', required: true, index: true },
    { name: 'title', type: 'text', required: true },
    { name: 'brand', type: 'text', index: true },
    { name: 'group', type: 'text', required: true, index: true },
    { name: 'url', type: 'text', required: true },
    { name: 'imageUrl', type: 'text' },
    { name: 'pricePkr', type: 'number', index: true },
    { name: 'listPricePkr', type: 'number' },
    { name: 'prevPricePkr', type: 'number', admin: { description: 'Price before the last change' } },
    { name: 'priceChangedAt', type: 'date', index: true },
    { name: 'inStock', type: 'checkbox' },
    { name: 'model', type: 'text' },
    { name: 'matchKind', type: 'text', index: true, admin: { description: 'phone or appliance' } },
    { name: 'matchSlug', type: 'text', index: true },
    { name: 'seenAt', type: 'date', index: true, admin: { description: 'Last time the store feed listed it' } },
  ],
}
