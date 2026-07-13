<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class UserSeeder extends Seeder
{
    public function run(): void
    {
        // Admin User
        User::create([
            'name' => 'Admin User',
            'email' => 'admin@mevapur.com',
            'password' => Hash::make('password123'),
            'role' => 'admin',
        ]);

        // Vendor User
        User::create([
            'name' => 'Vendor Shop',
            'email' => 'vendor@mevapur.com',
            'password' => Hash::make('password123'),
            'role' => 'vendor',
        ]);

        // Customer User
        User::create([
            'name' => 'Customer Demo',
            'email' => 'customer@mevapur.com',
            'password' => Hash::make('password123'),
            'role' => 'customer',
        ]);
    }
}