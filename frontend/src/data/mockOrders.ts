export interface OrderItem {
  id: number;
  name: string;
  image: string;
  variant: string;
  sku: string;
  price: number;
  quantity: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  orderDate: string;
  estimatedDelivery: string;
  totalAmount: number;
  productCount: number;
  paymentMethod: 'COD' | 'JazzCash' | 'Visa' | 'MasterCard';
  paymentStatus: 'pending' | 'paid' | 'cod-pending' | 'refunded' | 'failed';
  orderStatus: 'pending' | 'confirmed' | 'processing' | 'packed' | 'shipped' | 'out-for-delivery' | 'delivered' | 'cancelled' | 'returned' | 'refunded';
  shippingAddress: {
    name: string;
    phone: string;
    address: string;
    city: string;
    province: string;
    postalCode: string;
  };
  trackingNumber?: string;
  courier?: string;
  items: OrderItem[];
  timeline: {
    status: string;
    date: string;
    completed: boolean;
  }[];
  subtotal: number;
  shipping: number;
  discount: number;
  tax: number;
}

export const mockOrders: Order[] = [
  {
    id: '1',
    orderNumber: 'MP-20260105-1234',
    orderDate: '2026-01-05',
    estimatedDelivery: '2026-01-10',
    totalAmount: 2450,
    productCount: 3,
    paymentMethod: 'COD',
    paymentStatus: 'cod-pending',
    orderStatus: 'shipped',
    shippingAddress: {
      name: 'Ahmed Khan',
      phone: '03001234567',
      address: 'House #123, Street 45, Gulberg III',
      city: 'Lahore',
      province: 'Punjab',
      postalCode: '54000'
    },
    trackingNumber: 'TRK123456789PK',
    courier: 'TCS',
    items: [
      { id: 1, name: 'Premium Almonds 1kg', image: 'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?w=200', variant: '1kg Pack', sku: 'ALM-001', price: 1200, quantity: 1 },
      { id: 2, name: 'Organic Walnuts 500g', image: 'https://images.unsplash.com/photo-1599599810769-bcde5a160d32?w=200', variant: '500g Pack', sku: 'WAL-002', price: 800, quantity: 1 },
      { id: 3, name: 'Premium Honey 250g', image: 'https://images.unsplash.com/photo-1587049352846-4a222e773a0e?w=200', variant: '250g Jar', sku: 'HON-003', price: 450, quantity: 1 }
    ],
    timeline: [
      { status: 'Order Placed', date: '2026-01-05 10:30 AM', completed: true },
      { status: 'Confirmed', date: '2026-01-05 11:00 AM', completed: true },
      { status: 'Processing', date: '2026-01-06 09:00 AM', completed: true },
      { status: 'Packed', date: '2026-01-06 02:00 PM', completed: true },
      { status: 'Shipped', date: '2026-01-07 10:00 AM', completed: true },
      { status: 'Out For Delivery', date: '', completed: false },
      { status: 'Delivered', date: '', completed: false }
    ],
    subtotal: 2450,
    shipping: 0,
    discount: 0,
    tax: 0
  },
  {
    id: '2',
    orderNumber: 'MP-20260103-5678',
    orderDate: '2026-01-03',
    estimatedDelivery: '2026-01-08',
    totalAmount: 1850,
    productCount: 2,
    paymentMethod: 'JazzCash',
    paymentStatus: 'paid',
    orderStatus: 'delivered',
    shippingAddress: {
      name: 'Ahmed Khan',
      phone: '03001234567',
      address: 'House #123, Street 45, Gulberg III',
      city: 'Lahore',
      province: 'Punjab',
      postalCode: '54000'
    },
    trackingNumber: 'TRK987654321PK',
    courier: 'Leopard',
    items: [
      { id: 4, name: 'Organic Dates 1kg', image: 'https://images.unsplash.com/photo-1601379766822-1c8b2879074f?w=200', variant: '1kg Pack', sku: 'DAT-004', price: 1200, quantity: 1 },
      { id: 5, name: 'Premium Raisins 500g', image: 'https://images.unsplash.com/photo-1606923829579-0cb981a86e0f?w=200', variant: '500g Pack', sku: 'RAI-005', price: 650, quantity: 1 }
    ],
    timeline: [
      { status: 'Order Placed', date: '2026-01-03 02:15 PM', completed: true },
      { status: 'Confirmed', date: '2026-01-03 03:00 PM', completed: true },
      { status: 'Processing', date: '2026-01-04 10:00 AM', completed: true },
      { status: 'Packed', date: '2026-01-04 04:00 PM', completed: true },
      { status: 'Shipped', date: '2026-01-05 09:00 AM', completed: true },
      { status: 'Out For Delivery', date: '2026-01-07 08:00 AM', completed: true },
      { status: 'Delivered', date: '2026-01-07 03:30 PM', completed: true }
    ],
    subtotal: 1850,
    shipping: 0,
    discount: 150,
    tax: 0
  },
  {
    id: '3',
    orderNumber: 'MP-20260107-9012',
    orderDate: '2026-01-07',
    estimatedDelivery: '2026-01-12',
    totalAmount: 3200,
    productCount: 4,
    paymentMethod: 'Visa',
    paymentStatus: 'paid',
    orderStatus: 'processing',
    shippingAddress: {
      name: 'Ahmed Khan',
      phone: '03001234567',
      address: 'House #123, Street 45, Gulberg III',
      city: 'Lahore',
      province: 'Punjab',
      postalCode: '54000'
    },
    items: [
      { id: 6, name: 'Premium Cashews 1kg', image: 'https://images.unsplash.com/photo-1604068510131-6953e08ee560?w=200', variant: '1kg Pack', sku: 'CAS-006', price: 1800, quantity: 1 },
      { id: 7, name: 'Pistachios 500g', image: 'https://images.unsplash.com/photo-1525700231801-a35a4661f687?w=200', variant: '500g Pack', sku: 'PIS-007', price: 1400, quantity: 1 }
    ],
    timeline: [
      { status: 'Order Placed', date: '2026-01-07 11:45 AM', completed: true },
      { status: 'Confirmed', date: '2026-01-07 12:30 PM', completed: true },
      { status: 'Processing', date: '2026-01-07 02:00 PM', completed: true },
      { status: 'Packed', date: '', completed: false },
      { status: 'Shipped', date: '', completed: false },
      { status: 'Out For Delivery', date: '', completed: false },
      { status: 'Delivered', date: '', completed: false }
    ],
    subtotal: 3200,
    shipping: 0,
    discount: 200,
    tax: 0
  },
  {
    id: '4',
    orderNumber: 'MP-20260106-3456',
    orderDate: '2026-01-06',
    estimatedDelivery: '2026-01-11',
    totalAmount: 950,
    productCount: 1,
    paymentMethod: 'COD',
    paymentStatus: 'cod-pending',
    orderStatus: 'pending',
    shippingAddress: {
      name: 'Ahmed Khan',
      phone: '03001234567',
      address: 'House #123, Street 45, Gulberg III',
      city: 'Lahore',
      province: 'Punjab',
      postalCode: '54000'
    },
    items: [
      { id: 8, name: 'Organic Spices Mix', image: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=200', variant: '250g Pack', sku: 'SPI-008', price: 950, quantity: 1 }
    ],
    timeline: [
      { status: 'Order Placed', date: '2026-01-06 05:20 PM', completed: true },
      { status: 'Confirmed', date: '', completed: false },
      { status: 'Processing', date: '', completed: false },
      { status: 'Packed', date: '', completed: false },
      { status: 'Shipped', date: '', completed: false },
      { status: 'Out For Delivery', date: '', completed: false },
      { status: 'Delivered', date: '', completed: false }
    ],
    subtotal: 950,
    shipping: 0,
    discount: 0,
    tax: 0
  },
  {
    id: '5',
    orderNumber: 'MP-20260102-7890',
    orderDate: '2026-01-02',
    estimatedDelivery: '2026-01-07',
    totalAmount: 1500,
    productCount: 2,
    paymentMethod: 'MasterCard',
    paymentStatus: 'refunded',
    orderStatus: 'cancelled',
    shippingAddress: {
      name: 'Ahmed Khan',
      phone: '03001234567',
      address: 'House #123, Street 45, Gulberg III',
      city: 'Lahore',
      province: 'Punjab',
      postalCode: '54000'
    },
    items: [
      { id: 9, name: 'Premium Tea 200g', image: 'https://images.unsplash.com/photo-1563911302283-d2bc129e7c1f?w=200', variant: '200g Pack', sku: 'TEA-009', price: 800, quantity: 1 },
      { id: 10, name: 'Coffee Beans 500g', image: 'https://images.unsplash.com/photo-1559525839-d9acfd02c6cb?w=200', variant: '500g Pack', sku: 'COF-010', price: 700, quantity: 1 }
    ],
    timeline: [
      { status: 'Order Placed', date: '2026-01-02 09:00 AM', completed: true },
      { status: 'Confirmed', date: '2026-01-02 10:00 AM', completed: true },
      { status: 'Cancelled', date: '2026-01-02 11:30 AM', completed: true },
      { status: 'Refunded', date: '2026-01-03 02:00 PM', completed: true }
    ],
    subtotal: 1500,
    shipping: 0,
    discount: 0,
    tax: 0
  }
];