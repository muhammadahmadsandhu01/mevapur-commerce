'use client';

import Link from 'next/link';
import { ChevronUp } from 'lucide-react';

export default function Footer() {
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <footer className="mt-auto">
      {/* Back to Top */}
      <button 
        onClick={scrollToTop}
        className="w-full bg-[#37475a] hover:bg-[#485769] text-white py-4 text-sm font-medium transition-colors"
      >
        Back to top
      </button>

      {/* Footer Links */}
      <div className="bg-[#232f3e] text-white py-12">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div>
              <h4 className="font-bold mb-4">Get to Know Us</h4>
              <ul className="space-y-2 text-sm text-gray-300">
                <li><Link href="/about" className="hover:underline">About MevaPur</Link></li>
                <li><Link href="/careers" className="hover:underline">Careers</Link></li>
                <li><Link href="/press" className="hover:underline">Press Releases</Link></li>
                <li><Link href="/sustainability" className="hover:underline">Sustainability</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-4">Make Money with Us</h4>
              <ul className="space-y-2 text-sm text-gray-300">
                <li><Link href="/sell" className="hover:underline">Sell on MevaPur</Link></li>
                <li><Link href="/affiliate" className="hover:underline">Become an Affiliate</Link></li>
                <li><Link href="/advertise" className="hover:underline">Advertise Your Products</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-4">Payment Products</h4>
              <ul className="space-y-2 text-sm text-gray-300">
                <li><Link href="/business-card" className="hover:underline">Business Card</Link></li>
                <li><Link href="/shop-card" className="hover:underline">Shop Card</Link></li>
                <li><Link href="/rewards" className="hover:underline">Rewards</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-4">Let Us Help You</h4>
              <ul className="space-y-2 text-sm text-gray-300">
                <li><Link href="/account" className="hover:underline">Your Account</Link></li>
                <li><Link href="/returns" className="hover:underline">Returns Centre</Link></li>
                <li><Link href="/help" className="hover:underline">Help</Link></li>
                <li><Link href="/contact" className="hover:underline">Contact Us</Link></li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Footer */}
      <div className="bg-[#131921] text-white py-8">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <div className="flex items-center justify-center space-x-2 mb-4">
            <span className="text-2xl font-bold">MevaPur</span>
          </div>
          <p className="text-sm text-gray-400">
            © 1996-2026, MevaPur.com, Inc. or its affiliates
          </p>
        </div>
      </div>
    </footer>
  );
}