/**
 * BISP 8171 page (ZG-19). Everything here comes from the official BISP sites, read on 12 Nov 2026:
 * https://8171.bisp.gov.pk (the eligibility check: CNIC + captcha) and https://bisp.gov.pk (programmes, registration
 * guides, portals, helpline). Nothing about SMS rules, payment amounts or balances is stated that those pages do not state.
 */
export const BISP = {
  checkedOn: '2026-11-12',
  helpline: '0800-26477',
  portalHost: '8171.bisp.gov.pk',
} as const

export interface OfficialLink {
  label: string
  url: string
  note: string
}

/** The only links the page sends readers to. All on bisp.gov.pk, 8171.bisp.gov.pk or the NADRA registry centre list BISP itself links. */
export const OFFICIAL_LINKS: Record<'portal' | 'site' | 'kafaalat' | 'beneficiaries' | 'nser' | 'complaints', OfficialLink> = {
  portal: { label: '8171.bisp.gov.pk', url: 'https://8171.bisp.gov.pk', note: 'The official 8171 web portal: household eligibility check with CNIC and a captcha.' },
  site: { label: 'bisp.gov.pk', url: 'https://bisp.gov.pk', note: 'BISP main site: programmes, registration guides, news.' },
  kafaalat: { label: 'BISP Kafaalat Portal', url: 'https://uctdashboard.bisp.gov.pk/', note: 'Listed on bisp.gov.pk as the Kafaalat Portal.' },
  beneficiaries: { label: 'BISP Beneficiaries Portal', url: 'https://dli7.bisp.gov.pk/', note: 'Listed on bisp.gov.pk as the Beneficiaries Portal.' },
  nser: { label: 'NSER registration centres (NADRA)', url: 'https://nser.nadra.gov.pk/nsersurvey/bispnsersurveycenters', note: 'Where bisp.gov.pk sends you to find an NSER registration centre.' },
  complaints: { label: 'PMDU Citizen Portal', url: 'https://citizenportal.gov.pk/', note: 'Listed on bisp.gov.pk under complaints.' },
}

export const REGISTRATION_GUIDES: OfficialLink[] = [
  { label: 'Benazir Kafaalat registration process (English and Urdu, PDF)', url: 'https://bisp.gov.pk/SiteImage/Misc/files/KifalatEngUrdu_2022.pdf', note: '' },
  { label: 'NSER registration process (English and Urdu, PDF)', url: 'https://bisp.gov.pk/SiteImage/Misc/files/NSEREngUrdu_2022.pdf', note: '' },
  { label: 'Benazir Nashonuma registration process (Urdu, PDF)', url: 'https://bisp.gov.pk/SiteImage/Misc/files/NashonomaUrdu_2022.pdf', note: '' },
  { label: 'Benazir Taleemi Wazaif registration process (PDF)', url: 'https://bisp.gov.pk/SiteImage/Misc/files/Taleemi%20Wazaif_09162022.pdf', note: '' },
]

/** The programmes bisp.gov.pk lists. */
export const PROGRAMMES = ['Benazir Kafaalat', 'Benazir Nashonuma', 'Benazir Taleemi Wazaif', 'Benazir Hunarmand', 'Benazir National Socio-Economic Registry (NSER)'] as const
