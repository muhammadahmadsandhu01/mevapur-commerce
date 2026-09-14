/**
 * ISO 3166-1 Country Metadata & Address Requirement Policies
 * Adheres strictly to Universal Postal Union (UPU) and ITU-T E.164 baseline.
 */

export interface CountryPolicy {
  code: string; // ISO 3166-1 alpha-2
  name: string;
  defaultCurrency: string;
  callingCode: string;
  postalPolicy: 'required' | 'optional' | 'not_used' | 'unknown';
  adminPolicy: 'required' | 'optional' | 'unknown';
  adminType: 'province' | 'state' | 'emirate' | 'prefecture' | 'county' | 'region' | 'department' | 'governorate' | 'district' | 'municipality' | 'none' | 'unknown';
}

const COUNTRY_POLICIES: Record<string, CountryPolicy> = {
  PK: { code: 'PK', name: 'Pakistan', defaultCurrency: 'PKR', callingCode: '+92', postalPolicy: 'optional', adminPolicy: 'required', adminType: 'province' },
  AE: { code: 'AE', name: 'United Arab Emirates', defaultCurrency: 'AED', callingCode: '+971', postalPolicy: 'not_used', adminPolicy: 'required', adminType: 'emirate' },
  GB: { code: 'GB', name: 'United Kingdom', defaultCurrency: 'GBP', callingCode: '+44', postalPolicy: 'required', adminPolicy: 'optional', adminType: 'county' },
  US: { code: 'US', name: 'United States', defaultCurrency: 'USD', callingCode: '+1', postalPolicy: 'required', adminPolicy: 'required', adminType: 'state' },
  DE: { code: 'DE', name: 'Germany', defaultCurrency: 'EUR', callingCode: '+49', postalPolicy: 'required', adminPolicy: 'optional', adminType: 'state' },
  CA: { code: 'CA', name: 'Canada', defaultCurrency: 'CAD', callingCode: '+1', postalPolicy: 'required', adminPolicy: 'required', adminType: 'province' },
  AU: { code: 'AU', name: 'Australia', defaultCurrency: 'AUD', callingCode: '+61', postalPolicy: 'required', adminPolicy: 'required', adminType: 'state' },
  SA: { code: 'SA', name: 'Saudi Arabia', defaultCurrency: 'SAR', callingCode: '+966', postalPolicy: 'required', adminPolicy: 'required', adminType: 'region' },
  KW: { code: 'KW', name: 'Kuwait', defaultCurrency: 'KWD', callingCode: '+965', postalPolicy: 'optional', adminPolicy: 'required', adminType: 'governorate' },
  QA: { code: 'QA', name: 'Qatar', defaultCurrency: 'QAR', callingCode: '+974', postalPolicy: 'not_used', adminPolicy: 'optional', adminType: 'municipality' },
  OM: { code: 'OM', name: 'Oman', defaultCurrency: 'OMR', callingCode: '+968', postalPolicy: 'optional', adminPolicy: 'required', adminType: 'governorate' },
  BH: { code: 'BH', name: 'Bahrain', defaultCurrency: 'BHD', callingCode: '+973', postalPolicy: 'required', adminPolicy: 'optional', adminType: 'governorate' },
  CN: { code: 'CN', name: 'China', defaultCurrency: 'CNY', callingCode: '+86', postalPolicy: 'required', adminPolicy: 'required', adminType: 'province' },
  JP: { code: 'JP', name: 'Japan', defaultCurrency: 'JPY', callingCode: '+81', postalPolicy: 'required', adminPolicy: 'required', adminType: 'prefecture' },
  FR: { code: 'FR', name: 'France', defaultCurrency: 'EUR', callingCode: '+33', postalPolicy: 'required', adminPolicy: 'optional', adminType: 'department' },
  IT: { code: 'IT', name: 'Italy', defaultCurrency: 'EUR', callingCode: '+39', postalPolicy: 'required', adminPolicy: 'required', adminType: 'province' },
  ES: { code: 'ES', name: 'Spain', defaultCurrency: 'EUR', callingCode: '+34', postalPolicy: 'required', adminPolicy: 'required', adminType: 'province' },
  NL: { code: 'NL', name: 'Netherlands', defaultCurrency: 'EUR', callingCode: '+31', postalPolicy: 'required', adminPolicy: 'optional', adminType: 'province' },
  CH: { code: 'CH', name: 'Switzerland', defaultCurrency: 'CHF', callingCode: '+41', postalPolicy: 'required', adminPolicy: 'required', adminType: 'state' },
  TR: { code: 'TR', name: 'Turkey', defaultCurrency: 'TRY', callingCode: '+90', postalPolicy: 'required', adminPolicy: 'required', adminType: 'province' },
  IN: { code: 'IN', name: 'India', defaultCurrency: 'INR', callingCode: '+91', postalPolicy: 'required', adminPolicy: 'required', adminType: 'state' },
  BD: { code: 'BD', name: 'Bangladesh', defaultCurrency: 'BDT', callingCode: '+880', postalPolicy: 'required', adminPolicy: 'required', adminType: 'district' },
  MY: { code: 'MY', name: 'Malaysia', defaultCurrency: 'MYR', callingCode: '+60', postalPolicy: 'required', adminPolicy: 'required', adminType: 'state' },
  SG: { code: 'SG', name: 'Singapore', defaultCurrency: 'SGD', callingCode: '+65', postalPolicy: 'required', adminPolicy: 'optional', adminType: 'none' },
};

/**
 * Retrieves country policy metadata for an ISO 3166-1 alpha-2 country code.
 * Defaults safely to universal standard rules if country is not explicitly listed.
 */
export function getCountryPolicy(countryCode: string): CountryPolicy {
  const code = (countryCode || '').trim().toUpperCase();
  if (COUNTRY_POLICIES[code]) {
    return COUNTRY_POLICIES[code];
  }

  return {
    code: code || 'UNKNOWN',
    name: code || 'International Destination',
    defaultCurrency: 'USD',
    callingCode: '',
    postalPolicy: 'optional',
    adminPolicy: 'optional',
    adminType: 'province',
  };
}

/**
 * Returns human-friendly label for subdivision based on adminType.
 */
export function getSubdivisionLabel(policy: CountryPolicy): string {
  switch (policy.adminType) {
    case 'state': return 'State';
    case 'emirate': return 'Emirate';
    case 'province': return 'Province';
    case 'prefecture': return 'Prefecture';
    case 'governorate': return 'Governorate';
    case 'department': return 'Department';
    case 'county': return 'County';
    case 'district': return 'District';
    case 'region': return 'Region';
    default: return 'Province / State / Region';
  }
}
