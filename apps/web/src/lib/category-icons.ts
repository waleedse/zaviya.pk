import {
  BriefcaseBusiness,
  Car,
  Cpu,
  Flag,
  Flame,
  Globe,
  GraduationCap,
  Newspaper,
  Trophy,
  type LucideIcon,
} from 'lucide-react'

const ICONS: Record<string, LucideIcon> = {
  pakistan: Flag,
  world: Globe,
  business: BriefcaseBusiness,
  'tech-telecom': Cpu,
  autos: Car,
  cricket: Trophy,
  'education-jobs': GraduationCap,
  trending: Flame,
}

export function categoryIcon(slug: string): LucideIcon {
  return ICONS[slug] ?? Newspaper
}
