<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable;

    // Ye fields hum fill kar sakte hain
    protected $fillable = [
        'name',
        'email',
        'password',
        'role', // Admin/Vendor/Customer
    ];

    // Ye fields response mein nahi bhejne (security)
    protected $hidden = [
        'password',
        'remember_token',
    ];

    // Automatic conversions
    protected $casts = [
        'email_verified_at' => 'datetime',
        'password' => 'hashed',
    ];

    // Role check functions
    public function isAdmin(): bool {
        return $this->role === 'admin';
    }
    
    public function isVendor(): bool {
        return $this->role === 'vendor';
    }
    
    public function isCustomer(): bool {
        return $this->role === 'customer';
    }
}