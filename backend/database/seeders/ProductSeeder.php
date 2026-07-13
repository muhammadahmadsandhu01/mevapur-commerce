<?php

namespace Database\Seeders;

use App\Models\Product;
use Illuminate\Database\Seeder;

class ProductSeeder extends Seeder
{
    public function run(): void
    {
        $products = [
            [
                'name' => 'Premium Mangoes (Box of 6)',
                'description' => 'Fresh organic mangoes from local farms. Sweet, juicy, and perfectly ripe.',
                'price' => 450.00,
                'stock' => 120,
                'image' => 'https://images.unsplash.com/photo-1553279768-865429fa0078?w=500',
                'is_active' => true,
            ],
            [
                'name' => 'Organic Red Apples (1kg)',
                'description' => 'Crisp, crunchy, and naturally sweet. Perfect for snacking or baking.',
                'price' => 280.00,
                'stock' => 85,
                'image' => 'https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?w=500',
                'is_active' => true,
            ],
            [
                'name' => 'Fresh Valencia Oranges (Dozen)',
                'description' => 'Vitamin C rich oranges. Great for juice or fresh eating.',
                'price' => 320.00,
                'stock' => 150,
                'image' => 'https://images.unsplash.com/photo-1547514701-42782101795e?w=500',
                'is_active' => true,
            ],
            [
                'name' => 'Premium Basmati Rice (5kg)',
                'description' => 'Aged, long-grain basmati rice. Aromatic and fluffy when cooked.',
                'price' => 1200.00,
                'stock' => 60,
                'image' => 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=500',
                'is_active' => true,
            ],
            [
                'name' => 'Pure Desi Ghee (1kg)',
                'description' => 'Traditional slow-cooked ghee. Rich flavor and aroma.',
                'price' => 1800.00,
                'stock' => 40,
                'image' => 'https://images.unsplash.com/photo-1631314552237-2970e14d3541?w=500',
                'is_active' => true,
            ],
        ];

        foreach ($products as $product) {
            Product::create($product);
        }
    }
}