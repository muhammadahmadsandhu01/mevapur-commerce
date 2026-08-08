# P6 Modern Commerce Direction

## Authoritative product direction

HARZAAR must evolve into a modern, professional, sellable, multi-category commerce system rather than a niche dry-fruit or grocery store.

The target is marketplace-grade product quality and an extensible architecture suitable for commercial sale. Major marketplaces may inform the expected breadth of commerce capability, but P6 must not copy their layouts or branding and must not claim Amazon-scale infrastructure or Amazon/Walmart feature parity.

HARZAAR should retain its own premium, professional, 2026-era identity. Delivery must be incremental and preserve the verified P0–P5E functionality.

## A. Marketplace-quality customer UX

P6 should define and incrementally deliver:

- a premium, modern homepage with clear commercial hierarchy;
- responsive, mobile-first navigation and category discovery;
- prominent search with useful suggestions and discovery paths;
- polished product grids and consistent product cards;
- a modern product-detail experience for media, attributes, variants, price, stock, delivery, and trust information;
- clearer cart and checkout journeys;
- professional account, address, order-history, and order-tracking experiences;
- wishlist and saved-intent journeys;
- visible shipping, return, refund, privacy, and trust information;
- accessible semantics, keyboard behavior, contrast, focus, and form feedback;
- skeleton, loading, empty, error, and recovery states;
- consistent spacing, typography, motion, and interaction hierarchy.

## B. Commerce capability

The architecture and configuration model should support:

- categories and subcategories;
- brands;
- configurable attributes and variants;
- physical inventory with oversell protection;
- advanced search, filtering, and sorting;
- markets, countries, currencies, and languages/locales;
- Domestic, International, and Hybrid selling modes;
- shipping zones, rates, eligibility, and delivery expectations;
- national and international payment-method configuration;
- promotions and coupons;
- wishlist;
- invoices;
- customer and operational notifications;
- returns and refunds;
- reporting;
- role, permission, policy, and audit controls.

Availability and sellability must always come from catalogue, inventory, market, shipping, and provider configuration. The brand must never imply universal product or payment availability.

## C. Professional admin operations

P6 should shape the admin panel into a coherent operational workspace covering:

- a professional dashboard with actionable, permission-aware summaries;
- catalogue, category, brand, attribute, and variant operations;
- inventory visibility and controlled adjustments;
- order, payment, fulfilment, return, and refund workflows;
- customer operations with ownership and privacy controls;
- promotion and coupon operations;
- shipping, market, currency, locale, and selling-mode configuration;
- reporting, audit trails, and operational health;
- customer-replaceable brand and public business configuration;
- a read-only, policy-bound support assistant.

## Delivery principles

- Start P6 only after explicit approval.
- Establish UX and commerce contracts before broad visual implementation.
- Prefer configuration-driven capability over customer-specific hardcoding.
- Migrate one bounded journey or module at a time, then test it against the existing regression baseline.
- Preserve raw webhook verification, authentication security, money/inventory integrity, provider boundaries, and protected data-model behavior.
- Keep optional capabilities hidden or clearly unavailable until their data and providers are configured.
- Use evidence-based acceptance criteria for responsive behavior, accessibility, error recovery, performance, and operational safety.

This document records direction only. No P6 redesign or feature implementation was performed during P5E Task 3.
