import { createContext, useContext } from 'react'
import type { SpringConfig } from 'remotion'
import { BRAND } from '../constants'
import type { Mode, ThemeName } from '../types'

export interface Theme {
  name: ThemeName
  bg: string
  /** RGB triplet of bg, for gradients */
  bgRgb: string
  accent: string
  /** text colour on top of the accent */
  accentInk: string
  band: string
  spring: SpringConfig
  /** photo saturation, 1 = untouched */
  saturate: number
  /** warm/cool tint laid over photos */
  tint: string
  fade: boolean
  ticker: boolean
  text: string
  /** colour for big figures and numbers */
  figure: string
  /** animated grid backdrop */
  grid: boolean
}

const lively: Partial<SpringConfig> = { damping: 13, stiffness: 170, mass: 0.7 }
const calm: Partial<SpringConfig> = { damping: 200 }

export const THEMES: Record<ThemeName, Theme> = {
  sunrise: {
    name: 'sunrise',
    bg: BRAND.green,
    bgRgb: '8,20,16',
    accent: BRAND.yellow,
    accentInk: '#081410',
    band: BRAND.yellow,
    spring: lively as SpringConfig,
    saturate: 1,
    tint: 'rgba(255,150,50,0.14)',
    fade: false,
    ticker: false,
    text: '#FFFFFF',
    figure: BRAND.yellow,
    grid: false,
  },
  night: {
    name: 'night',
    bg: BRAND.navy,
    bgRgb: '11,22,48',
    accent: BRAND.yellow,
    accentInk: '#0B1630',
    band: BRAND.yellow,
    spring: lively as SpringConfig,
    saturate: 1,
    tint: 'rgba(40,80,200,0.14)',
    fade: false,
    ticker: false,
    text: '#FFFFFF',
    figure: BRAND.yellow,
    grid: false,
  },
  breaking: {
    name: 'breaking',
    bg: '#14090B',
    bgRgb: '20,9,11',
    accent: BRAND.red,
    accentInk: '#FFFFFF',
    band: BRAND.red,
    spring: lively as SpringConfig,
    saturate: 1,
    tint: 'rgba(229,35,27,0.10)',
    fade: false,
    ticker: true,
    text: '#FFFFFF',
    figure: BRAND.red,
    grid: false,
  },
  tech: {
    name: 'tech',
    bg: '#05070F',
    bgRgb: '5,7,15',
    accent: '#22D3EE',
    accentInk: '#05070F',
    band: '#22D3EE',
    spring: lively as SpringConfig,
    saturate: 1,
    tint: 'rgba(123,77,255,0.16)',
    fade: false,
    ticker: false,
    text: '#FFFFFF',
    figure: '#22D3EE',
    grid: true,
  },
  money: {
    name: 'money',
    bg: BRAND.green,
    bgRgb: '8,20,16',
    accent: BRAND.yellow,
    accentInk: '#081410',
    band: BRAND.yellow,
    spring: lively as SpringConfig,
    saturate: 1,
    tint: 'rgba(255,150,50,0.14)',
    fade: false,
    ticker: false,
    text: '#FFFFFF',
    figure: BRAND.lime,
    grid: false,
  },
  sombre: {
    name: 'sombre',
    bg: '#111111',
    bgRgb: '17,17,17',
    accent: '#E6E6E6',
    accentInk: '#111111',
    band: '#E6E6E6',
    spring: calm as SpringConfig,
    saturate: 0.7,
    tint: 'rgba(0,0,0,0)',
    fade: true,
    ticker: false,
    text: '#F2F2F2',
    figure: '#E6E6E6',
    grid: false,
  },
}

export interface Ctx {
  theme: Theme
  mode: Mode
  /** frames per beat */
  beat: number
}

export const ThemeCtx = createContext<Ctx>({ theme: THEMES.sunrise, mode: 'normal', beat: 15 })
export const useTheme = () => useContext(ThemeCtx)
