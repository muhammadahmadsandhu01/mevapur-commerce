/**
 * Commerce Governance TypeScript Contracts
 * Phase 6B/6C Admin Control Plane Interfaces
 */

import type { MoneyExact } from '../lib/exactMoney';

export type { MoneyExact };

export type VersionStatus =
  | 'draft'
  | 'validated'
  | 'scheduled'
  | 'active'
  | 'superseded'
  | 'retired';

export interface PostalCodeRange {
  type: 'exact' | 'prefix' | 'numeric_range';
  value?: string;
  min?: string;
  max?: string;
}

export interface WeightBand {
  minWeightGrams: number;
  maxWeightGrams: number;
  rateExact: MoneyExact;
  pricingMode?: 'REPLACE_BASE' | 'ADD_TO_BASE';
}

export interface FulfillmentOrigin {
  originId: string;
  name: string;
  country: string;
  subdivision?: string;
  city: string;
  postalCode?: string;
  addressLine1?: string;
  addressLine2?: string;
  timeZone: string;
  enabled?: boolean;
  isDefault?: boolean;
}

export interface MerchantProfile {
  merchantCountry: string;
  legalName?: string;
  sellingMode: 'domestic' | 'international' | 'hybrid';
  baseCurrency: string;
  defaultCurrency: string;
  enabledCurrencies: string[];
  enabledCountries: string[];
  defaultLocale?: string;
  defaultTimeZone?: string;
  fulfillmentOrigins: FulfillmentOrigin[];
  supportedIncoterms: Array<'DOMESTIC' | 'DAP' | 'DDP' | 'CIF' | 'FOB' | 'EXW'>;
  taxCalculationMode?: 'exact_rational';
}

export interface ShippingRule {
  ruleId: string;
  name: string;
  serviceCode: string;
  displayName: string;
  originCountry: string;
  destinationCountry: string;
  destinationSubdivisions?: string[];
  postalCodeRanges?: PostalCodeRange[];
  currency: string;
  baseRateExact: MoneyExact;
  freeShippingThresholdExact?: MoneyExact | null;
  remoteRateExact?: MoneyExact | null;
  remotePostalPrefixes?: string[];
  remoteCities?: string[];
  deliveryMinDays: number;
  deliveryMaxDays: number;
  remoteDeliveryMinDays?: number | null;
  remoteDeliveryMaxDays?: number | null;
  processingCutoffLocal?: string;
  workingDays?: number[];
  processingMinBusinessDays?: number;
  processingMaxBusinessDays?: number;
  weightBands?: WeightBand[];
  priority?: number;
  supportedIncoterms?: Array<'DOMESTIC' | 'DAP' | 'DDP' | 'CIF' | 'FOB' | 'EXW'>;
  enabled?: boolean;
}

export interface TaxRule {
  ruleId: string;
  destinationCountry: string;
  destinationSubdivision?: string;
  taxType: 'VAT' | 'GST' | 'SALES_TAX' | 'CUSTOMS_VAT' | 'EXEMPT';
  taxTreatment?: 'inclusive' | 'exclusive';
  taxableBasis?: 'subtotal' | 'subtotal_shipping' | 'cif';
  taxRateNumerator: number;
  taxRateDenominator?: number;
  dutyRateNumerator?: number;
  dutyRateDenominator?: number;
  roundingMode?: 'HALF_UP' | 'HALF_EVEN' | 'FLOOR' | 'CEIL';
  roundingScope?: 'subtotal' | 'per_item';
  incoterm: 'DOMESTIC' | 'DAP' | 'DDP';
  exemptionThresholdExact?: MoneyExact | null;
  sourceAuthority: string;
  sourceReference: string;
  sourcePublicationDate?: string | null;
  verificationStatus?: 'UNVERIFIED_ESTIMATE' | 'VERIFIED_LEGAL_RULE';
  requiresTax?: boolean;
  requiresDuty?: boolean;
  enabled?: boolean;
}

export interface CommerceConfigurationVersion {
  _id: string;
  version: number;
  merchantScopeId: string;
  status: VersionStatus;
  lockVersion: number;
  merchantProfile: MerchantProfile;
  shippingRules: ShippingRule[];
  taxRules: TaxRule[];
  effectiveFrom?: string;
  effectiveTo?: string | null;
  validationErrors?: Array<{
    path: string;
    message: string;
    code: string;
  }>;
  validationWarnings?: Array<{
    path: string;
    message: string;
    code: string;
  }>;
  revokedAt?: string | null;
  revocationReason?: string | null;
  changeNotes?: string;
  author?: {
    _id: string;
    fullName?: string;
    email?: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface VersionListResponse {
  versions: CommerceConfigurationVersion[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface ValidationResult {
  version: number;
  status: VersionStatus;
  isValid: boolean;
  errors: Array<{
    path: string;
    message: string;
    code: string;
  }>;
  warnings: Array<{
    path: string;
    message: string;
    code: string;
  }>;
  checkedAt: string;
}

export interface QuotePreviewRequest {
  configId: string;
  merchantScopeId?: string;
  destination: {
    countryCode: string;
    province?: string;
    city?: string;
    postalCode?: string;
  };
  items: Array<{
    productId?: string;
    name?: string;
    price: number;
    quantity: number;
    weightGrams?: number;
  }>;
  currency?: string;
  couponCode?: string;
  shippingServiceLevel?: string;
}

export interface QuotePreviewResponse {
  previewVersion: number;
  previewStatus: VersionStatus;
  merchantScopeId: string;
  destinationCountry: string;
  currency: string;
  incoterm: string;
  serviceability?: boolean;
  reasonCode?: string;
  items: Array<{
    itemIndex: number;
    name: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    lineTotalExact: MoneyExact;
    weightGrams: number;
  }>;
  totals: {
    subtotal: number;
    subtotalExact?: MoneyExact;
    shipping: number;
    shippingExact?: MoneyExact;
    tax: number;
    taxExact?: MoneyExact;
    taxType: string;
    duties: number;
    dutiesExact?: MoneyExact;
    grandTotal: number;
    grandTotalExact?: MoneyExact;
  };
  appliedRules: {
    shippingRuleId: string | null;
    taxRuleId: string | null;
    taxSourceReference: string | null;
    taxVerificationStatus: string;
  };
  deliveryEstimate: {
    minDays: number;
    maxDays: number;
  };
  deliveryPromise?: {
    dispatchDate?: string;
    dispatchMinDate?: string;
    dispatchMaxDate?: string;
    promiseText?: string;
    isRemote?: boolean;
  };
  shipmentGroups?: Array<{
    groupId?: string;
    originCountry?: string;
    locationCode?: string;
    serviceLevel?: string;
    shippingAmount?: number;
    shippingAmountExact?: MoneyExact;
    deliveryPromise?: {
      promiseText?: string;
      dispatchDate?: string;
    };
    items?: Array<{
      productId?: string;
      name?: string;
      quantity?: number;
    }>;
  }>;
}

export interface ReadinessStatus {
  merchantScopeId: string;
  hasActiveConfiguration: boolean;
  activeVersion: number | null;
  activeEffectiveFrom: string | null;
  activeSellingMode: 'domestic' | 'international' | 'hybrid' | null;
  enabledCountriesCount: number;
  enabledCurrenciesCount: number;
  shippingRulesCount: number;
  taxRulesCount: number;
  unverifiedTaxRulesCount: number;
  recentVersions: Array<{
    version: number;
    status: VersionStatus;
    effectiveFrom?: string;
    effectiveTo?: string | null;
    validationErrors?: unknown[];
  }>;
}
