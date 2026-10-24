import {
  BriefcaseBusiness,
  Car,
  Cpu,
  Flag,
  Flame,
  Globe,
  Medal,
  GraduationCap,
  Newspaper,
  Trophy,
  type LucideIcon,
  Sparkles,
} from 'lucide-react'

const ICONS: Record<string, LucideIcon> = {
  pakistan: Flag,
  world: Globe,
  business: BriefcaseBusiness,
  'tech-telecom': Cpu,
  ai: Sparkles,
  autos: Car,
  cricket: Trophy,
  sports: Medal,
  'education-jobs': GraduationCap,
  trending: Flame,
}

export function categoryIcon(slug: string): LucideIcon {
  return ICONS[slug] ?? Newspaper
}
