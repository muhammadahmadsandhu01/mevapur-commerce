import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CartItem {
  id: string;
  _id?: string;
  price: number;
  name: string;
  product?: string;
  image: string;
  quantity: number;
  stock?: number | null;
  variant?: string;
  sku?: string;
}

export interface WishlistItem {
  _id: string;
  id: string;
  name: string;
  price: number;
  image: string;
  variant?: string;
  slug?: string;
  stock?: number | null;
  sku?: string;
}

interface CartStore {
  items: CartItem[];
  wishlist: WishlistItem[];
  totalItems: number;
  addToCart: (item: Omit<CartItem, 'quantity'>) => void;
  removeFromCart: (id: string, variant?: string) => void;
  updateQuantity: (id: string, quantity: number, variant?: string) => void;
  clearCart: () => void;
  totalPrice: () => number;
  addToWishlist: (item: WishlistItem) => void;
  removeFromWishlist: (id: string) => void;
  isInWishlist: (id: string) => boolean;
  moveWishlistToCart: (id: string) => void;
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => {
      const store: CartStore = {
        items: [],
        wishlist: [],
        totalItems: 0,

        addToCart: (item) => {
          const state = get();

          if (
            item.stock !== undefined && item.stock !== null && item.stock <= 0) {
            return;
          }
          const existingItem = state.items.find(
            i => i.id === item.id && i.variant === item.variant
          );
          
          if (existingItem) {
            if (
              existingItem.stock !== undefined && existingItem.stock !== null && existingItem.quantity >= existingItem.stock) {
              return;
            }
            const updatedItems = state.items.map(i => 
              i.id === item.id && i.variant === item.variant
                ? { ...i, quantity: i.quantity + 1 }
                : i
            );
            set({
              items: updatedItems,
              totalItems: updatedItems.reduce((sum, i) => sum + i.quantity, 0)
            });
          } else {
            const newItems = [...state.items, { ...item, quantity: 1 }];
            set({
              items: newItems,
              totalItems: newItems.reduce((sum, i) => sum + i.quantity, 0)
            });
          }
        },

        removeFromCart: (id: string, variant?: string) => {
          const newItems = get().items.filter(item => 
            variant ? !(item.id === id && item.variant === variant) : item.id !== id
          );
          set({
            items: newItems,
            totalItems: newItems.reduce((sum, i) => sum + i.quantity, 0)
          });
        },

        updateQuantity: (id: string, quantity: number, variant?: string) => {
          if (quantity <= 0) {
            get().removeFromCart(id, variant);
            return;
          }
          
          const newItems = get().items.map(item => {
            if (
              variant
                ? item.id === id && item.variant === variant
                : item.id === id
            ) {
              const maxQty =
                item.stock !== undefined && item.stock !== null
                  ? Math.min(quantity, item.stock)
                  : quantity;

              return {
                ...item,
                quantity: maxQty,
              };
            }

            return item;
          });
          
          set({
            items: newItems,
            totalItems: newItems.reduce((sum, i) => sum + i.quantity, 0)
          });
        },

        clearCart: () => {
          set({ items: [], totalItems: 0 });
        },

        totalPrice: () => {
          return get().items.reduce((total, item) => {
            return total + (Number(item.price) * item.quantity);
          }, 0);
        },

        addToWishlist: (item: WishlistItem) => {
          const state = get();
          const exists = state.wishlist.find(i => i.id === item.id && i.variant === item.variant);
          if (!exists) {
            set({ wishlist: [...state.wishlist, item] });
          }
        },

        removeFromWishlist: (id: string) => {
          set({
            wishlist: get().wishlist.filter(item => item.id !== id)
          });
        },

        isInWishlist: (id: string) => {
          return get().wishlist.some(item => item.id === id);
        },

        moveWishlistToCart: (id: string) => {
          const state = get();
          const item = state.wishlist.find(i => i.id === id);
          if (item) {
            get().addToCart({
              id: item.id,
              _id: item._id,
              name: item.name,
              price: Number(item.price) || 0,
              image: item.image,
              variant: item.variant,
              stock: item.stock,
              sku: item.sku
            });
            set({
              wishlist: state.wishlist.filter(i => i.id !== id)
            });
          }
        }
      };

      return store;
    },
    {
      name: 'mevapur-cart-storage',
    }
  )
);