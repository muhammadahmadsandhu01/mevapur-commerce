'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Package, ChevronDown, ChevronUp, Save, Upload, X, 
  Plus, Trash2, Image as ImageIcon, AlertCircle, CheckCircle,
  Loader, Eye, Settings, Tag, DollarSign, Box, Truck,
  Search, Globe, BarChart3, Link as LinkIcon, MessageSquare
} from 'lucide-react';
import api, { getCategories, getBrands, getProducts } from '@/lib/api';

// Types
interface Variant {
  _id?: string;
  sku: string;
  barcode?: string;
  attributes: { name: string; value: string }[];
  price: number;
  salePrice?: number;
  stock: number;
  weight?: number;
  image?: string;
  isDefault: boolean;
}

interface Attribute {
  name: string;
  value: string;
}

interface ProductFormData {
  // Basic Info
  name: string;
  slug: string;
  shortName?: string;
  sku: string;
  barcode?: string;
  brand?: string;
  category?: string;
  subcategory?: string;
  productType: 'simple' | 'variable';
  tags: string[];
  isFeatured: boolean;
  isNewArrival: boolean;
  isBestSeller: boolean;
  isTrending: boolean;

  // Pricing
  costPrice: number;
  price: number;
  originalPrice?: number;
  salePrice?: number;
  taxClass: string;

  // Inventory
  stock: number;
  lowStockAlert: number;
  allowBackorders: boolean;
  trackInventory: boolean;

  // Media
  images: string[];
  primaryImage?: string;
  videoUrl?: string;

  // Description
  shortDescription: string;
  description: string;
  ingredients?: string;
  nutritionalFacts?: string;
  storageInstructions?: string;
  shelfLife?: string;
  countryOfOrigin: string;

  // Shipping
  weight?: number;
  dimensions?: { length: number; width: number; height: number };
  shippingClass: string;
  freeShipping: boolean;

  // SEO
  seoTitle?: string;
  metaDescription?: string;
  keywords?: string;
  canonicalUrl?: string;

  // Visibility
  status: 'draft' | 'published' | 'scheduled';
  publishDate?: string;

  // Advanced
  variants: Variant[];
  attributes: Attribute[];
  relatedProducts?: string[];
  enableReviews: boolean;
  allowWishlist: boolean;
  allowCompare: boolean;
  allowCOD: boolean;
}

const initialFormData: ProductFormData = {
  name: '',
  slug: '',
  shortName: '',
  sku: '',
  barcode: '',
  brand: '',
  category: '',
  subcategory: '',
  productType: 'simple',
  tags: [],
  isFeatured: false,
  isNewArrival: false,
  isBestSeller: false,
  isTrending: false,
  costPrice: 0,
  price: 0,
  originalPrice: undefined,
  salePrice: undefined,
  taxClass: 'standard',
  stock: 0,
  lowStockAlert: 10,
  allowBackorders: false,
  trackInventory: true,
  images: [],
  primaryImage: undefined,
  videoUrl: undefined,
  shortDescription: '',
  description: '',
  ingredients: undefined,
  nutritionalFacts: undefined,
  storageInstructions: undefined,
  shelfLife: undefined,
  countryOfOrigin: 'Pakistan',
  weight: undefined,
  dimensions: undefined,
  shippingClass: 'standard',
  freeShipping: false,
  seoTitle: undefined,
  metaDescription: undefined,
  keywords: undefined,
  canonicalUrl: undefined,
  status: 'draft',
  publishDate: undefined,
  variants: [],
  attributes: [],
  relatedProducts: undefined,
  enableReviews: true,
  allowWishlist: true,
  allowCompare: true,
  allowCOD: true,
};

// Collapsible Section Component
const Section = ({ 
  title, 
  icon: Icon, 
  children, 
  defaultOpen = true,
  onSave
}: { 
  title: string; 
  icon: any; 
  children: React.ReactNode; 
  defaultOpen?: boolean;
  onSave?: () => void;
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div style={{
      backgroundColor: 'var(--card-bg)',
      borderRadius: '12px',
      border: '1px solid var(--border-color)',
      marginBottom: '24px',
      overflow: 'hidden'
    }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '100%',
          padding: '20px 24px',
          backgroundColor: 'transparent',
          border: 'none',
          borderBottom: isOpen ? '1px solid var(--border-color)' : 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          transition: 'all 0.2s'
        }}
        onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--hover-bg)'}
        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Icon size={20} color="var(--primary)" />
          <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
            {title}
          </h2>
        </div>
        {isOpen ? <ChevronUp size={20} color="var(--text-secondary)" /> : <ChevronDown size={20} color="var(--text-secondary)" />}
      </button>
      
      {isOpen && (
        <div style={{ padding: '24px' }}>
          {children}
        </div>
      )}
    </div>
  );
};

// Tag Input Component
const TagInput = ({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) => {
  const [input, setInput] = useState('');

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && input.trim()) {
      e.preventDefault();
      if (!tags.includes(input.trim())) {
        onChange([...tags, input.trim()]);
      }
      setInput('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    onChange(tags.filter(tag => tag !== tagToRemove));
  };

  return (
    <div style={{
      padding: '12px',
      border: '1px solid var(--border-color)',
      borderRadius: '8px',
      backgroundColor: 'var(--input-bg)',
      minHeight: '48px'
    }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
        {tags.map((tag, index) => (
          <span key={index} style={{
            padding: '6px 12px',
            backgroundColor: 'var(--primary-light)',
            color: 'var(--primary)',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            {tag}
            <button onClick={() => removeTag(tag)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              <X size={14} />
            </button>
          </span>
        ))}
      </div>
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type and press Enter to add tags..."
        style={{
          width: '100%',
          border: 'none',
          outline: 'none',
          backgroundColor: 'transparent',
          color: 'var(--text-primary)',
          fontSize: '14px'
        }}
      />
    </div>
  );
};

export default function AddProductPage() {
  const router = useRouter();
  const [formData, setFormData] = useState<ProductFormData>(initialFormData);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [tagInput, setTagInput] = useState('');
  const [activeTab, setActiveTab] = useState<'basic' | 'variants' | 'media'>('basic');

  // Auto-generate slug from name
  useEffect(() => {
    if (formData.name && !formData.slug) {
      const slug = formData.name
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .substring(0, 60);
      setFormData(prev => ({ ...prev, slug }));
    }
  }, [formData.name]);

  // Auto-generate SKU
  useEffect(() => {
    if (formData.name && !formData.sku) {
      const sku = formData.name
        .toUpperCase()
        .replace(/[^\w]/g, '')
        .substring(0, 8) + '-' + Date.now().toString().slice(-4);
      setFormData(prev => ({ ...prev, sku }));
    }
  }, [formData.name]);

  // Fetch categories and brands
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [catsData, brandsData] = await Promise.all([
          getCategories(),
          getBrands()
        ]);
        setCategories(catsData);
        setBrands(brandsData);
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    };
    fetchData();
  }, []);

  // Auto-save every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (formData.name && formData.status === 'draft') {
        handleAutoSave();
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [formData]);

  const handleAutoSave = async () => {
    setSaving(true);
    try {
      // In real implementation, this would save to backend
      console.log('Auto-saving...', formData);
      // await api.post('/products/draft', formData);
    } catch (error) {
      console.error('Auto-save failed:', error);
    } finally {
      setSaving(false);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) newErrors.name = 'Product name is required';
    if (!formData.slug.trim()) newErrors.slug = 'Slug is required';
    if (!formData.category) newErrors.category = 'Category is required';
    if (formData.price <= 0) newErrors.price = 'Price must be greater than 0';
    if (formData.productType === 'variable' && formData.variants.length === 0) {
      newErrors.variants = 'At least one variant is required for variable products';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (status: 'draft' | 'published') => {
    setFormData(prev => ({ ...prev, status }));
    
    if (status === 'published' && !validateForm()) {
      alert('Please fill all required fields correctly');
      return;
    }

    setLoading(true);
    try {
      const response = await api.post('/products', formData);
      if (response.data.success) {
        alert(status === 'published' ? 'Product published successfully!' : 'Draft saved successfully!');
        router.push('/admin/products');
      }
    } catch (error: any) {
      alert(error.response?.data?.message || 'Failed to save product');
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    // In real implementation, upload to cloud storage
    // For now, we'll use placeholder URLs
    const newImages = Array.from(files).map((_, index) => 
      `https://via.placeholder.com/600x600?text=Image+${formData.images.length + index + 1}`
    );
    
    setFormData(prev => ({
      ...prev,
      images: [...prev.images, ...newImages],
      primaryImage: prev.primaryImage || newImages[0]
    }));
  };

  const removeImage = (index: number) => {
    const newImages = formData.images.filter((_, i) => i !== index);
    setFormData(prev => ({
      ...prev,
      images: newImages,
      primaryImage: prev.primaryImage === formData.images[index] ? newImages[0] : prev.primaryImage
    }));
  };

  const addVariant = () => {
    const newVariant: Variant = {
      sku: `${formData.sku}-VAR-${formData.variants.length + 1}`,
      attributes: [],
      price: formData.price,
      stock: formData.stock,
      isDefault: formData.variants.length === 0
    };
    setFormData(prev => ({ ...prev, variants: [...prev.variants, newVariant] }));
  };

  const removeVariant = (index: number) => {
    setFormData(prev => ({
      ...prev,
      variants: prev.variants.filter((_, i) => i !== index)
    }));
  };

  const updateVariant = (index: number, field: keyof Variant, value: any) => {
    const newVariants = [...formData.variants];
    newVariants[index] = { ...newVariants[index], [field]: value };
    setFormData(prev => ({ ...prev, variants: newVariants }));
  };

  const addAttribute = () => {
    setFormData(prev => ({
      ...prev,
      attributes: [...prev.attributes, { name: '', value: '' }]
    }));
  };

  const updateAttribute = (index: number, field: 'name' | 'value', value: string) => {
    const newAttributes = [...formData.attributes];
    newAttributes[index] = { ...newAttributes[index], [field]: value };
    setFormData(prev => ({ ...prev, attributes: newAttributes }));
  };

  const removeAttribute = (index: number) => {
    setFormData(prev => ({
      ...prev,
      attributes: prev.attributes.filter((_, i) => i !== index)
    }));
  };

  const discount = formData.originalPrice && formData.originalPrice > formData.price
    ? Math.round(((formData.originalPrice - formData.price) / formData.originalPrice) * 100)
    : 0;

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '32px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '8px' }}>
            Add New Product
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>
            Create a new product with variants, pricing, and inventory management
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => handleSubmit('draft')}
            disabled={loading}
            style={{
              padding: '12px 24px',
              backgroundColor: 'var(--card-bg)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: '10px',
              fontWeight: '700',
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <Save size={18} /> Save Draft
          </button>
          <button
            onClick={() => handleSubmit('published')}
            disabled={loading}
            style={{
              padding: '12px 24px',
              backgroundColor: loading ? 'var(--text-secondary)' : 'var(--primary)',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              fontWeight: '700',
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 12px rgba(15, 118, 110, 0.3)',
              transition: 'all 0.2s'
            }}
            onMouseEnter={e => {
              if (!loading) {
                e.currentTarget.style.backgroundColor = 'var(--primary-dark)';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }
            }}
            onMouseLeave={e => {
              if (!loading) {
                e.currentTarget.style.backgroundColor = 'var(--primary)';
                e.currentTarget.style.transform = 'translateY(0)';
              }
            }}
          >
            {loading ? <Loader size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle size={18} />}
            {loading ? 'Saving...' : 'Publish Product'}
          </button>
        </div>
      </div>

      {saving && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          backgroundColor: 'var(--card-bg)',
          padding: '12px 20px',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          border: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          zIndex: 1000
        }}>
          <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} color="var(--primary)" />
          <span style={{ fontSize: '13px', fontWeight: '600' }}>Auto-saving...</span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '24px' }}>
        {/* Left Column - Form Sections */}
        <div>
          {/* Section 1: Basic Information */}
          <Section title="Basic Information" icon={Package} defaultOpen={true}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                  Product Name <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Enter product name"
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: errors.name ? '2px solid #EF4444' : '1px solid var(--border-color)',
                    borderRadius: '8px',
                    backgroundColor: 'var(--input-bg)',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                />
                {errors.name && <p style={{ color: '#EF4444', fontSize: '12px', marginTop: '4px' }}>{errors.name}</p>}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                  Product Slug <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <input
                  type="text"
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                  placeholder="product-slug"
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: errors.slug ? '2px solid #EF4444' : '1px solid var(--border-color)',
                    borderRadius: '8px',
                    backgroundColor: 'var(--input-bg)',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                  SKU <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <input
                  type="text"
                  value={formData.sku}
                  onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                  placeholder="Auto-generated"
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    backgroundColor: 'var(--input-bg)',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                  Category <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: errors.category ? '2px solid #EF4444' : '1px solid var(--border-color)',
                    borderRadius: '8px',
                    backgroundColor: 'var(--input-bg)',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  <option value="">Select Category</option>
                  {categories.filter(c => !c.parentId).map(cat => (
                    <option key={cat._id} value={cat._id}>{cat.name}</option>
                  ))}
                </select>
                {errors.category && <p style={{ color: '#EF4444', fontSize: '12px', marginTop: '4px' }}>{errors.category}</p>}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                  Brand
                </label>
                <select
                  value={formData.brand}
                  onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    backgroundColor: 'var(--input-bg)',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  <option value="">Select Brand</option>
                  {brands.map(brand => (
                    <option key={brand._id} value={brand._id}>{brand.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                  Product Type
                </label>
                <div style={{ display: 'flex', gap: '16px' }}>
                  <label style={{
                    flex: 1,
                    padding: '16px',
                    border: formData.productType === 'simple' ? '2px solid var(--primary)' : '1px solid var(--border-color)',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    textAlign: 'center',
                    backgroundColor: formData.productType === 'simple' ? 'var(--primary-light)' : 'transparent',
                    transition: 'all 0.2s'
                  }}>
                    <input
                      type="radio"
                      name="productType"
                      value="simple"
                      checked={formData.productType === 'simple'}
                      onChange={(e) => setFormData({ ...formData, productType: e.target.value as 'simple' | 'variable' })}
                      style={{ display: 'none' }}
                    />
                    <div style={{ fontWeight: '700', marginBottom: '4px' }}>Simple Product</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Single price & stock</div>
                  </label>
                  <label style={{
                    flex: 1,
                    padding: '16px',
                    border: formData.productType === 'variable' ? '2px solid var(--primary)' : '1px solid var(--border-color)',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    textAlign: 'center',
                    backgroundColor: formData.productType === 'variable' ? 'var(--primary-light)' : 'transparent',
                    transition: 'all 0.2s'
                  }}>
                    <input
                      type="radio"
                      name="productType"
                      value="variable"
                      checked={formData.productType === 'variable'}
                      onChange={(e) => setFormData({ ...formData, productType: e.target.value as 'simple' | 'variable' })}
                      style={{ display: 'none' }}
                    />
                    <div style={{ fontWeight: '700', marginBottom: '4px' }}>Variable Product</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Multiple variants</div>
                  </label>
                </div>
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                  Tags (Press Enter to add)
                </label>
                <TagInput
                  tags={formData.tags}
                  onChange={(tags) => setFormData({ ...formData, tags })}
                />
              </div>
            </div>
          </Section>

          {/* Section 2: Pricing */}
          <Section title="Pricing" icon={DollarSign}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                  Cost Price (Rs.)
                </label>
                <input
                  type="number"
                  value={formData.costPrice}
                  onChange={(e) => setFormData({ ...formData, costPrice: parseFloat(e.target.value) || 0 })}
                  placeholder="0.00"
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    backgroundColor: 'var(--input-bg)',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                  Selling Price (Rs.) <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <input
                  type="number"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                  placeholder="0.00"
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: errors.price ? '2px solid #EF4444' : '1px solid var(--border-color)',
                    borderRadius: '8px',
                    backgroundColor: 'var(--input-bg)',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                />
                {errors.price && <p style={{ color: '#EF4444', fontSize: '12px', marginTop: '4px' }}>{errors.price}</p>}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                  Original Price (Rs.)
                </label>
                <input
                  type="number"
                  value={formData.originalPrice || ''}
                  onChange={(e) => setFormData({ ...formData, originalPrice: parseFloat(e.target.value) || undefined })}
                  placeholder="0.00"
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    backgroundColor: 'var(--input-bg)',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                  Discount
                </label>
                <div style={{
                  padding: '12px 16px',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  backgroundColor: discount > 0 ? '#D1FAE5' : 'var(--input-bg)',
                  color: discount > 0 ? '#0F766E' : 'var(--text-secondary)',
                  fontSize: '14px',
                  fontWeight: '700'
                }}>
                  {discount > 0 ? `${discount}% OFF` : 'No discount'}
                </div>
              </div>
            </div>
          </Section>

          {/* Section 3: Inventory */}
          <Section title="Inventory" icon={Box}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                  Stock Quantity
                </label>
                <input
                  type="number"
                  value={formData.stock}
                  onChange={(e) => setFormData({ ...formData, stock: parseInt(e.target.value) || 0 })}
                  placeholder="0"
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    backgroundColor: 'var(--input-bg)',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                  Low Stock Alert
                </label>
                <input
                  type="number"
                  value={formData.lowStockAlert}
                  onChange={(e) => setFormData({ ...formData, lowStockAlert: parseInt(e.target.value) || 10 })}
                  placeholder="10"
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    backgroundColor: 'var(--input-bg)',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                />
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '16px',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  backgroundColor: formData.trackInventory ? 'var(--primary-light)' : 'transparent'
                }}>
                  <input
                    type="checkbox"
                    checked={formData.trackInventory}
                    onChange={(e) => setFormData({ ...formData, trackInventory: e.target.checked })}
                    style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                  />
                  <div>
                    <div style={{ fontWeight: '700', color: 'var(--text-primary)' }}>Track Inventory</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Enable stock management for this product</div>
                  </div>
                </label>
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '16px',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  backgroundColor: formData.allowBackorders ? 'var(--primary-light)' : 'transparent'
                }}>
                  <input
                    type="checkbox"
                    checked={formData.allowBackorders}
                    onChange={(e) => setFormData({ ...formData, allowBackorders: e.target.checked })}
                    style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                  />
                  <div>
                    <div style={{ fontWeight: '700', color: 'var(--text-primary)' }}>Allow Backorders</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Allow customers to order when out of stock</div>
                  </div>
                </label>
              </div>
            </div>
          </Section>

          {/* Section 4: Product Variants (Only for Variable Products) */}
          {formData.productType === 'variable' && (
            <Section title="Product Variants" icon={Package} defaultOpen={false}>
              {errors.variants && (
                <div style={{
                  padding: '12px',
                  backgroundColor: '#FEE2E2',
                  border: '1px solid #EF4444',
                  borderRadius: '8px',
                  marginBottom: '20px',
                  color: '#DC2626',
                  fontSize: '13px',
                  fontWeight: '600'
                }}>
                  {errors.variants}
                </div>
              )}

              <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                  {formData.variants.length} variant(s) created
                </p>
                <button
                  onClick={addVariant}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: 'var(--primary)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <Plus size={18} /> Add Variant
                </button>
              </div>

              {formData.variants.map((variant, index) => (
                <div key={index} style={{
                  padding: '20px',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  marginBottom: '16px',
                  backgroundColor: 'var(--bg-primary)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
                      Variant #{index + 1}
                    </h3>
                    <button
                      onClick={() => removeVariant(index)}
                      style={{
                        padding: '8px',
                        backgroundColor: '#FEE2E2',
                        color: '#DC2626',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer'
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '6px' }}>
                        SKU
                      </label>
                      <input
                        type="text"
                        value={variant.sku}
                        onChange={(e) => updateVariant(index, 'sku', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '10px',
                          border: '1px solid var(--border-color)',
                          borderRadius: '6px',
                          fontSize: '13px'
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '6px' }}>
                        Price (Rs.)
                      </label>
                      <input
                        type="number"
                        value={variant.price}
                        onChange={(e) => updateVariant(index, 'price', parseFloat(e.target.value) || 0)}
                        style={{
                          width: '100%',
                          padding: '10px',
                          border: '1px solid var(--border-color)',
                          borderRadius: '6px',
                          fontSize: '13px'
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '6px' }}>
                        Stock
                      </label>
                      <input
                        type="number"
                        value={variant.stock}
                        onChange={(e) => updateVariant(index, 'stock', parseInt(e.target.value) || 0)}
                        style={{
                          width: '100%',
                          padding: '10px',
                          border: '1px solid var(--border-color)',
                          borderRadius: '6px',
                          fontSize: '13px'
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '6px' }}>
                        Weight (kg)
                      </label>
                      <input
                        type="number"
                        value={variant.weight || ''}
                        onChange={(e) => updateVariant(index, 'weight', parseFloat(e.target.value) || undefined)}
                        placeholder="Optional"
                        style={{
                          width: '100%',
                          padding: '10px',
                          border: '1px solid var(--border-color)',
                          borderRadius: '6px',
                          fontSize: '13px'
                        }}
                      />
                    </div>
                  </div>

                  {/* Variant Attributes */}
                  <div style={{ marginTop: '16px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                      Attributes (e.g., Weight: 1kg, Packaging: Box)
                    </label>
                    {variant.attributes.map((attr, attrIndex) => (
                      <div key={attrIndex} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                        <input
                          type="text"
                          value={attr.name}
                          onChange={(e) => {
                            const newAttrs = [...variant.attributes];
                            newAttrs[attrIndex] = { ...newAttrs[attrIndex], name: e.target.value };
                            updateVariant(index, 'attributes', newAttrs);
                          }}
                          placeholder="Attribute name"
                          style={{ flex: 1, padding: '8px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px' }}
                        />
                        <input
                          type="text"
                          value={attr.value}
                          onChange={(e) => {
                            const newAttrs = [...variant.attributes];
                            newAttrs[attrIndex] = { ...newAttrs[attrIndex], value: e.target.value };
                            updateVariant(index, 'attributes', newAttrs);
                          }}
                          placeholder="Value"
                          style={{ flex: 1, padding: '8px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px' }}
                        />
                        <button
                          onClick={() => {
                            const newAttrs = variant.attributes.filter((_, i) => i !== attrIndex);
                            updateVariant(index, 'attributes', newAttrs);
                          }}
                          style={{ padding: '8px', backgroundColor: '#FEE2E2', color: '#DC2626', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => {
                        const newAttrs = [...variant.attributes, { name: '', value: '' }];
                        updateVariant(index, 'attributes', newAttrs);
                      }}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: 'var(--bg-primary)',
                        color: 'var(--primary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        marginTop: '8px'
                      }}
                    >
                      + Add Attribute
                    </button>
                  </div>
                </div>
              ))}
            </Section>
          )}

          {/* Section 5: Product Media */}
          <Section title="Product Media" icon={ImageIcon}>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '12px' }}>
                Product Images
              </label>
              
              {/* Upload Area */}
              <label style={{
                display: 'block',
                padding: '40px',
                border: '2px dashed var(--border-color)',
                borderRadius: '12px',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s',
                backgroundColor: 'var(--bg-primary)'
              }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'var(--primary)';
                  e.currentTarget.style.backgroundColor = 'var(--primary-light)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--border-color)';
                  e.currentTarget.style.backgroundColor = 'var(--bg-primary)';
                }}
              >
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageUpload}
                  style={{ display: 'none' }}
                />
                <Upload size={40} color="var(--text-secondary)" style={{ marginBottom: '12px' }} />
                <div style={{ fontWeight: '700', color: 'var(--text-primary)', marginBottom: '4px' }}>
                  Drop images here or click to upload
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Supports: JPG, PNG, WebP (Max 5MB each)
                </div>
              </label>
            </div>

            {/* Image Gallery */}
            {formData.images.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '12px' }}>
                {formData.images.map((img, index) => (
                  <div key={index} style={{
                    position: 'relative',
                    aspectRatio: '1',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    border: formData.primaryImage === img ? '3px solid var(--primary)' : '2px solid var(--border-color)',
                    cursor: 'pointer'
                  }}>
                    <img
                      src={img}
                      alt={`Product ${index + 1}`}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    <button
                      onClick={() => removeImage(index)}
                      style={{
                        position: 'absolute',
                        top: '8px',
                        right: '8px',
                        padding: '6px',
                        backgroundColor: 'rgba(239, 68, 68, 0.9)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer'
                      }}
                    >
                      <X size={14} />
                    </button>
                    {formData.primaryImage === img && (
                      <div style={{
                        position: 'absolute',
                        bottom: '0',
                        left: '0',
                        right: '0',
                        padding: '6px',
                        backgroundColor: 'var(--primary)',
                        color: 'white',
                        textAlign: 'center',
                        fontSize: '11px',
                        fontWeight: '700'
                      }}>
                        Primary
                      </div>
                    )}
                    <button
                      onClick={() => setFormData({ ...formData, primaryImage: img })}
                      style={{
                        position: 'absolute',
                        bottom: '0',
                        left: '0',
                        right: '0',
                        padding: '6px',
                        backgroundColor: formData.primaryImage === img ? 'transparent' : 'rgba(0,0,0,0.7)',
                        color: formData.primaryImage === img ? 'white' : 'white',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '11px',
                        fontWeight: '600',
                        opacity: formData.primaryImage === img ? 1 : 0
                      }}
                      onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                      onMouseLeave={e => {
                        if (formData.primaryImage !== img) e.currentTarget.style.opacity = '0';
                      }}
                    >
                      {formData.primaryImage === img ? '✓ Primary' : 'Set as Primary'}
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop: '20px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                Video URL (YouTube/Vimeo)
              </label>
              <input
                type="url"
                value={formData.videoUrl || ''}
                onChange={(e) => setFormData({ ...formData, videoUrl: e.target.value })}
                placeholder="https://youtube.com/watch?v=..."
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  backgroundColor: 'var(--input-bg)',
                  color: 'var(--text-primary)',
                  fontSize: '14px',
                  outline: 'none'
                }}
              />
            </div>
          </Section>

          {/* Section 6: Product Description */}
          <Section title="Product Description" icon={MessageSquare}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                  Short Description
                </label>
                <textarea
                  value={formData.shortDescription}
                  onChange={(e) => setFormData({ ...formData, shortDescription: e.target.value })}
                  placeholder="Brief description for product cards and listings..."
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    backgroundColor: 'var(--input-bg)',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    outline: 'none',
                    resize: 'vertical'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                  Full Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Detailed product description with features, benefits, and specifications..."
                  rows={8}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    backgroundColor: 'var(--input-bg)',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    outline: 'none',
                    resize: 'vertical',
                    fontFamily: 'inherit'
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                    Ingredients
                  </label>
                  <textarea
                    value={formData.ingredients || ''}
                    onChange={(e) => setFormData({ ...formData, ingredients: e.target.value })}
                    placeholder="List of ingredients..."
                    rows={3}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      backgroundColor: 'var(--input-bg)',
                      color: 'var(--text-primary)',
                      fontSize: '14px',
                      outline: 'none',
                      resize: 'vertical'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                    Storage Instructions
                  </label>
                  <textarea
                    value={formData.storageInstructions || ''}
                    onChange={(e) => setFormData({ ...formData, storageInstructions: e.target.value })}
                    placeholder="How to store this product..."
                    rows={3}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      backgroundColor: 'var(--input-bg)',
                      color: 'var(--text-primary)',
                      fontSize: '14px',
                      outline: 'none',
                      resize: 'vertical'
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                    Country of Origin
                  </label>
                  <input
                    type="text"
                    value={formData.countryOfOrigin}
                    onChange={(e) => setFormData({ ...formData, countryOfOrigin: e.target.value })}
                    placeholder="Pakistan"
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      backgroundColor: 'var(--input-bg)',
                      color: 'var(--text-primary)',
                      fontSize: '14px',
                      outline: 'none'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                    Shelf Life
                  </label>
                  <input
                    type="text"
                    value={formData.shelfLife || ''}
                    onChange={(e) => setFormData({ ...formData, shelfLife: e.target.value })}
                    placeholder="e.g., 12 months"
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      backgroundColor: 'var(--input-bg)',
                      color: 'var(--text-primary)',
                      fontSize: '14px',
                      outline: 'none'
                    }}
                  />
                </div>
              </div>
            </div>
          </Section>

          {/* Section 7: SEO */}
          <Section title="SEO Settings" icon={Globe} defaultOpen={false}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                  SEO Title
                </label>
                <input
                  type="text"
                  value={formData.seoTitle || ''}
                  onChange={(e) => setFormData({ ...formData, seoTitle: e.target.value })}
                  placeholder={formData.name || 'Product SEO Title'}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    backgroundColor: 'var(--input-bg)',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                />
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px' }}>
                  Recommended: 50-60 characters
                </p>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                  Meta Description
                </label>
                <textarea
                  value={formData.metaDescription || ''}
                  onChange={(e) => setFormData({ ...formData, metaDescription: e.target.value })}
                  placeholder="Product meta description for search engines..."
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    backgroundColor: 'var(--input-bg)',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    outline: 'none',
                    resize: 'vertical'
                  }}
                />
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px' }}>
                  Recommended: 150-160 characters
                </p>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                  Keywords (comma separated)
                </label>
                <input
                  type="text"
                  value={formData.keywords || ''}
                  onChange={(e) => setFormData({ ...formData, keywords: e.target.value })}
                  placeholder="dry fruits, organic, almonds, premium"
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    backgroundColor: 'var(--input-bg)',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                />
              </div>
            </div>
          </Section>

          {/* Section 8: Visibility & Publishing */}
          <Section title="Visibility & Publishing" icon={Eye} defaultOpen={false}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
                <label style={{
                  padding: '16px',
                  border: formData.isFeatured ? '2px solid var(--primary)' : '1px solid var(--border-color)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  textAlign: 'center',
                  backgroundColor: formData.isFeatured ? 'var(--primary-light)' : 'transparent'
                }}>
                  <input
                    type="checkbox"
                    checked={formData.isFeatured}
                    onChange={(e) => setFormData({ ...formData, isFeatured: e.target.checked })}
                    style={{ display: 'none' }}
                  />
                  <div style={{ fontWeight: '700', marginBottom: '4px' }}>⭐ Featured Product</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Show on homepage</div>
                </label>

                <label style={{
                  padding: '16px',
                  border: formData.isNewArrival ? '2px solid var(--primary)' : '1px solid var(--border-color)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  textAlign: 'center',
                  backgroundColor: formData.isNewArrival ? 'var(--primary-light)' : 'transparent'
                }}>
                  <input
                    type="checkbox"
                    checked={formData.isNewArrival}
                    onChange={(e) => setFormData({ ...formData, isNewArrival: e.target.checked })}
                    style={{ display: 'none' }}
                  />
                  <div style={{ fontWeight: '700', marginBottom: '4px' }}>🆕 New Arrival</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Mark as new product</div>
                </label>

                <label style={{
                  padding: '16px',
                  border: formData.isBestSeller ? '2px solid var(--primary)' : '1px solid var(--border-color)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  textAlign: 'center',
                  backgroundColor: formData.isBestSeller ? 'var(--primary-light)' : 'transparent'
                }}>
                  <input
                    type="checkbox"
                    checked={formData.isBestSeller}
                    onChange={(e) => setFormData({ ...formData, isBestSeller: e.target.checked })}
                    style={{ display: 'none' }}
                  />
                  <div style={{ fontWeight: '700', marginBottom: '4px' }}>🏆 Best Seller</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Top selling product</div>
                </label>

                <label style={{
                  padding: '16px',
                  border: formData.isTrending ? '2px solid var(--primary)' : '1px solid var(--border-color)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  textAlign: 'center',
                  backgroundColor: formData.isTrending ? 'var(--primary-light)' : 'transparent'
                }}>
                  <input
                    type="checkbox"
                    checked={formData.isTrending}
                    onChange={(e) => setFormData({ ...formData, isTrending: e.target.checked })}
                    style={{ display: 'none' }}
                  />
                  <div style={{ fontWeight: '700', marginBottom: '4px' }}>📈 Trending</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Trending product</div>
                </label>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                  Publish Status
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as 'draft' | 'published' | 'scheduled' })}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    backgroundColor: 'var(--input-bg)',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                  <option value="scheduled">Scheduled</option>
                </select>
              </div>

              {formData.status === 'scheduled' && (
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                    Publish Date & Time
                  </label>
                  <input
                    type="datetime-local"
                    value={formData.publishDate || ''}
                    onChange={(e) => setFormData({ ...formData, publishDate: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      backgroundColor: 'var(--input-bg)',
                      color: 'var(--text-primary)',
                      fontSize: '14px',
                      outline: 'none'
                    }}
                  />
                </div>
              )}
            </div>
          </Section>
        </div>

        {/* Right Column - Preview & Quick Actions */}
        <div style={{ position: 'sticky', top: '100px' }}>
          {/* Live Preview Card */}
          <div style={{
            backgroundColor: 'var(--card-bg)',
            borderRadius: '12px',
            padding: '24px',
            border: '1px solid var(--border-color)',
            marginBottom: '24px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
          }}>
            <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Eye size={18} color="var(--primary)" /> Live Preview
            </h3>

            <div style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              overflow: 'hidden',
              border: '1px solid var(--border-color)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
            }}>
              {/* Preview Image */}
              <div style={{ height: '200px', backgroundColor: 'var(--bg-primary)', position: 'relative' }}>
                {formData.primaryImage ? (
                  <img src={formData.primaryImage} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{
                    width: '100%', height: '100%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--text-secondary)', fontSize: '14px'
                  }}>
                    No Image
                  </div>
                )}
                {formData.isFeatured && (
                  <div style={{
                    position: 'absolute', top: '12px', left: '12px',
                    backgroundColor: '#F59E0B', color: 'white',
                    padding: '6px 12px', borderRadius: '6px',
                    fontSize: '11px', fontWeight: '700'
                  }}>
                    ⭐ Featured
                  </div>
                )}
              </div>

              {/* Preview Content */}
              <div style={{ padding: '16px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600', textTransform: 'uppercase' }}>
                  {categories.find(c => c._id === formData.category)?.name || 'Category'}
                </div>
                <h4 style={{
                  fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)',
                  marginBottom: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                }}>
                  {formData.name || 'Product Name'}
                </h4>
                
                {formData.brand && (
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                    Brand: {brands.find(b => b._id === formData.brand)?.name}
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '12px' }}>
                  <span style={{ fontSize: '20px', fontWeight: '800', color: 'var(--primary)' }}>
                    Rs. {formData.price.toLocaleString()}
                  </span>
                  {formData.originalPrice && formData.originalPrice > formData.price && (
                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)', textDecoration: 'line-through' }}>
                      Rs. {formData.originalPrice.toLocaleString()}
                    </span>
                  )}
                </div>

                {formData.stock > 0 ? (
                  <div style={{
                    padding: '6px 12px',
                    backgroundColor: '#D1FAE5',
                    color: '#0F766E',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: '600',
                    textAlign: 'center'
                  }}>
                    ✓ In Stock ({formData.stock} units)
                  </div>
                ) : (
                  <div style={{
                    padding: '6px 12px',
                    backgroundColor: '#FEE2E2',
                    color: '#DC2626',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: '600',
                    textAlign: 'center'
                  }}>
                    ✗ Out of Stock
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Quick Stats */}
          <div style={{
            backgroundColor: 'var(--card-bg)',
            borderRadius: '12px',
            padding: '20px',
            border: '1px solid var(--border-color)',
            marginBottom: '24px'
          }}>
            <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '16px' }}>
              Quick Stats
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Images</span>
                <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>{formData.images.length}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Variants</span>
                <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>{formData.variants.length}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Discount</span>
                <span style={{ fontSize: '13px', fontWeight: '700', color: discount > 0 ? '#10B981' : 'var(--text-primary)' }}>
                  {discount > 0 ? `${discount}%` : 'None'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Status</span>
                <span style={{
                  padding: '4px 12px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: '700',
                  backgroundColor: formData.status === 'published' ? '#D1FAE5' : formData.status === 'scheduled' ? '#FEF3C7' : '#F3F4F6',
                  color: formData.status === 'published' ? '#0F766E' : formData.status === 'scheduled' ? '#92400E' : '#6B7280'
                }}>
                  {formData.status.charAt(0).toUpperCase() + formData.status.slice(1)}
                </span>
              </div>
            </div>
          </div>

          {/* Help & Support */}
          <div style={{
            backgroundColor: '#F0FDFA',
            borderRadius: '12px',
            padding: '20px',
            border: '1px solid #0F766E'
          }}>
            <h3 style={{ fontSize: '14px', fontWeight: '700', color: '#0F766E', marginBottom: '12px' }}>
              💡 Need Help?
            </h3>
            <p style={{ fontSize: '13px', color: '#0F766E', marginBottom: '16px', lineHeight: '1.5' }}>
              Check our documentation for detailed guides on adding products with variants.
            </p>
            <button
              onClick={() => window.open('/docs/products', '_blank')}
              style={{
                width: '100%',
                padding: '10px',
                backgroundColor: '#0F766E',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontWeight: '700',
                cursor: 'pointer',
                fontSize: '13px'
              }}
            >
              View Documentation
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}