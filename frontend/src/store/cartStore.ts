import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { roundMoney } from '../lib/money.ts';

export const MAX_LINES = 50;
export const MAX_QUANTITY_PER_LINE = 20;

export interface CartItem {
  id: string; // Product ID
  _id?: string; // Compatibility alias
  productId?: string; // Canonical product ID
  variantId?: string; // Stable backend variant ID
  name: string;
  price: number;
  image: string;
  quantity: number;
  stock?: number | null;
  sku?: string;
  variant?: string; // Display label
  slug?: string;
  isUnavailable?: boolean;
  priceChanged?: boolean;
  oldPrice?: number;
  stockReduced?: boolean;
  oldStock?: number;
}

export interface WishlistItem {
  _id: string;
  id: string;
  name: string;
  price: number;
  image: string;
  variant?: string;
  variantId?: string;
  slug?: string;
  stock?: number | null;
  sku?: string;
}

export function getCartLineKey(productId: string, variantId?: string): string {
  const pId = String(productId || '').trim();
  const vId = variantId ? String(variantId).trim() : 'default';
  return `${pId}:${vId}`;
}

interface CartStore {
  items: CartItem[];
  wishlist: WishlistItem[];
  totalItems: number;
  addToCart: (item: Omit<CartItem, 'quantity'>, quantity?: number) => void;
  removeFromCart: (productId: string, variantId?: string) => void;
  updateQuantity: (productId: string, quantity: number, variantId?: string) => void;
  clearCart: () => void;
  totalPrice: () => number;
  reconcileItems: (updatedItems: CartItem[]) => void;
  addToWishlist: (item: WishlistItem) => void;
  removeFromWishlist: (id: string) => void;
  isInWishlist: (id: string) => boolean;
  moveWishlistToCart: (id: string) => void;
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => {
      const matchesLine = (
        item: CartItem,
        productId: string,
        variantId?: string
      ) => {
        const itemPId = item.productId || item.id || item._id;
        const targetPId = productId;
        const itemVId = item.variantId || undefined;
        const targetVId = variantId || undefined;
        return itemPId === targetPId && itemVId === targetVId;
      };

      const calculateTotalItems = (items: CartItem[]) => {
        return items.reduce((sum, item) => sum + Math.max(0, Math.floor(item.quantity || 0)), 0);
      };

      const sanitizeItem = (raw: Partial<CartItem>): CartItem | null => {
        const pId = String(raw.productId || raw.id || raw._id || '').trim();
        if (!pId) return null;

        const quantity = Math.min(
          MAX_QUANTITY_PER_LINE,
          Math.max(1, Math.floor(Number(raw.quantity) || 1))
        );
        const price = roundMoney(raw.price ?? 0);
        const name = String(raw.name || 'Product').slice(0, 200).trim();
        const image = typeof raw.image === 'string' ? raw.image : '/placeholder.png';
        const stock = typeof raw.stock === 'number' && Number.isFinite(raw.stock) ? Math.max(0, Math.floor(raw.stock)) : null;

        return {
          id: pId,
          _id: pId,
          productId: pId,
          variantId: raw.variantId ? String(raw.variantId).trim() : undefined,
          name,
          price,
          image,
          quantity,
          stock,
          sku: raw.sku ? String(raw.sku).trim() : undefined,
          variant: raw.variant ? String(raw.variant).trim() : undefined,
          slug: raw.slug ? String(raw.slug).trim() : undefined,
          isUnavailable: Boolean(raw.isUnavailable),
          priceChanged: Boolean(raw.priceChanged),
          oldPrice: raw.oldPrice !== undefined ? roundMoney(raw.oldPrice) : undefined,
          stockReduced: Boolean(raw.stockReduced),
          oldStock: raw.oldStock !== undefined ? Number(raw.oldStock) : undefined,
        };
      };

      const store: CartStore = {
        items: [],
        wishlist: [],
        totalItems: 0,

        addToCart: (itemData, addQty = 1) => {
          const state = get();
          const cleanItem = sanitizeItem(itemData);
          if (!cleanItem) return;

          const pId = cleanItem.productId!;
          const vId = cleanItem.variantId;
          const targetQty = Math.max(1, Math.min(MAX_QUANTITY_PER_LINE, Math.floor(addQty)));

          // Check if product line already exists
          const existingIndex = state.items.findIndex((i) => matchesLine(i, pId, vId));

          let newItems: CartItem[];
          if (existingIndex >= 0) {
            const existing = state.items[existingIndex];
            const maxAllowed = typeof cleanItem.stock === 'number'
              ? Math.min(MAX_QUANTITY_PER_LINE, cleanItem.stock)
              : MAX_QUANTITY_PER_LINE;

            const nextQty = Math.min(maxAllowed, existing.quantity + targetQty);

            newItems = state.items.map((it, idx) =>
              idx === existingIndex
                ? {
                    ...it,
                    quantity: nextQty,
                    price: cleanItem.price,
                    stock: cleanItem.stock,
                    image: cleanItem.image,
                    isUnavailable: false,
                  }
                : it
            );
          } else {
            if (state.items.length >= MAX_LINES) {
              return; // Exceeded maximum line capacity
            }

            cleanItem.quantity = typeof cleanItem.stock === 'number'
              ? Math.min(targetQty, cleanItem.stock)
              : targetQty;

            newItems = [...state.items, cleanItem];
          }

          set({
            items: newItems,
            totalItems: calculateTotalItems(newItems),
          });
        },

        removeFromCart: (productId: string, variantId?: string) => {
          const state = get();
          const newItems = state.items.filter((item) => !matchesLine(item, productId, variantId));
          set({
            items: newItems,
            totalItems: calculateTotalItems(newItems),
          });
        },

        updateQuantity: (productId: string, quantity: number, variantId?: string) => {
          const state = get();
          const targetQty = Math.floor(quantity);

          if (targetQty <= 0) {
            store.removeFromCart(productId, variantId);
            return;
          }

          const newItems = state.items.map((item) => {
            if (matchesLine(item, productId, variantId)) {
              const maxStock = typeof item.stock === 'number' ? item.stock : MAX_QUANTITY_PER_LINE;
              const boundedQty = Math.min(MAX_QUANTITY_PER_LINE, Math.min(maxStock, targetQty));
              return {
                ...item,
                quantity: Math.max(1, boundedQty),
              };
            }
            return item;
          });

          set({
            items: newItems,
            totalItems: calculateTotalItems(newItems),
          });
        },

        clearCart: () => {
          set({ items: [], totalItems: 0 });
        },

        totalPrice: () => {
          return get().items.reduce((total, item) => {
            return roundMoney(total + item.price * item.quantity);
          }, 0);
        },

        reconcileItems: (updatedItems: CartItem[]) => {
          const clean = updatedItems.map(sanitizeItem).filter(Boolean) as CartItem[];
          set({
            items: clean,
            totalItems: calculateTotalItems(clean),
          });
        },

        addToWishlist: (item: WishlistItem) => {
          const state = get();
          const exists = state.wishlist.some(
            (i) => i.id === item.id && (i.variantId || undefined) === (item.variantId || undefined)
          );
          if (!exists) {
            set({ wishlist: [...state.wishlist, item] });
          }
        },

        removeFromWishlist: (id: string) => {
          set({
            wishlist: get().wishlist.filter((item) => item.id !== id),
          });
        },

        isInWishlist: (id: string) => {
          return get().wishlist.some((item) => item.id === id);
        },

        moveWishlistToCart: (id: string) => {
          const state = get();
          const item = state.wishlist.find((i) => i.id === id);
          if (item) {
            store.addToCart({
              id: item.id,
              productId: item.id,
              name: item.name,
              price: item.price,
              image: item.image,
              variant: item.variant,
              variantId: item.variantId,
              stock: item.stock,
              sku: item.sku,
            });
            set({
              wishlist: state.wishlist.filter((i) => i.id !== id),
            });
          }
        },
      };

      return store;
    },
    {
      name: 'mevapur-cart-storage',
      version: 2,
      migrate: (persistedState: unknown, version: number) => {
        if (version < 2 && persistedState && typeof persistedState === 'object') {
          const oldState = persistedState as { items?: CartItem[]; wishlist?: WishlistItem[] };
          const migratedItems = Array.isArray(oldState.items)
            ? oldState.items
                .filter((item) => item && (item.id || item._id))
                .slice(0, MAX_LINES)
                .map((item) => ({
                  ...item,
                  id: String(item.id || item._id),
                  productId: String(item.id || item._id),
                  quantity: Math.min(MAX_QUANTITY_PER_LINE, Math.max(1, Math.floor(Number(item.quantity) || 1))),
                  price: roundMoney(item.price ?? 0),
                }))
            : [];

          return {
            items: migratedItems,
            wishlist: Array.isArray(oldState.wishlist) ? oldState.wishlist : [],
            totalItems: migratedItems.reduce((sum, i) => sum + i.quantity, 0),
          };
        }
        return persistedState as CartStore;
      },
    }
  )
);
