'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import BrandLogo from '@/components/brand/BrandLogo';
import { branding, copyrightLine } from '@/config/branding';
import { getPublicSettings } from '@/services/content.service';
import { getSafeNavigationUrl } from '@/lib/navigation';
import type { PublicStoreSettings } from '@/types/content';

export default function Footer() {
  const [settings, setSettings] = useState<PublicStoreSettings | null>(null);

  useEffect(() => {
    let mounted = true;
    getPublicSettings()
      .then((data) => {
        if (mounted && data) setSettings(data);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const contactEmail = settings?.store?.store_email || branding.supportEmail;
  const contactPhone = settings?.store?.store_phone || branding.supportPhone;
  const storeAddress = settings?.store?.store_address;

  const emailNav = contactEmail ? getSafeNavigationUrl(`mailto:${contactEmail}`) : null;
  const phoneNav = contactPhone ? getSafeNavigationUrl(`tel:${contactPhone}`) : null;

  return (
    <footer className="mt-auto border-t border-slate-700 bg-[#0b132b] text-slate-200">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8">
        {/* Brand Column */}
        <div>
          <BrandLogo theme="light" href="/" height={30} />
          <p className="mt-4 max-w-xs text-sm leading-6 text-slate-300">
            {branding.shortDescription}
          </p>
          {storeAddress && (
            <p className="mt-2 text-xs text-slate-400">
              {storeAddress}
            </p>
          )}
        </div>

        {/* Shop Column */}
        <div>
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">Shop</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link href="/products" className="hover:text-white transition-colors">
                All products
              </Link>
            </li>
            <li>
              <Link href="/wishlist" className="hover:text-white transition-colors">
                Wishlist
              </Link>
            </li>
            <li>
              <Link href="/cart" className="hover:text-white transition-colors">
                Cart
              </Link>
            </li>
          </ul>
        </div>

        {/* Company & Policies Column */}
        <div>
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">Company & Policies</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link href="/pages/about-us" className="hover:text-white transition-colors">
                About Us
              </Link>
            </li>
            <li>
              <Link href="/pages/privacy-policy" className="hover:text-white transition-colors">
                Privacy Policy
              </Link>
            </li>
            <li>
              <Link href="/pages/terms-and-conditions" className="hover:text-white transition-colors">
                Terms & Conditions
              </Link>
            </li>
            <li>
              <Link href="/pages/shipping-and-returns" className="hover:text-white transition-colors">
                Shipping & Returns
              </Link>
            </li>
            <li>
              <Link href="/pages/faqs" className="hover:text-white transition-colors">
                FAQs & Help
              </Link>
            </li>
          </ul>
        </div>

        {/* Customer Support Column */}
        <div>
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">Customer Support</h2>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            Dedicated single-merchant support for orders, invoices, and product inquiries.
          </p>
          <div className="mt-4 space-y-1.5 text-sm">
            {emailNav && (
              <a
                href={emailNav.url}
                className="block font-semibold text-[#ffb45a] hover:text-white transition-colors"
              >
                {contactEmail}
              </a>
            )}
            {phoneNav && (
              <a
                href={phoneNav.url}
                className="block text-slate-300 hover:text-white transition-colors"
              >
                {contactPhone}
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-slate-700 px-4 py-5 text-center text-xs text-slate-400">
        {copyrightLine()}
      </div>
    </footer>
  );
}
