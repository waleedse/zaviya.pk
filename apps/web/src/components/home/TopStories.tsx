'use client'

import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** "Top stories" with a 12-hour / 24-hour switch; both lists are rendered on the server. */
export function TopStoriesTabs({ tabs }: { tabs: { key: string; label: string; content: ReactNode }[] }) {
  const [active, setActive] = useState(tabs[0]?.key)
  return (
    <div>
      <div role="tablist" className="mb-5 inline-flex rounded-xl border border-border bg-surface p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active === t.key}
            onClick={() => setActive(t.key)}
            className={cn(
              'min-h-9 rounded-lg px-4 text-sm font-bold transition-colors',
              active === t.key ? 'bg-accent text-white shadow-sm' : 'text-fg-muted hover:text-fg',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.key} role="tabpanel" hidden={active !== t.key}>
          {t.content}
        </div>
      ))}
    </div>
  )
}
