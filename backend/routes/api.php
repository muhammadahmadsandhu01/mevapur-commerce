<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\ProductController;

// Base URL: http://127.0.0.1:8000/api/

// 1. System Check Route
Route::get('/test', function () {
    return response()->json([
        'status' => 'success',
        'message' => 'MevaPur Commerce API v1.0 is live',
        'timestamp' => now()->toIso8601String(),
    ]);
});

// 2. Product Routes
Route::prefix('products')->group(function () {
    Route::get('/', [ProductController::class, 'index']);          // GET /api/products
    Route::get('/{id}', [ProductController::class, 'show']);       // GET /api/products/1
    Route::post('/', [ProductController::class, 'store']);         // POST /api/products
    Route::put('/{id}', [ProductController::class, 'update']);     // PUT /api/products/1
    Route::delete('/{id}', [ProductController::class, 'destroy']); // DELETE /api/products/1
});

use App\Http\Controllers\Api\AuthController;

// Authentication Routes
Route::prefix('auth')->group(function () {
    Route::post('/register', [AuthController::class, 'register']);
    Route::post('/login', [AuthController::class, 'login']);
    
    // Protected routes (sirf logged-in users access kar saken)
    Route::middleware('auth:sanctum')->group(function () {
        Route::get('/user', [AuthController::class, 'user']);
        Route::post('/logout', [AuthController::class, 'logout']);
    });
});