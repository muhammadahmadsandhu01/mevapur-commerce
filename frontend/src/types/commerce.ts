/**
 * Commerce & Checkout Quote TypeScript Contracts
 * Phase 6A/6C Authoritative Global Quote & Market Interfaces
 */

import type { MoneyExact } from '../lib/exactMoney.ts';

export type { MoneyExact };

export interface MarketConfigResponse {
  configVersionId: string;
  merchantCountry: string;
  homeCountry: string;
  sellingMode: 'domestic' | 'international' | 'hybrid';
  enabledCountries: string[];
  baseCurrency: string;
  defaultCurrency: string;
  enabledCurrencies: string[];
  defaultLocale: string;
  defaultTimeZone: string;
  fulfillmentOriginCountry: string;
  returnDestinationCountry: string;
  supportedIncoterms: string[];
  rolloutMode: string;
  isEnabled: boolean;
}

export interface QuoteItemInput {
  productId: string;
  variantId?: string;
  quantity: number;
}

export interface QuoteAddressInput {
  fullName?: string;
  phone?: string;
  address: string;
  addressLine2?: string;
  city: string;
  province?: string;
  postalCode?: string;
  country?: string;
  countryCode?: string;
}

export interface DeliveryPromiseExact {
  dispatchDate?: string;
  dispatchMinDate?: string;
  dispatchMaxDate?: string;
  minDeliveryDate?: string;
  maxDeliveryDate?: string;
  deliveryMinDays?: number;
  deliveryMaxDays?: number;
  isSameDayDispatch?: boolean;
  isPastCutoff?: boolean;
  isRemote?: boolean;
  promiseText?: string;
  deliveryWindow?: {
    minDays?: number;
    maxDays?: number;
    minDeliveryDate?: string;
    maxDeliveryDate?: string;
    promiseText?: string;
  };
}

export interface QuoteShipmentGroupItem {
  productId: string;
  variantId?: string | null;
  name?: string;
  sku?: string;
  quantity: number;
  weightGrams?: number;
}

export interface QuoteShipmentGroup {
  groupId: string;
  locationId?: string;
  locationCode?: string;
  originCountry?: string;
  originTimeZone?: string;
  destinationCountry?: string;
  serviceLevel: string;
  shippingAmount: number;
  shippingAmountExact: MoneyExact;
  deliveryEstimate?: {
    minDays: number;
    maxDays: number;
  };
  deliveryPromise?: DeliveryPromiseExact;
  provenance?: {
    source?: string;
    configVersionId?: string;
    ruleId?: string;
    timestamp?: string;
  };
  items: QuoteShipmentGroupItem[];
}

export interface CheckoutQuoteRequest {
  items: QuoteItemInput[];
  shippingAddress: QuoteAddressInput;
  currency?: string;
  couponCode?: string;
  shippingServiceLevel?: string;
  shippingAdapter?: string;
}

export interface QuoteShippingOption {
  serviceLevel: string;
  displayName?: string;
  amount: number;
  amountExact: MoneyExact;
  deliveryEstimate?: {
    minDays: number;
    maxDays: number;
  };
  deliveryPromise?: DeliveryPromiseExact;
}

export interface QuoteSelectedShipping {
  serviceLevel: string;
  displayName?: string;
  zoneId?: string;
  zoneName?: string;
  amount: number;
  amountExact: MoneyExact;
  freeShippingApplied: boolean;
  isRemote?: boolean;
  deliveryEstimate?: {
    minDays: number;
    maxDays: number;
  };
  deliveryPromise?: DeliveryPromiseExact;
  provenance?: {
    source?: string;
    configVersionId?: string;
    ruleId?: string;
    timestamp?: string;
  };
}

export interface QuoteTaxesAndDuties {
  taxType: string;
  taxRatePercent: number;
  taxAmount: number;
  taxAmountExact: MoneyExact;
  dutyRatePercent: number;
  dutyAmount: number;
  dutyAmountExact: MoneyExact;
  incoterm: 'DOMESTIC' | 'DAP' | 'DDP' | 'CIF' | 'FOB' | 'EXW' | string;
  provenance: string;
}

export interface QuoteTotals {
  subtotal: number;
  subtotalExact: MoneyExact;
  discount: number;
  discountExact: MoneyExact;
  shipping: number;
  shippingExact: MoneyExact;
  tax: number;
  taxExact: MoneyExact;
  duties: number;
  dutiesExact: MoneyExact;
  grandTotal: number;
  grandTotalExact: MoneyExact;
}

export interface EligiblePaymentMethod {
  code: string;
  displayName: string;
  paymentType: 'offline' | 'manual' | 'automated' | string;
  isPrepaid: boolean;
}

export interface AuthoritativeQuote {
  kid: string;
  quoteId: string;
  merchantScopeId: string;
  configVersionId: string;
  merchantCountry: string;
  fulfillmentOriginCountry: string;
  isDomestic: boolean;
  incoterm: string;
  destination: {
    fullName?: string;
    address: string;
    addressLine2?: string;
    city: string;
    province?: string;
    postalCode?: string;
    countryCode: string;
    country: string;
    phone?: string;
  };
  currency: string;
  items: Array<{
    productId: string;
    variantId?: string;
    name: string;
    quantity: number;
    unitPrice: number;
    unitPriceExact?: MoneyExact;
    lineTotal: number;
    lineTotalExact?: MoneyExact;
    weightGrams?: number;
  }>;
  itemsHash: string;
  coupon?: {
    code: string;
    type: string;
    value: number;
    discountAmount: number;
    discountAmountExact?: MoneyExact;
    freeShipping: boolean;
  } | null;
  shipping: {
    selectedOption: QuoteSelectedShipping;
    availableOptions: QuoteShippingOption[];
    deliveryPromise?: DeliveryPromiseExact;
    shipmentGroups?: QuoteShipmentGroup[];
  };
  taxesAndDuties: QuoteTaxesAndDuties;
  totals: QuoteTotals;
  eligiblePaymentMethods: EligiblePaymentMethod[];
  issuedAt: string;
  expiresAt: string;
  quoteToken: string;
}

export interface CheckoutQuoteResponse {
  success: boolean;
  data: {
    quote: AuthoritativeQuote;
  };
  meta?: {
    requestId?: string;
  };
}
