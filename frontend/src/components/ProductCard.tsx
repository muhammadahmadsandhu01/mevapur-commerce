'use client';

import { Star } from 'lucide-react';

interface ProductCardProps {
  product: {
    id: number;
    name: string;
    description: string;
    price: string;
    stock: number;
    image: string;
  };
}

export default function ProductCard({ product }: ProductCardProps) {
  const listPrice = (parseFloat(product.price) * 1.25).toFixed(0);

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 flex flex-col h-[430px] hover:shadow-md transition-shadow">
      
      {/* Image Container */}
      <div className="relative h-[190px] w-full bg-gray-50 rounded-md mb-3 overflow-hidden">
        <img 
          src={product.image || 'https://via.placeholder.com/300'} 
          alt={product.name}
          className="w-full h-full object-cover hover:scale-105 transition-transform"
        />
        <span className="absolute top-2 left-2 bg-[#CC0C39] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-sm">
          20% off
        </span>
      </div>

      {/* Title */}
      <h3 className="text-sm font-medium text-gray-900 line-clamp-2 h-10 leading-tight mb-2">
        {product.name}
      </h3>

      {/* Rating */}
      <div className="flex items-center mb-2">
        <div className="flex">
          {[...Array(5)].map((_, i) => (
            <Star key={i} className="h-3.5 w-3.5 text-[#ffa41c] fill-[#ffa41c]" />
          ))}
        </div>
        <span className="text-[11px] text-gray-500 ml-1">(128)</span>
      </div>

      {/* Price */}
      <div className="mb-1">
        <div className="flex items-baseline">
          <span className="text-[11px] align-top mr-0.5">Rs.</span>
          <span className="text-lg font-bold text-gray-900">
            {Math.floor(parseFloat(product.price))}
          </span>
          <span className="text-[11px] align-top">
            {parseFloat(product.price).toFixed(2).split('.')[1]}
          </span>
        </div>
        <span className="text-[11px] text-gray-500 line-through">
          List: Rs. {listPrice}
        </span>
      </div>

      {/* Delivery */}
      <p className="text-[11px] text-[#00A8E1] font-semibold italic mb-3">
        prime <span className="text-gray-600 not-italic font-normal">FREE Delivery</span>
      </p>

      {/* Buttons */}
      <button className="w-full py-2 rounded-full text-xs font-medium bg-[#FFD814] hover:bg-[#F7CA00] border border-[#FCD200] mb-2 transition-colors">
        Add to Cart
      </button>
      <button className="w-full py-2 rounded-full text-xs font-medium bg-[#FFA41C] hover:bg-[#FA8900] border border-[#FF8F00] transition-colors">
        Buy Now
      </button>
    </div>
  );
}