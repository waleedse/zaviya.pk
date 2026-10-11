import { Baby, CalendarDays, Coins, Compass, DollarSign, Fuel, MoonStar, Radio, type LucideIcon } from 'lucide-react'

export interface ToolLink {
  path: string
  en: string
  ur: string
  subEn: string
  subUr: string
  icon: LucideIcon
  /** Tailwind classes for the icon tile */
  tile: string
}

/** Daily utilities: every entry points at a real page on the site. */
export const TOOLS: ToolLink[] = [
  { path: '/namaz-timings', en: 'Namaz timings', ur: 'نماز کے اوقات', subEn: 'Every major city, Hanafi & Shafi', subUr: 'تمام بڑے شہر، حنفی و شافعی', icon: MoonStar, tile: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' },
  { path: '/gold-rate-today-pakistan', en: 'Gold rate', ur: 'سونے کا ریٹ', subEn: '24K & 22K per tola', subUr: '24 اور 22 قیراط فی تولہ', icon: Coins, tile: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300' },
  { path: '/dollar-rate-today-pakistan', en: 'Dollar rate', ur: 'ڈالر کا ریٹ', subEn: 'Open market & interbank', subUr: 'اوپن مارکیٹ اور انٹربینک', icon: DollarSign, tile: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300' },
  { path: '/petrol-price-today-pakistan', en: 'Petrol price', ur: 'پیٹرول کی قیمت', subEn: 'Petrol & diesel today', subUr: 'آج پیٹرول اور ڈیزل', icon: Fuel, tile: 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300' },
  { path: '/baby-names', en: 'Baby names', ur: 'بچوں کے نام', subEn: 'Islamic names with meaning', subUr: 'اسلامی نام معنی کے ساتھ', icon: Baby, tile: 'bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300' },
  { path: '/namaz-timings#islamic-dates', en: 'Islamic calendar', ur: 'اسلامی کیلنڈر', subEn: 'Hijri dates & events', subUr: 'ہجری تاریخیں اور مواقع', icon: CalendarDays, tile: 'bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300' },
  { path: '/namaz-timings#qibla', en: 'Qibla direction', ur: 'قبلہ رخ', subEn: 'Bearing for your city', subUr: 'اپنے شہر کے لیے', icon: Compass, tile: 'bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300' },
  { path: '/live', en: 'Live updates', ur: 'لائیو اپ ڈیٹس', subEn: 'Developing stories', subUr: 'جاری خبریں', icon: Radio, tile: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300' },
]

export const QUICK_TOOLS = TOOLS.slice(0, 6)
