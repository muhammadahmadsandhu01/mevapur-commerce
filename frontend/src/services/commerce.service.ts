import api from '@/lib/api';

export interface MarketConfig {
  homeCountry: string;
  sellingMode: 'domestic' | 'international' | 'hybrid';
  enabledCountries: string[];
  defaultCurrency: string;
  enabledCurrencies: string[];
  defaultLocale: string;
  isEnabled: boolean;
}

export interface ShippingQuote {
  eligible: boolean;
  currency: string;
  zone: { id: string; name: string };
  shippingAmount: number;
  freeShippingApplied: boolean;
  deliveryMinDays: number;
  deliveryMaxDays: number;
  remoteArea: boolean;
  reasonCode: string | null;
}

export const commerceService = {
  async getMarket(signal?: AbortSignal): Promise<MarketConfig> {
    const response = await api.get('/commerce/market', { signal });
    return response.data.data;
  },
  async quoteShipping(input: {
    country: string; currency: string; subtotal: number; city?: string; region?: string; postalCode?: string;
  }, signal?: AbortSignal): Promise<ShippingQuote> {
    const response = await api.get('/commerce/shipping/quote', { params: input, signal });
    return response.data.data;
  }
};
