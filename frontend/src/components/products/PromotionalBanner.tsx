'use client';

import { useState, useEffect } from 'react';
import { X, Truck, Percent, Shield } from 'lucide-react';

const BANNERS = [
  {
    icon: Truck,
    title: 'Free Shipping Available',
    subtitle: 'Calculated and confirmed in checkout',
    color: 'bg-[#0b132b]',
  },
  {
    icon: Percent,
    title: 'Promotional Savings',
    subtitle: 'Transparent pricing across active catalogue',
    color: 'bg-[#9a3412]',
  },
  {
    icon: Shield,
    title: 'Secure Checkout',
    subtitle: 'Encrypted and customer verified',
    color: 'bg-[#1e3a8a]',
  },
];

export default function PromotionalBanner() {
  const [isVisible, setIsVisible] = useState(true);
  const [currentBanner, setCurrentBanner] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentBanner((prev) => (prev + 1) % BANNERS.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  if (!isVisible) return null;

  const CurrentBanner = BANNERS[currentBanner];

  return (
    <div className={`${CurrentBanner.color} text-white py-2.5 px-4 relative overflow-hidden`}>
      <div className="max-w-7xl mx-auto flex items-center justify-center gap-3">
        <CurrentBanner.icon size={18} className="shrink-0 text-white" />
        <div className="text-center flex flex-wrap items-center justify-center gap-2">
          <p className="font-bold text-xs sm:text-sm text-white">{CurrentBanner.title}</p>
          <span className="hidden sm:inline text-white">•</span>
          <p className="text-xs text-white font-medium">{CurrentBanner.subtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => setIsVisible(false)}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-white/20 rounded-full transition text-white"
          aria-label="Close announcement banner"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
