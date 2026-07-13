'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { 
  ArrowLeft, 
  X, 
  Plus, 
  Package,
  DollarSign,
  Tag,
  Layers,
  Image as ImageIcon,
  CheckCircle,
  AlertCircle,
  Loader
} from 'lucide-react';
import api from '@/lib/api';
import Link from 'next/link';

export default function EditProductPage() {
  const router = useRouter();
  const params = useParams();
  const productId = params.id as string;
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [newImageUrl, setNewImageUrl] = useState('');
  const [highlights, setHighlights] = useState<string[]>([]);
  const [newHighlight, setNewHighlight] = useState('');
  const [specifications, setSpecifications] = useState<Record<string, string>>({});
  const [newSpecKey, setNewSpecKey] = useState('');
  const [newSpecValue, setNewSpecValue] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    originalPrice: '',
    discount: '',
    category: '',
    subcategory: '',
    brand: '',
    sku: '',
    stock: '0',
    isActive: true
  });

  useEffect(() => {
    fetchProduct();
  }, [productId]);

  const fetchProduct = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/products/${productId}`);
      
      if (response.data.success) {
        const product = response.data.data;
        
        setFormData({
          name: product.name || '',
          description: product.description || '',
          price: product.price?.toString() || '',
          originalPrice: product.originalPrice?.toString() || '',
          discount: product.discount?.toString() || '',
          category: product.category || '',
          subcategory: product.subcategory || '',
          brand: product.brand || '',
          sku: product.sku || '',
          stock: product.stock?.toString() || '0',
          isActive: product.isActive !== false
        });

        setImageUrls(product.images || []);
        setHighlights(product.highlights || []);
        
        if (product.specifications) {
          setSpecifications(product.specifications);
        }
      }
    } catch (error) {
      console.error('Error fetching product:', error);
      setError('Failed to load product');
    } finally {
      setLoading(false);
    }
  };

  const handleAddImageUrl = () => {
    if (newImageUrl.trim()) {
      setImageUrls([...imageUrls, newImageUrl.trim()]);
      setNewImageUrl('');
    }
  };

  const handleRemoveImageUrl = (index: number) => {
    setImageUrls(imageUrls.filter((_, i) => i !== index));
  };

  const handleAddHighlight = () => {
    if (newHighlight.trim()) {
      setHighlights([...highlights, newHighlight.trim()]);
      setNewHighlight('');
    }
  };

  const handleRemoveHighlight = (index: number) => {
    setHighlights(highlights.filter((_, i) => i !== index));
  };

  const handleAddSpecification = () => {
    if (newSpecKey.trim() && newSpecValue.trim()) {
      setSpecifications({
        ...specifications,
        [newSpecKey.trim()]: newSpecValue.trim()
      });
      setNewSpecKey('');
      setNewSpecValue('');
    }
  };

  const handleRemoveSpecification = (key: string) => {
    const newSpecs = { ...specifications };
    delete newSpecs[key];
    setSpecifications(newSpecs);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);

    try {
      if (!formData.name || !formData.description || !formData.price || !formData.category || !formData.sku) {
        throw new Error('Please fill all required fields');
      }

      const productData = {
        name: formData.name,
        description: formData.description,
        price: parseFloat(formData.price),
        originalPrice: formData.originalPrice ? parseFloat(formData.originalPrice) : 0,
        discount: formData.discount ? parseFloat(formData.discount) : 0,
        category: formData.category,
        subcategory: formData.subcategory || '',
        brand: formData.brand || '',
        sku: formData.sku,
        stock: parseInt(formData.stock) || 0,
        images: imageUrls,
        highlights: highlights,
        specifications: specifications,
        isActive: formData.isActive
      };

      const response = await api.put(`/products/${productId}`, productData);

      if (response.data.success) {
        setSuccess('✅ Product updated successfully!');
        setTimeout(() => {
          router.push('/products');
        }, 1500);
      } else {
        throw new Error(response.data.message || 'Failed to update product');
      }
    } catch (error: any) {
      console.error('❌ Error:', error);
      setError(error.response?.data?.message || error.message || 'Failed to update product');
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = {
    width: '100%',
    padding: '12px 16px',
    border: '1px solid var(--border-color)',
    borderRadius: '10px',
    fontSize: '14px',
    outline: 'none',
    backgroundColor: 'var(--input-bg)',
    color: 'var(--text-primary)',
    transition: 'all 0.2s'
  };

  const labelStyle = {
    display: 'block',
    fontSize: '14px',
    fontWeight: '600',
    color: 'var(--text-primary)',
    marginBottom: '8px'
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '400px'
      }}>
        <div style={{ textAlign: 'center' }}>
          <Loader 
            size={48} 
            color="var(--primary)" 
            style={{ animation: 'spin 1s linear infinite', marginBottom: '16px' }}
          />
          <p style={{ color: 'var(--text-secondary)', fontSize: '16px' }}>
            Loading product details...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <Link
          href="/products"
          style={{
            color: 'var(--primary)',
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            fontWeight: '600',
            marginBottom: '16px',
            fontSize: '14px'
          }}
        >
          <ArrowLeft size={18} />
          Back to Products
        </Link>
        
        <h1 style={{ 
          fontSize: '32px', 
          fontWeight: '800', 
          color: 'var(--text-primary)',
          marginBottom: '8px'
        }}>
          Edit Product
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>
          Update product details and inventory
        </p>
      </div>

      {/* Success Message */}
      {success && (
        <div style={{
          padding: '16px',
          backgroundColor: '#D1FAE5',
          border: '1px solid #10B981',
          borderRadius: '12px',
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          color: '#065F46'
        }}>
          <CheckCircle size={24} />
          <span style={{ fontWeight: '600' }}>{success}</span>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div style={{
          padding: '16px',
          backgroundColor: '#FEE2E2',
          border: '1px solid #EF4444',
          borderRadius: '12px',
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          color: '#991B1B'
        }}>
          <AlertCircle size={24} />
          <span style={{ fontWeight: '600' }}>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Basic Information */}
        <div style={{
          backgroundColor: 'var(--card-bg)',
          borderRadius: '16px',
          padding: '32px',
          border: '1px solid var(--border-color)',
          marginBottom: '24px'
        }}>
          <h2 style={{ 
            fontSize: '20px', 
            fontWeight: '700',
            marginBottom: '24px',
            color: 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <Package size={24} color="var(--primary)" />
            Basic Information
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            {/* Product Name */}
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Product Name *</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter product name"
                style={inputStyle}
              />
            </div>

            {/* Description */}
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Description *</label>
              <textarea
                required
                rows={4}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Enter product description"
                style={{
                  ...inputStyle,
                  resize: 'vertical',
                  minHeight: '120px'
                }}
              />
            </div>

            {/* Category */}
            <div>
              <label style={labelStyle}>Category *</label>
              <select
                required
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                style={inputStyle}
              >
                <option value="">Select category</option>
                <option value="Fruits">Fruits</option>
                <option value="Dry Fruits">Dry Fruits</option>
                <option value="Groceries">Groceries</option>
                <option value="Spices">Spices</option>
                <option value="Others">Others</option>
              </select>
            </div>

            {/* Subcategory */}
            <div>
              <label style={labelStyle}>Subcategory</label>
              <input
                type="text"
                value={formData.subcategory}
                onChange={(e) => setFormData({ ...formData, subcategory: e.target.value })}
                placeholder="Enter subcategory"
                style={inputStyle}
              />
            </div>

            {/* Brand */}
            <div>
              <label style={labelStyle}>Brand</label>
              <input
                type="text"
                value={formData.brand}
                onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                placeholder="Enter brand name"
                style={inputStyle}
              />
            </div>

            {/* SKU */}
            <div>
              <label style={labelStyle}>SKU *</label>
              <input
                type="text"
                required
                value={formData.sku}
                onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                placeholder="Enter SKU (e.g., PROD-001)"
                style={inputStyle}
              />
            </div>
          </div>
        </div>

        {/* Pricing & Inventory */}
        <div style={{
          backgroundColor: 'var(--card-bg)',
          borderRadius: '16px',
          padding: '32px',
          border: '1px solid var(--border-color)',
          marginBottom: '24px'
        }}>
          <h2 style={{ 
            fontSize: '20px', 
            fontWeight: '700',
            marginBottom: '24px',
            color: 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <DollarSign size={24} color="var(--primary)" />
            Pricing & Inventory
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px' }}>
            {/* Price */}
            <div>
              <label style={labelStyle}>Price (Rs.) *</label>
              <input
                type="number"
                required
                min="0"
                step="0.01"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                placeholder="0.00"
                style={inputStyle}
              />
            </div>

            {/* Original Price */}
            <div>
              <label style={labelStyle}>Original Price (Rs.)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={formData.originalPrice}
                onChange={(e) => setFormData({ ...formData, originalPrice: e.target.value })}
                placeholder="0.00"
                style={inputStyle}
              />
            </div>

            {/* Discount */}
            <div>
              <label style={labelStyle}>Discount (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={formData.discount}
                onChange={(e) => setFormData({ ...formData, discount: e.target.value })}
                placeholder="0"
                style={inputStyle}
              />
            </div>

            {/* Stock */}
            <div>
              <label style={labelStyle}>Stock Quantity *</label>
              <input
                type="number"
                required
                min="0"
                value={formData.stock}
                onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                placeholder="0"
                style={inputStyle}
              />
            </div>

            {/* Active Status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>Active</label>
              <label style={{ position: 'relative', display: 'inline-block', width: '50px', height: '26px' }}>
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  style={{ opacity: 0, width: 0, height: 0 }}
                />
                <span style={{
                  position: 'absolute',
                  cursor: 'pointer',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: formData.isActive ? 'var(--primary)' : '#ccc',
                  transition: '.4s',
                  borderRadius: '34px'
                }}>
                  <span style={{
                    position: 'absolute',
                    content: '""',
                    height: '20px',
                    width: '20px',
                    left: '3px',
                    bottom: '3px',
                    backgroundColor: 'white',
                    transition: '.4s',
                    borderRadius: '50%',
                    transform: formData.isActive ? 'translateX(24px)' : 'translateX(0)'
                  }} />
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* Images */}
        <div style={{
          backgroundColor: 'var(--card-bg)',
          borderRadius: '16px',
          padding: '32px',
          border: '1px solid var(--border-color)',
          marginBottom: '24px'
        }}>
          <h2 style={{ 
            fontSize: '20px', 
            fontWeight: '700',
            marginBottom: '24px',
            color: 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <ImageIcon size={24} color="var(--primary)" />
            Product Images
          </h2>

          {/* Add Image URL */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
            <input
              type="url"
              placeholder="Enter image URL (https://...)"
              value={newImageUrl}
              onChange={(e) => setNewImageUrl(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddImageUrl())}
              style={{
                flex: 1,
                ...inputStyle
              }}
            />
            <button
              type="button"
              onClick={handleAddImageUrl}
              style={{
                padding: '12px 24px',
                backgroundColor: 'var(--primary)',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                cursor: 'pointer',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <Plus size={18} />
              Add
            </button>
          </div>

          {/* Image Preview Grid */}
          {imageUrls.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '16px' }}>
              {imageUrls.map((url, index) => (
                <div
                  key={index}
                  style={{
                    position: 'relative',
                    aspectRatio: '1',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    border: '2px solid var(--border-color)'
                  }}
                >
                  <img
                    src={url}
                    alt={`Product ${index + 1}`}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveImageUrl(index)}
                    style={{
                      position: 'absolute',
                      top: '8px',
                      right: '8px',
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      backgroundColor: '#EF4444',
                      color: 'white',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <X size={18} />
                  </button>
                  {index === 0 && (
                    <div style={{
                      position: 'absolute',
                      bottom: '8px',
                      left: '8px',
                      padding: '4px 12px',
                      backgroundColor: 'var(--primary)',
                      color: 'white',
                      borderRadius: '20px',
                      fontSize: '11px',
                      fontWeight: '600'
                    }}>
                      Main Image
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div style={{
              padding: '60px',
              border: '2px dashed var(--border-color)',
              borderRadius: '12px',
              textAlign: 'center',
              color: 'var(--text-secondary)'
            }}>
              <ImageIcon size={64} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
              <p style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>
                No images added yet
              </p>
              <p style={{ fontSize: '14px' }}>
                Add image URLs above to display product images
              </p>
            </div>
          )}
        </div>

        {/* Highlights */}
        <div style={{
          backgroundColor: 'var(--card-bg)',
          borderRadius: '16px',
          padding: '32px',
          border: '1px solid var(--border-color)',
          marginBottom: '24px'
        }}>
          <h2 style={{ 
            fontSize: '20px', 
            fontWeight: '700',
            marginBottom: '24px',
            color: 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <Tag size={24} color="var(--primary)" />
            Highlights
          </h2>

          <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
            <input
              type="text"
              placeholder="Enter a highlight (e.g., Organic, Fresh, Premium)"
              value={newHighlight}
              onChange={(e) => setNewHighlight(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddHighlight())}
              style={{
                flex: 1,
                ...inputStyle
              }}
            />
            <button
              type="button"
              onClick={handleAddHighlight}
              style={{
                padding: '12px 24px',
                backgroundColor: 'var(--primary)',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                cursor: 'pointer',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <Plus size={18} />
              Add
            </button>
          </div>

          {highlights.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
              {highlights.map((highlight, index) => (
                <div
                  key={index}
                  style={{
                    padding: '10px 16px',
                    backgroundColor: 'var(--primary-light)',
                    color: 'var(--primary)',
                    borderRadius: '20px',
                    fontSize: '14px',
                    fontWeight: '600',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  {highlight}
                  <button
                    type="button"
                    onClick={() => handleRemoveHighlight(index)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--primary)',
                      padding: '0',
                      display: 'flex',
                      alignItems: 'center'
                    }}
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Specifications */}
        <div style={{
          backgroundColor: 'var(--card-bg)',
          borderRadius: '16px',
          padding: '32px',
          border: '1px solid var(--border-color)',
          marginBottom: '24px'
        }}>
          <h2 style={{ 
            fontSize: '20px', 
            fontWeight: '700',
            marginBottom: '24px',
            color: 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <Layers size={24} color="var(--primary)" />
            Specifications
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '12px', marginBottom: '20px' }}>
            <input
              type="text"
              placeholder="Specification name (e.g., Weight)"
              value={newSpecKey}
              onChange={(e) => setNewSpecKey(e.target.value)}
              style={inputStyle}
            />
            <input
              type="text"
              placeholder="Value (e.g., 1kg)"
              value={newSpecValue}
              onChange={(e) => setNewSpecValue(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddSpecification())}
              style={inputStyle}
            />
            <button
              type="button"
              onClick={handleAddSpecification}
              style={{
                padding: '12px 24px',
                backgroundColor: 'var(--primary)',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                cursor: 'pointer',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <Plus size={18} />
              Add
            </button>
          </div>

          {Object.keys(specifications).length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {Object.entries(specifications).map(([key, value]) => (
                <div
                  key={key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '16px',
                    backgroundColor: 'var(--bg-primary)',
                    borderRadius: '10px',
                    border: '1px solid var(--border-color)'
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: '600', color: 'var(--text-primary)', marginBottom: '4px' }}>
                      {key}
                    </div>
                    <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                      {value}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveSpecification(key)}
                    style={{
                      padding: '8px 12px',
                      backgroundColor: '#FEE2E2',
                      color: '#DC2626',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontWeight: '600',
                      fontSize: '13px'
                    }}
                  >
                    <X size={16} />
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Submit Button */}
        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '16px'
        }}>
          <Link
            href="/products"
            style={{
              padding: '14px 32px',
              backgroundColor: 'var(--card-bg)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: '10px',
              textDecoration: 'none',
              fontWeight: '600',
              fontSize: '15px'
            }}
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving}
            style={{
              padding: '14px 32px',
              backgroundColor: saving ? '#9CA3AF' : 'var(--primary)',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontWeight: '600',
              fontSize: '15px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            {saving ? (
              <>
                <Loader size={20} style={{ animation: 'spin 1s linear infinite' }} />
                Saving...
              </>
            ) : (
              <>
                <CheckCircle size={20} />
                Update Product
              </>
            )}
          </button>
        </div>
      </form>

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}