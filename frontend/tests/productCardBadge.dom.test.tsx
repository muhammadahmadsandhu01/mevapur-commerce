import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import ProductCard from '@/components/products/ProductCard';
import type { Product } from '@/types/product';

describe('ProductCard Dynamic Discount Badge DOM Tests', () => {
  const baseProduct: Product = {
    _id: '6ab5f0a5dd285c6901dbbcdc',
    name: "Men's Urban Flex Running Sneakers",
    slug: 'mens-urban-flex-running-sneakers',
    price: 3850,
    originalPrice: 4500,
    stock: 25,
    rating: 4.5,
    reviewCount: 12,
  };

  it('renders dynamic -14% discount badge for 4500 original and 3850 price', () => {
    render(<ProductCard product={baseProduct} />);
    const badge = screen.getByText('-14%');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('bg-[#0b132b]');
  });

  it('renders dynamic -15% discount badge for 7500 original and 6400 price', () => {
    const shoeProduct: Product = {
      ...baseProduct,
      _id: '6ab6e70c18c119e0ea34eaec',
      name: 'Classic Leather Oxford Formal Shoes',
      price: 6400,
      originalPrice: 7500,
    };
    render(<ProductCard product={shoeProduct} />);
    expect(screen.getByText('-15%')).toBeInTheDocument();
  });

  it('renders dynamic -23% discount badge for 2400 original and 1850 price', () => {
    const bandProduct: Product = {
      ...baseProduct,
      _id: '6ab6e89c18c119e0ea34eb10',
      name: 'Adjustable Resistance Fitness Band Set',
      price: 1850,
      originalPrice: 2400,
    };
    render(<ProductCard product={bandProduct} />);
    expect(screen.getByText('-23%')).toBeInTheDocument();
  });

  it('does not render discount badge when product is not on sale', () => {
    const regularProduct: Product = {
      ...baseProduct,
      price: 3850,
      originalPrice: 3850,
    };
    const { container } = render(<ProductCard product={regularProduct} />);
    expect(container.querySelector('.bg-\\[\\#0b132b\\]')).toBeNull();
  });
});
