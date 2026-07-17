'use client';

import { useState, useEffect } from 'react';
import { 
  Star, Search, Trash2, Eye, CheckCircle, XCircle,
  AlertCircle, MessageSquare, Loader, Flag,
  ChevronLeft, ChevronRight, X, ThumbsUp, User
} from 'lucide-react';
import api from '@/lib/api';

interface Review {
  _id: string;
  product: {
    _id: string;
    name: string;
    slug?: string;
    images?: string[];
  };
  user: {
    _id: string;
    fullName: string;
    email: string;
  };
  rating: number;
  title?: string;
  comment: string;
  isVerified: boolean;
  isApproved: boolean;
  isFlagged: boolean;
  helpfulCount: number;
  createdAt: string;
}

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'approved' | 'pending' | 'flagged'>('all');
  const [ratingFilter, setRatingFilter] = useState<'all' | '5' | '4' | '3' | '2' | '1'>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedReview, setSelectedReview] = useState<Review | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    fetchReviews();
  }, [page, filterType, ratingFilter]);

  const fetchReviews = async () => {
    setLoading(true);
    try {
      const params: any = { page, limit: 15 };
      if (filterType !== 'all') {
        if (filterType === 'approved') params.isApproved = true;
        else if (filterType === 'pending') params.isApproved = false;
        else if (filterType === 'flagged') params.isFlagged = true;
      }
      if (ratingFilter !== 'all') params.rating = ratingFilter;
      if (searchQuery) params.search = searchQuery;

      const response = await api.get('/reviews', { params });
      if (response.data.success) {
        setReviews(response.data.data);
        setTotalPages(response.data.pagination?.pages || 1);
      }
    } catch (error) {
      console.error('Error fetching reviews:', error);
      // Fallback mock data for development
      setReviews([]);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id: string) => {
    setActionLoading(id);
    try {
      await api.put(`/reviews/${id}`, { isApproved: true });
      await fetchReviews();
    } catch (error) {
      console.error('Error approving review:', error);
      alert('Failed to approve review');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (id: string) => {
    setActionLoading(id);
    try {
      await api.put(`/reviews/${id}`, { isApproved: false });
      await fetchReviews();
    } catch (error) {
      console.error('Error rejecting review:', error);
      alert('Failed to reject review');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this review? This cannot be undone.')) return;
    setActionLoading(id);
    try {
      await api.delete(`/reviews/${id}`);
      await fetchReviews();
    } catch (error) {
      console.error('Error deleting review:', error);
      alert('Failed to delete review');
    } finally {
      setActionLoading(null);
    }
  };

  const handleFlagToggle = async (id: string, currentFlagged: boolean) => {
    setActionLoading(id);
    try {
      await api.put(`/reviews/${id}`, { isFlagged: !currentFlagged });
      await fetchReviews();
    } catch (error) {
      console.error('Error toggling flag:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const filteredReviews = reviews.filter(review => {
    const matchesSearch = !searchQuery ||
      review.product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      review.user.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      review.comment.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const stats = {
    total: reviews.length,
    approved: reviews.filter(r => r.isApproved).length,
    pending: reviews.filter(r => !r.isApproved && !r.isFlagged).length,
    flagged: reviews.filter(r => r.isFlagged).length,
    averageRating: reviews.length > 0 
      ? (reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length).toFixed(1) 
      : '0'
  };

  const renderStars = (rating: number, size = 16) => {
    return (
      <div style={{ display: 'flex', gap: '2px' }}>
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            size={size}
            fill={star <= rating ? '#F59E0B' : 'none'}
            color={star <= rating ? '#F59E0B' : '#D1D5DB'}
          />
        ))}
      </div>
    );
  };

  const getStatusBadge = (review: Review) => {
    if (review.isFlagged) return { text: 'Flagged', color: '#DC2626', bg: '#FEE2E2', icon: Flag };
    if (review.isApproved) return { text: 'Approved', color: '#0F766E', bg: '#D1FAE5', icon: CheckCircle };
    return { text: 'Pending', color: '#92400E', bg: '#FEF3C7', icon: AlertCircle };
  };

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '8px', letterSpacing: '-0.5px' }}>
          Reviews & Ratings
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>
          Moderate customer reviews, manage ratings, and maintain quality.
        </p>
      </div>

      {/* Stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
        marginBottom: '24px'
      }}>
        <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '10px', backgroundColor: '#DBEAFE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MessageSquare size={24} color="#3B82F6" />
          </div>
          <div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '500', marginBottom: '4px' }}>Total Reviews</div>
            <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>{stats.total}</div>
          </div>
        </div>

        <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '10px', backgroundColor: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CheckCircle size={24} color="#10B981" />
          </div>
          <div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '500', marginBottom: '4px' }}>Approved</div>
            <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>{stats.approved}</div>
          </div>
        </div>

        <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '10px', backgroundColor: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AlertCircle size={24} color="#F59E0B" />
          </div>
          <div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '500', marginBottom: '4px' }}>Pending</div>
            <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>{stats.pending}</div>
          </div>
        </div>

        <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '10px', backgroundColor: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Flag size={24} color="#EF4444" />
          </div>
          <div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '500', marginBottom: '4px' }}>Flagged</div>
            <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>{stats.flagged}</div>
          </div>
        </div>

        <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '10px', backgroundColor: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Star size={24} color="#F59E0B" />
          </div>
          <div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '500', marginBottom: '4px' }}>Avg Rating</div>
            <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>{stats.averageRating} ⭐</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div style={{
        backgroundColor: 'var(--card-bg)',
        borderRadius: '12px',
        padding: '16px 20px',
        border: '1px solid var(--border-color)',
        marginBottom: '24px',
        display: 'flex',
        gap: '12px',
        flexWrap: 'wrap',
        alignItems: 'center'
      }}>
        <div style={{ flex: 1, minWidth: '280px', position: 'relative' }}>
          <Search size={18} color="var(--text-secondary)" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            placeholder="Search by product, customer, or comment..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 14px 10px 42px',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--input-bg)',
              color: 'var(--text-primary)',
              fontSize: '14px',
              outline: 'none'
            }}
          />
        </div>

        <select
          value={filterType}
          onChange={(e) => { setFilterType(e.target.value as any); setPage(1); }}
          style={{
            padding: '10px 32px 10px 14px',
            borderRadius: '8px',
            border: '1px solid var(--border-color)',
            backgroundColor: 'var(--input-bg)',
            color: 'var(--text-primary)',
            fontSize: '14px',
            fontWeight: '500',
            outline: 'none',
            cursor: 'pointer'
          }}
        >
          <option value="all">All Reviews</option>
          <option value="approved">Approved</option>
          <option value="pending">Pending</option>
          <option value="flagged">Flagged</option>
        </select>

        <select
          value={ratingFilter}
          onChange={(e) => { setRatingFilter(e.target.value as any); setPage(1); }}
          style={{
            padding: '10px 32px 10px 14px',
            borderRadius: '8px',
            border: '1px solid var(--border-color)',
            backgroundColor: 'var(--input-bg)',
            color: 'var(--text-primary)',
            fontSize: '14px',
            fontWeight: '500',
            outline: 'none',
            cursor: 'pointer'
          }}
        >
          <option value="all">All Ratings</option>
          <option value="5">5 Stars</option>
          <option value="4">4 Stars</option>
          <option value="3">3 Stars</option>
          <option value="2">2 Stars</option>
          <option value="1">1 Star</option>
        </select>
      </div>

      {/* Reviews List */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[...Array(5)].map((_, i) => (
            <div key={i} style={{
              backgroundColor: 'var(--card-bg)',
              borderRadius: '12px',
              height: '140px',
              animation: 'pulse 1.5s infinite',
              border: '1px solid var(--border-color)'
            }} />
          ))}
        </div>
      ) : filteredReviews.length === 0 ? (
        <div style={{
          backgroundColor: 'var(--card-bg)',
          borderRadius: '12px',
          padding: '80px 20px',
          textAlign: 'center',
          border: '1px solid var(--border-color)',
          borderStyle: 'dashed'
        }}>
          <MessageSquare size={48} color="var(--text-secondary)" style={{ opacity: 0.3, marginBottom: '16px' }} />
          <h3 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px' }}>
            No reviews found
          </h3>
          <p style={{ color: 'var(--text-secondary)' }}>Reviews will appear here once customers start leaving feedback</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {filteredReviews.map((review) => {
            const status = getStatusBadge(review);
            const StatusIcon = status.icon;
            
            return (
              <div
                key={review._id}
                style={{
                  backgroundColor: 'var(--card-bg)',
                  borderRadius: '12px',
                  border: '1px solid var(--border-color)',
                  padding: '24px',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.06)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                  {/* Product Image */}
                  <div style={{
                    width: '100px',
                    height: '100px',
                    borderRadius: '10px',
                    overflow: 'hidden',
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border-color)',
                    flexShrink: 0
                  }}>
                    <img 
                      src={review.product.images?.[0] || 'https://via.placeholder.com/100x100?text=Product'} 
                      alt={review.product.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  </div>

                  {/* Review Content */}
                  <div style={{ flex: 1, minWidth: '280px' }}>
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px', flexWrap: 'wrap', gap: '12px' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                          {renderStars(review.rating)}
                          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                            {new Date(review.createdAt).toLocaleDateString()}
                          </span>
                          {review.isVerified && (
                            <span style={{
                              padding: '3px 10px',
                              backgroundColor: '#DBEAFE',
                              color: '#1E40AF',
                              borderRadius: '12px',
                              fontSize: '11px',
                              fontWeight: '700',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}>
                              <CheckCircle size={10} /> Verified
                            </span>
                          )}
                        </div>
                        <div style={{ fontWeight: '700', color: 'var(--text-primary)', fontSize: '15px', marginBottom: '4px' }}>
                          {review.product.name}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                          <User size={14} />
                          {review.user.fullName}
                          {review.user.email && (
                            <span style={{ fontSize: '12px' }}>• {review.user.email}</span>
                          )}
                        </div>
                      </div>

                      <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 12px',
                        backgroundColor: status.bg,
                        color: status.color,
                        borderRadius: '20px',
                        fontSize: '12px',
                        fontWeight: '700'
                      }}>
                        <StatusIcon size={14} />
                        {status.text}
                      </div>
                    </div>

                    {/* Title */}
                    {review.title && (
                      <div style={{ fontWeight: '700', color: 'var(--text-primary)', fontSize: '14px', marginBottom: '6px' }}>
                        {review.title}
                      </div>
                    )}

                    {/* Comment */}
                    <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.6', marginBottom: '12px' }}>
                      {review.comment}
                    </p>

                    {/* Helpful Count */}
                    {review.helpfulCount > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                        <ThumbsUp size={12} />
                        {review.helpfulCount} people found this helpful
                      </div>
                    )}

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => { setSelectedReview(review); setShowDetails(true); }}
                        style={{
                          padding: '8px 14px',
                          backgroundColor: 'var(--bg-primary)',
                          color: 'var(--primary)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: '600',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        <Eye size={14} /> View
                      </button>

                      {!review.isApproved && (
                        <button
                          onClick={() => handleApprove(review._id)}
                          disabled={actionLoading === review._id}
                          style={{
                            padding: '8px 14px',
                            backgroundColor: '#D1FAE5',
                            color: '#0F766E',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: actionLoading === review._id ? 'not-allowed' : 'pointer',
                            fontSize: '12px',
                            fontWeight: '600',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            opacity: actionLoading === review._id ? 0.6 : 1
                          }}
                        >
                          {actionLoading === review._id ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle size={14} />}
                          Approve
                        </button>
                      )}

                      {review.isApproved && (
                        <button
                          onClick={() => handleReject(review._id)}
                          disabled={actionLoading === review._id}
                          style={{
                            padding: '8px 14px',
                            backgroundColor: '#FEF3C7',
                            color: '#92400E',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: actionLoading === review._id ? 'not-allowed' : 'pointer',
                            fontSize: '12px',
                            fontWeight: '600',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            opacity: actionLoading === review._id ? 0.6 : 1
                          }}
                        >
                          <XCircle size={14} /> Unapprove
                        </button>
                      )}

                      <button
                        onClick={() => handleFlagToggle(review._id, review.isFlagged)}
                        disabled={actionLoading === review._id}
                        style={{
                          padding: '8px 14px',
                          backgroundColor: review.isFlagged ? '#FEE2E2' : 'var(--bg-primary)',
                          color: review.isFlagged ? '#DC2626' : 'var(--text-secondary)',
                          border: `1px solid ${review.isFlagged ? '#DC2626' : 'var(--border-color)'}`,
                          borderRadius: '8px',
                          cursor: actionLoading === review._id ? 'not-allowed' : 'pointer',
                          fontSize: '12px',
                          fontWeight: '600',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          opacity: actionLoading === review._id ? 0.6 : 1
                        }}
                      >
                        <Flag size={14} /> {review.isFlagged ? 'Unflag' : 'Flag'}
                      </button>

                      <button
                        onClick={() => handleDelete(review._id)}
                        disabled={actionLoading === review._id}
                        style={{
                          padding: '8px 14px',
                          backgroundColor: '#FEE2E2',
                          color: '#DC2626',
                          border: 'none',
                          borderRadius: '8px',
                          cursor: actionLoading === review._id ? 'not-allowed' : 'pointer',
                          fontSize: '12px',
                          fontWeight: '600',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          marginLeft: 'auto',
                          opacity: actionLoading === review._id ? 0.6 : 1
                        }}
                      >
                        {actionLoading === review._id ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={14} />}
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && !loading && filteredReviews.length > 0 && (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '8px',
          marginTop: '32px',
          padding: '20px',
          backgroundColor: 'var(--card-bg)',
          borderRadius: '12px',
          border: '1px solid var(--border-color)'
        }}>
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            style={{
              padding: '10px 16px',
              backgroundColor: page === 1 ? 'var(--bg-primary)' : 'var(--card-bg)',
              color: page === 1 ? 'var(--text-secondary)' : 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              cursor: page === 1 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '14px',
              fontWeight: '600'
            }}
          >
            <ChevronLeft size={16} /> Prev
          </button>

          <span style={{ padding: '10px 16px', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: '600' }}>
            Page {page} of {totalPages}
          </span>

          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            style={{
              padding: '10px 16px',
              backgroundColor: page === totalPages ? 'var(--bg-primary)' : 'var(--card-bg)',
              color: page === totalPages ? 'var(--text-secondary)' : 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              cursor: page === totalPages ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '14px',
              fontWeight: '600'
            }}
          >
            Next <ChevronRight size={16} />
          </button>
        </div>
      )}

      {/* Review Details Modal */}
      {showDetails && selectedReview && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
          }}
          onClick={() => setShowDetails(false)}
        >
          <div 
            style={{
              backgroundColor: 'var(--card-bg)',
              borderRadius: '16px',
              padding: '32px',
              maxWidth: '700px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
              <div style={{ display: 'flex', gap: '16px', flex: 1 }}>
                <div style={{
                  width: '80px',
                  height: '80px',
                  borderRadius: '10px',
                  overflow: 'hidden',
                  backgroundColor: 'var(--bg-primary)',
                  border: '1px solid var(--border-color)',
                  flexShrink: 0
                }}>
                  <img 
                    src={selectedReview.product.images?.[0] || 'https://via.placeholder.com/80x80'} 
                    alt={selectedReview.product.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </div>
                <div>
                  <h2 style={{ fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '8px' }}>
                    {selectedReview.product.name}
                  </h2>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    {renderStars(selectedReview.rating, 18)}
                    <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                      {new Date(selectedReview.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                    <User size={14} />
                    {selectedReview.user.fullName} • {selectedReview.user.email}
                  </div>
                </div>
              </div>
              <button onClick={() => setShowDetails(false)} style={{ padding: '8px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                <X size={24} />
              </button>
            </div>

            {selectedReview.title && (
              <div style={{
                padding: '16px',
                backgroundColor: 'var(--bg-primary)',
                borderRadius: '10px',
                marginBottom: '16px'
              }}>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600', textTransform: 'uppercase' }}>
                  Review Title
                </div>
                <div style={{ fontWeight: '700', color: 'var(--text-primary)', fontSize: '16px' }}>
                  {selectedReview.title}
                </div>
              </div>
            )}

            <div style={{
              padding: '16px',
              backgroundColor: 'var(--bg-primary)',
              borderRadius: '10px',
              marginBottom: '16px'
            }}>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600', textTransform: 'uppercase' }}>
                Review Comment
              </div>
              <p style={{ color: 'var(--text-primary)', fontSize: '14px', lineHeight: '1.7' }}>
                {selectedReview.comment}
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div style={{
                padding: '12px',
                backgroundColor: 'var(--bg-primary)',
                borderRadius: '10px'
              }}>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Status</div>
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 10px',
                  backgroundColor: getStatusBadge(selectedReview).bg,
                  color: getStatusBadge(selectedReview).color,
                  borderRadius: '12px',
                  fontSize: '12px',
                  fontWeight: '700'
                }}>
                  {getStatusBadge(selectedReview).text}
                </div>
              </div>
              <div style={{
                padding: '12px',
                backgroundColor: 'var(--bg-primary)',
                borderRadius: '10px'
              }}>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Helpful Votes</div>
                <div style={{ fontWeight: '700', color: 'var(--text-primary)', fontSize: '16px' }}>
                  {selectedReview.helpfulCount} 👍
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
              <button
                onClick={() => setShowDetails(false)}
                style={{
                  padding: '12px 24px',
                  backgroundColor: 'var(--card-bg)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '10px',
                  fontWeight: '700',
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
              {!selectedReview.isApproved && (
                <button
                  onClick={() => { handleApprove(selectedReview._id); setShowDetails(false); }}
                  style={{
                    padding: '12px 24px',
                    backgroundColor: '#D1FAE5',
                    color: '#0F766E',
                    border: 'none',
                    borderRadius: '10px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <CheckCircle size={18} /> Approve
                </button>
              )}
              <button
                onClick={() => { handleDelete(selectedReview._id); setShowDetails(false); }}
                style={{
                  padding: '12px 24px',
                  backgroundColor: '#FEE2E2',
                  color: '#DC2626',
                  border: 'none',
                  borderRadius: '10px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <Trash2 size={18} /> Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}