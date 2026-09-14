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

export interface CheckoutQuoteRequest {
  items: QuoteItemInput[];
  shippingAddress: QuoteAddressInput;
  currency?: string;
  couponCode?: string;
  shippingServiceLevel?: 'standard' | 'express';
  shippingAdapter?: string;
}

export interface QuoteShippingOption {
  serviceLevel: 'standard' | 'express';
  amount: number;
  amountExact: MoneyExact;
  deliveryEstimate?: {
    minDays: number;
    maxDays: number;
  };
}

export interface QuoteSelectedShipping {
  serviceLevel: 'standard' | 'express';
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
}

export interface QuoteTaxesAndDuties {
  taxType: string;
  taxRatePercent: number;
  taxAmount: number;
  taxAmountExact: MoneyExact;
  dutyRatePercent: number;
  dutyAmount: number;
  dutyAmountExact: MoneyExact;
  incoterm: 'DOMESTIC' | 'DAP' | 'DDP' | 'CIF' | 'FOB' | 'EXW';
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
  paymentType: 'offline' | 'manual' | 'automated';
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
