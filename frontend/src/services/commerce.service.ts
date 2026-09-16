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

export const commerceService = {
  async getMarket(signal?: AbortSignal): Promise<MarketConfig> {
    const response = await api.get('/commerce/market', { signal });
    return response.data.data;
  },
};
