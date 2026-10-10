'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { RateTable } from '@/components/data/RateTable'
import type { Locale } from '@zaviya/shared'
import { formatNumber } from '@/lib/format'

export function CityTabs({
  locale,
  cities,
}: {
  locale: Locale
  cities: { city: string; values: Record<string, number> }[]
}) {
  if (!cities?.length) return null
  return (
    <Tabs defaultValue={cities[0]!.city} className="my-8">
      <TabsList className="mb-4 flex h-auto flex-wrap gap-1">
        {cities.map((c) => (
          <TabsTrigger key={c.city} value={c.city} className="capitalize">
            {c.city}
          </TabsTrigger>
        ))}
      </TabsList>
      {cities.map((c) => (
        <TabsContent key={c.city} value={c.city}>
          <RateTable
            locale={locale}
            rows={Object.entries(c.values).map(([label, v]) => ({ label, values: { rate: v } }))}
          />
        </TabsContent>
      ))}
    </Tabs>
  )
}
