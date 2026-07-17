import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CartItem {
  id: string;
  _id?: string;
  price: number | string;
  name: string;
  product?: string;
  image: string;
  quantity: number;
  stock?: number;
  variant?: string;
  sku?: string;
}

export interface WishlistItem {
  id: string;
  name: string;
  price: number | string;
  image: string;
  variant?: string;
}

interface CartStore {
  items: CartItem[];
  wishlist: WishlistItem[];
  orders: any[];
  currentOrderId: string | null;
  totalItems: number;
  addToCart: (item: Omit<CartItem, 'quantity'>) => void;
  removeFromCart: (id: string, variant?: string) => void;
  updateQuantity: (id: string, quantity: number, variant?: string) => void;
  clearCart: () => void;
  totalPrice: () => number;
  placeOrder: (city: string) => string;
  addToWishlist: (item: WishlistItem) => void;
  removeFromWishlist: (id: string) => void;
  isInWishlist: (id: string) => boolean;
  moveWishlistToCart: (id: string) => void;
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      wishlist: [],
      orders: [],
      currentOrderId: null,
      totalItems: 0,

      addToCart: (item) => {
        const state = get();
        const existingItem = state.items.find(
          i => i.id === item.id && i.variant === item.variant
        );
        
        if (existingItem) {
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
        
        const newItems = get().items.map(item => 
          (variant ? (item.id === id && item.variant === variant) : item.id === id)
            ? { ...item, quantity } 
            : item
        );
        
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

      placeOrder: (city: string) => {
        const state = get();
        if (state.items.length === 0) return '';
        
        const orderId = `MP-${Date.now()}`;
        const newOrder = {
          orderId,
          items: [...state.items],
          total: state.totalPrice(),
          status: 'pending',
          city,
          createdAt: new Date().toISOString()
        };
        
        set({
          orders: [...state.orders, newOrder],
          currentOrderId: orderId,
          items: [],
          totalItems: 0
        });
        
        return orderId;
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
            name: item.name,
            price: Number(item.price),
            image: item.image,
            variant: item.variant
          });
          set({
            wishlist: state.wishlist.filter(i => i.id !== id)
          });
        }
      }
    }),
    {
      name: 'mevapur-cart-storage',
    }
  )
);