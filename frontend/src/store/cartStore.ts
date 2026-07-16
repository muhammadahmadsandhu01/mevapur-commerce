import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CartItem {
  id: string;
  _id?: string;
  price: number | string;  // ✅ Accept both string and number
  name: string;
  product?: string;
  image: string;
  quantity: number;
  stock?: number;
  variant?: string;
}

export interface WishlistItem {
  id: string;
  name: string;
  price: number | string;  // ✅ Accept both string and number
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
  removeFromCart: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
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

      removeFromCart: (id: string) => {
        const newItems = get().items.filter(item => item.id !== id);
        set({
          items: newItems,
          totalItems: newItems.reduce((sum, i) => sum + i.quantity, 0)
        });
      },

      updateQuantity: (id: string, quantity: number) => {
        if (quantity <= 0) {
          get().removeFromCart(id);
          return;
        }
        
        const newItems = get().items.map(item => 
          item.id === id ? { ...item, quantity } : item
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
          // ✅ Convert price to number before calculation
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
        
        console.log('✅ Order placed:', orderId);
        return orderId;
      },

      addToWishlist: (item: WishlistItem) => {
        const state = get();
        const exists = state.wishlist.find(i => i.id === item.id);
        
        if (!exists) {
          set({ wishlist: [...state.wishlist, item] });
          console.log('❤️ Added to wishlist:', item.name);
        }
      },

      removeFromWishlist: (id: string) => {
        set({
          wishlist: get().wishlist.filter(item => item.id !== id)
        });
        console.log('❌ Removed from wishlist');
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
            price: Number(item.price),  // ✅ Convert to number
            image: item.image,
            variant: item.variant
          });
          
          set({
            wishlist: state.wishlist.filter(i => i.id !== id)
          });
          
          console.log('🛒 Moved to cart:', item.name);
        }
      }
    }),
    {
      name: 'mevapur-cart-storage',
    }
  )
);