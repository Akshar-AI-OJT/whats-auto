import { COUNTRY_OPTIONS } from '@/components/onboarding/organization-wizard-types'

/** ISO 3166-1 alpha-2 codes supported in onboarding country selects. */
export type CountryCode = (typeof COUNTRY_OPTIONS)[number]['code']

/** All 28 states and 8 union territories of India (official English names). */
export const INDIAN_STATES_AND_UTS = [
  'Andaman and Nicobar Islands',
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chandigarh',
  'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jammu and Kashmir',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Ladakh',
  'Lakshadweep',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Puducherry',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
] as const

const SUBDIVISIONS_BY_COUNTRY: Record<CountryCode, readonly string[]> = {
  IN: INDIAN_STATES_AND_UTS,
  US: [
    'Alabama',
    'Alaska',
    'Arizona',
    'Arkansas',
    'California',
    'Colorado',
    'Connecticut',
    'Delaware',
    'District of Columbia',
    'Florida',
    'Georgia',
    'Hawaii',
    'Idaho',
    'Illinois',
    'Indiana',
    'Iowa',
    'Kansas',
    'Kentucky',
    'Louisiana',
    'Maine',
    'Maryland',
    'Massachusetts',
    'Michigan',
    'Minnesota',
    'Mississippi',
    'Missouri',
    'Montana',
    'Nebraska',
    'Nevada',
    'New Hampshire',
    'New Jersey',
    'New Mexico',
    'New York',
    'North Carolina',
    'North Dakota',
    'Ohio',
    'Oklahoma',
    'Oregon',
    'Pennsylvania',
    'Rhode Island',
    'South Carolina',
    'South Dakota',
    'Tennessee',
    'Texas',
    'Utah',
    'Vermont',
    'Virginia',
    'Washington',
    'West Virginia',
    'Wisconsin',
    'Wyoming',
  ],
  GB: ['England', 'Northern Ireland', 'Scotland', 'Wales'],
  AE: [
    'Abu Dhabi',
    'Ajman',
    'Dubai',
    'Fujairah',
    'Ras Al Khaimah',
    'Sharjah',
    'Umm Al Quwain',
  ],
  SG: ['Central Region', 'East Region', 'North Region', 'North-East Region', 'West Region'],
  AU: [
    'Australian Capital Territory',
    'New South Wales',
    'Northern Territory',
    'Queensland',
    'South Australia',
    'Tasmania',
    'Victoria',
    'Western Australia',
  ],
  CA: [
    'Alberta',
    'British Columbia',
    'Manitoba',
    'New Brunswick',
    'Newfoundland and Labrador',
    'Northwest Territories',
    'Nova Scotia',
    'Nunavut',
    'Ontario',
    'Prince Edward Island',
    'Quebec',
    'Saskatchewan',
    'Yukon',
  ],
  DE: [
    'Baden-Württemberg',
    'Bavaria',
    'Berlin',
    'Brandenburg',
    'Bremen',
    'Hamburg',
    'Hesse',
    'Lower Saxony',
    'Mecklenburg-Vorpommern',
    'North Rhine-Westphalia',
    'Rhineland-Palatinate',
    'Saarland',
    'Saxony',
    'Saxony-Anhalt',
    'Schleswig-Holstein',
    'Thuringia',
  ],
  FR: [
    'Auvergne-Rhône-Alpes',
    'Bourgogne-Franche-Comté',
    'Brittany',
    'Centre-Val de Loire',
    'Corsica',
    'Grand Est',
    'Hauts-de-France',
    'Île-de-France',
    'Normandy',
    'Nouvelle-Aquitaine',
    'Occitanie',
    'Pays de la Loire',
    "Provence-Alpes-Côte d'Azur",
  ],
  NL: [
    'Drenthe',
    'Flevoland',
    'Friesland',
    'Gelderland',
    'Groningen',
    'Limburg',
    'North Brabant',
    'North Holland',
    'Overijssel',
    'South Holland',
    'Utrecht',
    'Zeeland',
  ],
}

export function getSubdivisionsForCountry(countryCode: string): readonly string[] {
  if (!countryCode) return []
  return SUBDIVISIONS_BY_COUNTRY[countryCode as CountryCode] ?? []
}

export function isSubdivisionValidForCountry(countryCode: string, subdivision: string): boolean {
  const value = subdivision.trim()
  if (!value || !countryCode) return false
  return getSubdivisionsForCountry(countryCode).some(
    (option) => option.localeCompare(value, undefined, { sensitivity: 'accent' }) === 0
  )
}

/** Match stored state text to a canonical subdivision label when possible. */
export function resolveSubdivisionForCountry(countryCode: string, subdivision: string): string {
  const value = subdivision.trim()
  if (!value || !countryCode) return ''
  const match = getSubdivisionsForCountry(countryCode).find(
    (option) => option.localeCompare(value, undefined, { sensitivity: 'accent' }) === 0
  )
  return match ?? ''
}

export function countrySupportsSubdivisions(countryCode: string): boolean {
  return getSubdivisionsForCountry(countryCode).length > 0
}
