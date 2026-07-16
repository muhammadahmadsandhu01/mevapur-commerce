'use client';

import { useState, useEffect } from 'react';
import { X, Truck, Percent, Shield } from 'lucide-react';

export default function PromotionalBanner() {
  const [isVisible, setIsVisible] = useState(true);
  const [currentBanner, setCurrentBanner] = useState(0);

  const banners = [
    {
      icon: Truck,
      title: 'Free Shipping',
      subtitle: 'On orders over Rs. 1500',
      color: 'bg-teal-600'
    },
    {
      icon: Percent,
      title: 'Up to 50% Off',
      subtitle: 'On selected premium products',
      color: 'bg-amber-600'
    },
    {
      icon: Shield,
      title: 'Secure Payment',
      subtitle: '100% secure checkout',
      color: 'bg-blue-600'
    }
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentBanner((prev) => (prev + 1) % banners.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  if (!isVisible) return null;

  const CurrentBanner = banners[currentBanner];

  return (
    <div className={`${CurrentBanner.color} text-white py-3 px-4 relative overflow-hidden`}>
      <div className="max-w-7xl mx-auto flex items-center justify-center gap-4">
        <CurrentBanner.icon size={20} className="flex-shrink-0" />
        <div className="text-center">
          <p className="font-semibold text-sm">{CurrentBanner.title}</p>
          <p className="text-xs opacity-90">{CurrentBanner.subtitle}</p>
        </div>
        <button 
          onClick={() => setIsVisible(false)}
          className="absolute right-4 top-1/2 -translate-y-1/2 p-1 hover:bg-white/20 rounded-full transition-colors"
          aria-label="Close banner"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

