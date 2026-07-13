<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Traits\ApiResponse;
use App\Models\Product;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class ProductController extends Controller
{
    use ApiResponse;

    /**
     * Get all products
     */
    public function index(): JsonResponse
    {
        $products = Product::where('is_active', true)->latest()->get();
        return $this->successResponse($products, 'Products list retrieved successfully');
    }

    /**
     * Get single product
     */
    public function show($id): JsonResponse
    {
        $product = Product::find($id);
        
        if (!$product) {
            return $this->errorResponse('Product not found', 404);
        }

        return $this->successResponse($product, 'Product details retrieved successfully');
    }

    /**
     * Create new product
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name'        => 'required|string|max:255',
            'description' => 'nullable|string',
            'price'       => 'required|numeric|min:0',
            'stock'       => 'required|integer|min:0',
            'image'       => 'nullable|string',
        ]);

        $product = Product::create($validated);
        return $this->successResponse($product, 'Product created successfully', 201);
    }

    /**
     * Update product
     */
    public function update(Request $request, $id): JsonResponse
    {
        $product = Product::find($id);

        if (!$product) {
            return $this->errorResponse('Product not found', 404);
        }

        $validated = $request->validate([
            'name'        => 'sometimes|required|string|max:255',
            'description' => 'nullable|string',
            'price'       => 'sometimes|required|numeric|min:0',
            'stock'       => 'sometimes|required|integer|min:0',
            'image'       => 'nullable|string',
        ]);

        $product->update($validated);
        return $this->successResponse($product, 'Product updated successfully');
    }

    /**
     * Delete product
     */
    public function destroy($id): JsonResponse
    {
        $product = Product::find($id);

        if (!$product) {
            return $this->errorResponse('Product not found', 404);
        }

        $product->delete();
        return $this->successResponse(null, 'Product deleted successfully');
    }
}