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

export type DeMinimisBasis = 'GOODS_VALUE' | 'CUSTOMS_VALUE' | 'CIF';

export type DeMinimisComparison =
  | 'LT'
  | 'LTE'
  | 'BELOW_OR_EQUAL_DEMINIMIS'
  | 'ABOVE_DEMINIMIS'
  | 'NOT_APPLICABLE';

export type DeMinimisReasonCode =
  | 'DE_MINIMIS_EXEMPT'
  | 'ABOVE_DE_MINIMIS_THRESHOLD'
  | 'NO_THRESHOLD_CONFIGURED';

export interface DeMinimisDecision {
  configured: boolean;
  thresholdExact?: MoneyExact | null;
  basisType?: DeMinimisBasis | null;
  basisAmountExact?: MoneyExact | null;
  comparison?: DeMinimisComparison | null;
  exempt: boolean;
  reasonCode?: DeMinimisReasonCode | null;
}

export function isDeMinimisBasis(value: unknown): value is DeMinimisBasis {
  return value === 'GOODS_VALUE' || value === 'CUSTOMS_VALUE' || value === 'CIF';
}

export interface TaxProvenance {
  ruleId?: string | null;
  priority?: number;
  taxType?: string | null;
  taxTreatment?: string | null;
  taxableBasis?: string | null;
  taxRateNumerator?: number;
  taxRateDenominator?: number;
  dutyRateNumerator?: number;
  dutyRateDenominator?: number;
  roundingMode?: string;
  roundingScope?: string;
  incoterm?: string | null;
  providerType?: string;
  sourceAuthority?: string | null;
  sourceReference?: string | null;
  verificationStatus?: string;
  dutyRefundPolicy?: 'REFUNDABLE' | 'NON_REFUNDABLE' | 'MANUAL_REVIEW' | null;
  taxRefundPolicy?: 'REFUNDABLE' | 'NON_REFUNDABLE' | 'PROPORTIONAL' | 'MANUAL_REVIEW' | null;
  customsValueIncludesShipping?: boolean;
  customsValueIncludesInsurance?: boolean;
  insuranceAmountExact?: MoneyExact | null;
  insuranceProvenance?: 'NO_INSURANCE_CHARGE' | 'EXPLICIT_INSURANCE_CHARGE' | string | null;
  calculatedAt?: string | null;
}

export interface QuoteTaxesAndDuties {
  taxType: string;
  taxTreatment?: string;
  taxableBasis?: string;
  taxRatePercent: number;
  taxAmount: number;
  taxAmountExact: MoneyExact;
  additionalTaxAmount?: number;
  additionalTaxAmountExact?: MoneyExact;
  taxIncludedAmount?: number;
  taxIncludedAmountExact?: MoneyExact;
  dutyRatePercent: number;
  dutyAmount: number;
  dutyAmountExact: MoneyExact;
  estimatedDutyAmount?: number;
  estimatedDutyExact?: MoneyExact;
  payableDutyAmount?: number;
  payableDutyExact?: MoneyExact;
  goodsValue?: number;
  goodsValueExact?: MoneyExact;
  customsValue?: number;
  customsValueExact?: MoneyExact;
  cifValue?: number;
  cifValueExact?: MoneyExact;
  customsValueIncludesShipping?: boolean;
  customsValueIncludesInsurance?: boolean;
  dutyDeMinimis?: DeMinimisDecision | null;
  taxDeMinimis?: DeMinimisDecision | null;
  incoterm: 'DOMESTIC' | 'DAP' | 'DDP' | 'CIF' | 'FOB' | 'EXW' | string;
  provenance?: string | TaxProvenance | null;
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
  additionalTax?: number;
  additionalTaxExact?: MoneyExact;
  taxIncluded?: number;
  taxIncludedExact?: MoneyExact;
  duties: number;
  dutiesExact: MoneyExact;
  estimatedDuties?: number;
  estimatedDutiesExact?: MoneyExact;
  landedCost?: number;
  landedCostExact?: MoneyExact;
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
  destinationPostalFingerprint?: string | null;
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

export type CheckoutSessionStatus =
  | 'active'
  | 'payment_pending'
  | 'payment_captured'
  | 'converting'
  | 'converted'
  | 'cancellation_requested'
  | 'cancelled'
  | 'expired'
  | 'failed'
  | 'conflict';

export interface CheckoutSessionMoney {
  amountMinor: string;
  currency: string;
  exponent: number;
  registrySnapshot: string;
}

export interface CheckoutSessionAmounts {
  subtotalExact: CheckoutSessionMoney;
  discountExact: CheckoutSessionMoney;
  shippingCostExact: CheckoutSessionMoney;
  taxAmountExact: CheckoutSessionMoney;
  additionalTaxAmountExact: CheckoutSessionMoney;
  taxIncludedAmountExact: CheckoutSessionMoney;
  dutiesExact: CheckoutSessionMoney;
  totalAmountExact: CheckoutSessionMoney;
}

export interface PublicCheckoutSession {
  sessionId: string;
  status: CheckoutSessionStatus;
  leaseExpiresAt?: string | null;
  amounts: CheckoutSessionAmounts;
  currency: string;
  destinationCountry: string;
  convertedOrderDisplayId?: string | null;
}

export interface PaymentAttempt {
  provider: string;
  clientSecret?: string;
  status: string;
}

export interface CreateCheckoutSessionRequest {
  quoteToken: string;
  paymentMethod: string;
  customerEmail: string;
  shippingAddress: QuoteAddressInput;
  customerNote?: string;
}

export interface CreateCheckoutSessionResponse {
  success: boolean;
  message?: string;
  data: {
    session: PublicCheckoutSession;
    paymentAttempt?: PaymentAttempt;
    idempotentReplay?: boolean;
  };
  meta?: {
    requestId?: string;
  };
}

export interface GetCheckoutSessionResponse {
  success: boolean;
  message?: string;
  data: {
    session: PublicCheckoutSession;
    paymentAttempt?: PaymentAttempt;
  };
  meta?: {
    requestId?: string;
  };
}

export interface CancelCheckoutSessionRequest {
  reason?: string;
}

export interface CancelCheckoutSessionResponse {
  success: boolean;
  message?: string;
  data: {
    session: PublicCheckoutSession;
  };
  meta?: {
    requestId?: string;
  };
}

export interface CheckoutAttemptRecord {
  schemaVersion: 1;
  baseFingerprint: string;
  generation: number;
  idempotencyKey: string;
  sessionId?: string;
  leaseExpiresAt?: string;
  status: 'creating' | CheckoutSessionStatus;
  paymentSubmittedAt?: string | null;
  createdAt: number;
  updatedAt: number;
  recoveryExpiresAt: number;
}
