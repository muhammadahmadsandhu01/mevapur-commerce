export interface User {
  id: string;
  fullName: string;
  email: string;
  role: 'super_admin' | 'admin' | 'manager' | 'staff';
  avatar?: string;
}

export interface Product {
  _id: string;
  name: string;
  description: string;
  price: number;
  originalPrice?: number;
  discount?: number;
  category: string;
  brand?: string;
  sku: string;
  stock: number;
  images: string[];
  isActive: boolean;
  createdAt: string;
}

export interface Order {
  _id: string;
  orderId: string;
  user: {
    fullName: string;
    email: string;
  };
  items: Array<{
    name: string;
    price: number;
    quantity: number;
    image: string;
  }>;
  shippingAddress: {
    fullName: string;
    phone: string;
    address: string;
    city: string;
    postalCode: string;
  };
  paymentMethod: string;
  orderStatus: 'Pending' | 'Processing' | 'Shipped' | 'Delivered' | 'Cancelled';
  paymentStatus: 'Pending' | 'Paid' | 'Failed';
  subtotal: number;
  shippingCost: number;
  discount: number;
  totalAmount: number;
  createdAt: string;
}

export interface DashboardStats {
  totalRevenue: number;
  todayRevenue: number;
  monthlyRevenue: number;
  totalOrders: number;
  pendingOrders: number;
  processingOrders: number;
  deliveredOrders: number;
  cancelledOrders: number;
  totalCustomers: number;
  newCustomers: number;
  totalProducts: number;
  lowStockProducts: number;
  outOfStockProducts: number;
}

export interface ChartData {
  name: string;
  value: number;
}