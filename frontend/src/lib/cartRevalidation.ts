/**
 * Authoritative Cart Revalidation Service
 * Validates active products, stable variants, prices, and stock against backend catalog.
 */

import { getProduct } from './api.ts';
import type { CartItem } from '../store/cartStore.ts';
import { roundMoney } from './money.ts';

export interface RevalidationSummary {
  hasChanges: boolean;
  hasPriceChanges: boolean;
  hasStockReductions: boolean;
  hasUnavailableItems: boolean;
  messages: string[];
}

export interface RevalidationResult {
  items: CartItem[];
  summary: RevalidationSummary;
}

/**
 * Revalidates an array of cart items against authoritative public product data.
 */
export async function revalidateCart(
  items: CartItem[],
  signal?: AbortSignal
): Promise<RevalidationResult> {
  if (!items || items.length === 0) {
    return {
      items: [],
      summary: {
        hasChanges: false,
        hasPriceChanges: false,
        hasStockReductions: false,
        hasUnavailableItems: false,
        messages: [],
      },
    };
  }

  const messages: string[] = [];
  let hasPriceChanges = false;
  let hasStockReductions = false;
  let hasUnavailableItems = false;

  const productIds = Array.from(new Set(items.map((i) => i.productId || i.id)));

  // Fetch all unique products in parallel
  const productResults = await Promise.allSettled(
    productIds.map((id) => getProduct(id, signal))
  );

  const productMap = new Map<string, unknown>();
  productIds.forEach((id, idx) => {
    const res = productResults[idx];
    if (res.status === 'fulfilled' && res.value) {
      productMap.set(id, res.value);
    }
  });

  const revalidatedItems: CartItem[] = items.map((item) => {
    const pId = item.productId || item.id;
    const rawProd = productMap.get(pId) as {
      _id: string;
      name: string;
      price: number;
      stock: number;
      status: string;
      isActive: boolean;
      variants?: Array<{ _id: string; price: number; stock: number; sku?: string; attributes?: Array<{ name: string; value: string }> }>;
    } | undefined;

    // Check if product is deleted, inactive, or not published
    if (!rawProd || !rawProd.isActive || rawProd.status !== 'published') {
      hasUnavailableItems = true;
      messages.push(`"${item.name}" is no longer available.`);
      return {
        ...item,
        isUnavailable: true,
        stock: 0,
      };
    }

    // If item has variant, resolve variant
    if (item.variantId) {
      const variant = rawProd.variants?.find((v) => String(v._id) === String(item.variantId));
      if (!variant) {
        hasUnavailableItems = true;
        messages.push(`Selected option for "${item.name}" is no longer offered.`);
        return {
          ...item,
          isUnavailable: true,
          stock: 0,
        };
      }

      const authoritativePrice = roundMoney(variant.price);
      const authoritativeStock = Math.max(0, Math.floor(variant.stock ?? 0));
      let currentQty = item.quantity;
      let priceChanged = false;
      let stockReduced = false;

      if (authoritativePrice !== item.price) {
        priceChanged = true;
        hasPriceChanges = true;
        messages.push(`Price for "${item.name}" updated from PKR ${item.price.toLocaleString()} to PKR ${authoritativePrice.toLocaleString()}.`);
      }

      if (authoritativeStock <= 0) {
        hasUnavailableItems = true;
        messages.push(`"${item.name}" is currently out of stock.`);
      } else if (currentQty > authoritativeStock) {
        stockReduced = true;
        hasStockReductions = true;
        messages.push(`Quantity for "${item.name}" adjusted to available stock (${authoritativeStock}).`);
        currentQty = authoritativeStock;
      }

      return {
        ...item,
        name: rawProd.name,
        price: authoritativePrice,
        stock: authoritativeStock,
        quantity: currentQty,
        isUnavailable: authoritativeStock <= 0,
        priceChanged,
        oldPrice: priceChanged ? item.price : item.oldPrice,
        stockReduced,
        oldStock: stockReduced ? item.stock ?? undefined : item.oldStock,
      };
    }

    // Simple product without variant
    const authoritativePrice = roundMoney(rawProd.price);
    const authoritativeStock = Math.max(0, Math.floor(rawProd.stock ?? 0));
    let currentQty = item.quantity;
    let priceChanged = false;
    let stockReduced = false;

    if (authoritativePrice !== item.price) {
      priceChanged = true;
      hasPriceChanges = true;
      messages.push(`Price for "${item.name}" updated from PKR ${item.price.toLocaleString()} to PKR ${authoritativePrice.toLocaleString()}.`);
    }

    if (authoritativeStock <= 0) {
      hasUnavailableItems = true;
      messages.push(`"${item.name}" is currently out of stock.`);
    } else if (currentQty > authoritativeStock) {
      stockReduced = true;
      hasStockReductions = true;
      messages.push(`Quantity for "${item.name}" adjusted to available stock (${authoritativeStock}).`);
      currentQty = authoritativeStock;
    }

    return {
      ...item,
      name: rawProd.name,
      price: authoritativePrice,
      stock: authoritativeStock,
      quantity: currentQty,
      isUnavailable: authoritativeStock <= 0,
      priceChanged,
      oldPrice: priceChanged ? item.price : item.oldPrice,
      stockReduced,
      oldStock: stockReduced ? item.stock ?? undefined : item.oldStock,
    };
  });

  const hasChanges = hasPriceChanges || hasStockReductions || hasUnavailableItems;

  return {
    items: revalidatedItems,
    summary: {
      hasChanges,
      hasPriceChanges,
      hasStockReductions,
      hasUnavailableItems,
      messages,
    },
  };
}
