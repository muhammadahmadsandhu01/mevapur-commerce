'use client';

import Link from 'next/link';

export default function Hero() {
  return (
    <div className="relative">
      {/* Hero Banner */}
      <div className="bg-gradient-to-r from-[#232f3e] via-[#37475a] to-[#232f3e]">
        <div className="max-w-7xl mx-auto px-4 py-12 md:py-20">
          <div className="text-center">
            <h1 className="text-3xl md:text-5xl font-bold text-white mb-4">
              Fresh Groceries Delivered
            </h1>
            <p className="text-xl text-gray-300 mb-8">
              To your doorstep in minutes
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link href="/category/fresh" className="bg-[#febd69] hover:bg-[#f3a847] text-gray-900 font-bold py-3 px-8 rounded-lg transition-colors">
                Shop Fresh
              </Link>
              <Link href="/deals" className="bg-white hover:bg-gray-100 text-gray-900 font-bold py-3 px-8 rounded-lg transition-colors">
                Today's Deals
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="bg-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-[#B12704]">1000+</p>
              <p className="text-sm text-gray-600">Products</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-[#B12704">5000+</p>
              <p className="text-sm text-gray-600">Happy Customers</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-[#B12704">30 Min</p>
              <p className="text-sm text-gray-600">Delivery</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-[#B12704">24/7</p>
              <p className="text-sm text-gray-600">Support</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}