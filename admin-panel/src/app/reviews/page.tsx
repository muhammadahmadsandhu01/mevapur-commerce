'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Star, Search, Trash2, Eye, CheckCircle, XCircle,
  AlertCircle, MessageSquare, Loader, Flag,
  ChevronLeft, ChevronRight, X, User, CornerDownRight
} from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { PRODUCT_PLACEHOLDER } from '@/lib/placeholder';

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
  status: 'pending' | 'approved' | 'rejected' | 'flagged' | 'withdrawn';
  isVerifiedPurchase: boolean;
  isApproved: boolean;
  isFlagged: boolean;
  reportReason?: string;
  adminReply?: string;
  repliedAt?: string;
  helpfulCount: number;
  createdAt: string;
}

interface ReviewStats {
  total: number;
  approved: number;
  pending: number;
  rejected: number;
  flagged: number;
  withdrawn: number;
  averageRating: string;
}

export default function ReviewsPage() {
  const { user } = useAuthStore();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'pending' | 'approved' | 'rejected' | 'flagged' | 'withdrawn'>('all');
  const [ratingFilter, setRatingFilter] = useState<'all' | '5' | '4' | '3' | '2' | '1'>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedReview, setSelectedReview] = useState<Review | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showReplyModal, setShowReplyModal] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [globalStats, setGlobalStats] = useState<ReviewStats>({
    total: 0,
    approved: 0,
    pending: 0,
    rejected: 0,
    flagged: 0,
    withdrawn: 0,
    averageRating: '0.0'
  });

  const canModerate = ['manager', 'admin', 'super_admin'].includes(user?.role || '');
  const canDelete = ['admin', 'super_admin'].includes(user?.role || '');
  const isSuperAdmin = user?.role === 'super_admin';

  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get('/reviews/stats');
      if (res.data?.success && res.data?.data) {
        setGlobalStats(res.data.data);
      }
    } catch (err) {
      console.error('Failed to load review stats:', err);
    }
  }, []);

  const fetchReviews = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = {
        page,
        limit: 15
      };
      if (filterType !== 'all') {
        params.status = filterType;
      }
      if (ratingFilter !== 'all') {
        params.rating = ratingFilter;
      }
      if (searchQuery.trim()) {
        params.search = searchQuery.trim();
      }

      const response = await api.get('/reviews', { params });
      if (response.data.success) {
        setReviews(response.data.data || []);
        setTotalPages(response.data.pagination?.pages || 1);
      }
    } catch (error) {
      console.error('Error fetching reviews:', error);
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }, [page, filterType, ratingFilter, searchQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchStats();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchStats]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchReviews();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchReviews]);

  const handleApprove = async (id: string) => {
    if (!canModerate) return;
    setActionLoading(id);
    try {
      await api.patch(`/reviews/${id}/approve`);
      await Promise.all([fetchReviews(), fetchStats()]);
      if (selectedReview?._id === id) {
        setSelectedReview((prev) => (prev ? { ...prev, status: 'approved', isApproved: true, isFlagged: false } : null));
      }
    } catch (error) {
      console.error('Error approving review:', error);
      alert('Failed to approve review');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (id: string) => {
    if (!canModerate) return;
    const reason = prompt('Please provide a reason for rejecting this review:');
    if (reason === null) return;

    setActionLoading(id);
    try {
      await api.patch(`/reviews/${id}/reject`, { reason });
      await Promise.all([fetchReviews(), fetchStats()]);
      if (selectedReview?._id === id) {
        setSelectedReview((prev) => (prev ? { ...prev, status: 'rejected', isApproved: false } : null));
      }
    } catch (error) {
      console.error('Error rejecting review:', error);
      alert('Failed to reject review');
    } finally {
      setActionLoading(null);
    }
  };

  const handleFlag = async (id: string) => {
    if (!canModerate) return;
    const reason = prompt('Please provide a reason for flagging this review:');
    if (reason === null) return;

    setActionLoading(id);
    try {
      await api.patch(`/reviews/${id}/flag`, { reason });
      await Promise.all([fetchReviews(), fetchStats()]);
      if (selectedReview?._id === id) {
        setSelectedReview((prev) => (prev ? { ...prev, status: 'flagged', isFlagged: true, isApproved: false } : null));
      }
    } catch (error) {
      console.error('Error flagging review:', error);
      alert('Failed to flag review');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReplySubmit = async () => {
    if (!selectedReview || !replyText.trim() || !canModerate) return;
    setActionLoading(selectedReview._id);
    try {
      await api.patch(`/reviews/${selectedReview._id}/reply`, { reply: replyText.trim() });
      setShowReplyModal(false);
      setReplyText('');
      await fetchReviews();
      if (selectedReview) {
        setSelectedReview((prev) => (prev ? { ...prev, adminReply: replyText.trim(), repliedAt: new Date().toISOString() } : null));
      }
    } catch (error) {
      console.error('Error replying to review:', error);
      alert('Failed to submit reply');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!canDelete) return;
    const isErase = isSuperAdmin && confirm('Perform permanent legal hard-erasure for this review? Click Cancel to perform standard deletion/rejection.');
    setActionLoading(id);
    try {
      if (isErase) {
        const legalReason = prompt('Enter the compliance/legal justification for permanent erasure:');
        if (!legalReason) {
          setActionLoading(null);
          return;
        }
        await api.delete(`/reviews/${id}/exceptional-erase`, { data: { legalReason } });
      } else {
        if (!confirm('Are you sure you want to remove this review?')) {
          setActionLoading(null);
          return;
        }
        await api.delete(`/reviews/${id}`);
      }
      setShowDetails(false);
      await Promise.all([fetchReviews(), fetchStats()]);
    } catch (error) {
      console.error('Error deleting review:', error);
      alert('Failed to delete review');
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusBadge = (review: Review) => {
    switch (review.status) {
      case 'approved':
        return { text: 'Approved', color: 'var(--success-text)', bg: 'rgba(22, 163, 74, 0.12)', icon: CheckCircle };
      case 'rejected':
        return { text: 'Rejected', color: 'var(--danger-text)', bg: 'rgba(220, 38, 38, 0.12)', icon: XCircle };
      case 'flagged':
        return { text: 'Flagged', color: 'var(--danger-text)', bg: 'rgba(220, 38, 38, 0.1)', icon: Flag };
      case 'withdrawn':
        return { text: 'Withdrawn', color: 'var(--text-secondary)', bg: 'rgba(107, 114, 128, 0.12)', icon: AlertCircle };
      case 'pending':
      default:
        return { text: 'Pending', color: 'var(--warning-text)', bg: 'rgba(245, 158, 11, 0.12)', icon: AlertCircle };
    }
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

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '8px', letterSpacing: '-0.5px' }}>
          Reviews Moderation
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>
          Moderate customer reviews, track verified purchases, and manage authoritative product rating projections.
        </p>
      </div>

      {/* Global Stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '16px',
        marginBottom: '24px'
      }}>
        <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '12px', padding: '18px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '10px', backgroundColor: 'var(--info-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MessageSquare size={22} color="var(--info-text)" />
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '500', marginBottom: '2px' }}>Total Reviews</div>
            <div style={{ fontSize: '22px', fontWeight: '800', color: 'var(--text-primary)' }}>{globalStats.total}</div>
          </div>
        </div>

        <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '12px', padding: '18px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '10px', backgroundColor: 'rgba(22, 163, 74, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CheckCircle size={22} color="var(--success-text)" />
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '500', marginBottom: '2px' }}>Approved</div>
            <div style={{ fontSize: '22px', fontWeight: '800', color: 'var(--text-primary)' }}>{globalStats.approved}</div>
          </div>
        </div>

        <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '12px', padding: '18px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '10px', backgroundColor: 'rgba(245, 158, 11, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AlertCircle size={22} color="var(--warning-text)" />
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '500', marginBottom: '2px' }}>Pending</div>
            <div style={{ fontSize: '22px', fontWeight: '800', color: 'var(--text-primary)' }}>{globalStats.pending}</div>
          </div>
        </div>

        <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '12px', padding: '18px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '10px', backgroundColor: 'rgba(220, 38, 38, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Flag size={22} color="var(--danger-text)" />
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '500', marginBottom: '2px' }}>Flagged</div>
            <div style={{ fontSize: '22px', fontWeight: '800', color: 'var(--text-primary)' }}>{globalStats.flagged}</div>
          </div>
        </div>

        <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '12px', padding: '18px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '10px', backgroundColor: 'var(--warning-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Star size={22} color="#F59E0B" />
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '500', marginBottom: '2px' }}>Avg Rating</div>
            <div style={{ fontSize: '22px', fontWeight: '800', color: 'var(--text-primary)' }}>{globalStats.averageRating} ⭐</div>
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
          <Search size={18} color="var(--text-secondary)" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          <input
            id="reviews-search-input"
            type="search"
            aria-label="Search reviews by product, customer, or comment"
            placeholder="Search by product, customer, or comment..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
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
          aria-label="Filter reviews by canonical status"
          value={filterType}
          onChange={(e) => {
            setFilterType(e.target.value as typeof filterType);
            setPage(1);
          }}
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
          <option value="all">All Statuses</option>
          <option value="pending">Pending Moderation</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="flagged">Flagged / Quarantined</option>
          <option value="withdrawn">Customer Withdrawn</option>
        </select>

        <select
          aria-label="Filter reviews by star rating"
          value={ratingFilter}
          onChange={(e) => {
            setRatingFilter(e.target.value as typeof ratingFilter);
            setPage(1);
          }}
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
      ) : reviews.length === 0 ? (
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
          <p style={{ color: 'var(--text-secondary)' }}>No reviews match your current filter criteria</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {reviews.map((review) => {
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
                      src={review.product?.images?.[0] || PRODUCT_PLACEHOLDER}
                      alt={review.product?.name || 'Product'}
                      onError={(e) => { (e.currentTarget as HTMLImageElement).src = PRODUCT_PLACEHOLDER; }}
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
                          {review.isVerifiedPurchase && (
                            <span style={{
                              padding: '3px 10px',
                              backgroundColor: 'rgba(22, 163, 74, 0.12)',
                              color: 'var(--success-text)',
                              borderRadius: '12px',
                              fontSize: '11px',
                              fontWeight: '700',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}>
                              <CheckCircle size={11} /> Verified Purchase
                            </span>
                          )}
                        </div>
                        <div style={{ fontWeight: '700', color: 'var(--text-primary)', fontSize: '15px', marginBottom: '4px' }}>
                          {review.product?.name || 'Product'}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                          <User size={14} />
                          {review.user?.fullName || 'Customer'}
                          {review.user?.email && (
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

                    {/* Admin Reply preview if exists */}
                    {review.adminReply && (
                      <div style={{
                        padding: '10px 14px',
                        backgroundColor: 'var(--bg-primary)',
                        borderRadius: '8px',
                        borderLeft: '3px solid var(--accent-color, #4F46E5)',
                        marginBottom: '12px',
                        fontSize: '13px'
                      }}>
                        <div style={{ fontWeight: '600', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                          <CornerDownRight size={14} /> Store Management Reply:
                        </div>
                        <div style={{ color: 'var(--text-secondary)' }}>{review.adminReply}</div>
                      </div>
                    )}

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => { setSelectedReview(review); setShowDetails(true); }}
                        style={{
                          padding: '8px 14px',
                          backgroundColor: 'var(--bg-primary)',
                          color: 'var(--accent-text)',
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
                        <Eye size={14} /> View Details
                      </button>

                      {canModerate && (
                        <>
                          {review.status !== 'approved' && review.status !== 'withdrawn' && (
                            <button
                              onClick={() => handleApprove(review._id)}
                              disabled={actionLoading === review._id}
                              style={{
                                padding: '8px 14px',
                                backgroundColor: 'rgba(22, 163, 74, 0.12)',
                                color: 'var(--success-text)',
                                border: 'none',
                                borderRadius: '8px',
                                cursor: actionLoading === review._id ? 'not-allowed' : 'pointer',
                                fontSize: '12px',
                                fontWeight: '600',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                              }}
                            >
                              {actionLoading === review._id ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle size={14} />}
                              Approve
                            </button>
                          )}

                          {review.status !== 'rejected' && review.status !== 'withdrawn' && (
                            <button
                              onClick={() => handleReject(review._id)}
                              disabled={actionLoading === review._id}
                              style={{
                                padding: '8px 14px',
                                backgroundColor: 'rgba(220, 38, 38, 0.12)',
                                color: 'var(--danger-text)',
                                border: 'none',
                                borderRadius: '8px',
                                cursor: actionLoading === review._id ? 'not-allowed' : 'pointer',
                                fontSize: '12px',
                                fontWeight: '600',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                              }}
                            >
                              <XCircle size={14} /> Reject
                            </button>
                          )}

                          {review.status !== 'flagged' && review.status !== 'withdrawn' && (
                            <button
                              onClick={() => handleFlag(review._id)}
                              disabled={actionLoading === review._id}
                              style={{
                                padding: '8px 14px',
                                backgroundColor: 'rgba(245, 158, 11, 0.12)',
                                color: 'var(--warning-text)',
                                border: 'none',
                                borderRadius: '8px',
                                cursor: actionLoading === review._id ? 'not-allowed' : 'pointer',
                                fontSize: '12px',
                                fontWeight: '600',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                              }}
                            >
                              <Flag size={14} /> Flag / Quarantine
                            </button>
                          )}

                          <button
                            onClick={() => {
                              setSelectedReview(review);
                              setReplyText(review.adminReply || '');
                              setShowReplyModal(true);
                            }}
                            disabled={actionLoading === review._id}
                            style={{
                              padding: '8px 14px',
                              backgroundColor: 'var(--bg-primary)',
                              color: 'var(--text-primary)',
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
                            <MessageSquare size={14} /> {review.adminReply ? 'Edit Reply' : 'Reply'}
                          </button>
                        </>
                      )}

                      {canDelete && (
                        <button
                          onClick={() => handleDelete(review._id)}
                          disabled={actionLoading === review._id}
                          style={{
                            padding: '8px 14px',
                            backgroundColor: 'rgba(220, 38, 38, 0.1)',
                            color: 'var(--danger-text)',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: actionLoading === review._id ? 'not-allowed' : 'pointer',
                            fontSize: '12px',
                            fontWeight: '600',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            marginLeft: 'auto'
                          }}
                        >
                          {actionLoading === review._id ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={14} />}
                          {isSuperAdmin ? 'Delete / Erase' : 'Remove'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && !loading && reviews.length > 0 && (
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
            onClick={() => setPage((p) => Math.max(1, p - 1))}
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
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
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
                    src={selectedReview.product?.images?.[0] || PRODUCT_PLACEHOLDER}
                    alt={selectedReview.product?.name || 'Product'}
                    onError={(e) => { (e.currentTarget as HTMLImageElement).src = PRODUCT_PLACEHOLDER; }}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </div>
                <div>
                  <h2 style={{ fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '8px' }}>
                    {selectedReview.product?.name || 'Product'}
                  </h2>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    {renderStars(selectedReview.rating, 18)}
                    <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                      {new Date(selectedReview.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                    <User size={14} />
                    {selectedReview.user?.fullName || 'Customer'} • {selectedReview.user?.email || 'N/A'}
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
                  {selectedReview.helpfulCount || 0} 👍
                </div>
              </div>
            </div>

            {selectedReview.adminReply && (
              <div style={{
                padding: '16px',
                backgroundColor: 'var(--bg-primary)',
                borderRadius: '10px',
                marginBottom: '16px',
                borderLeft: '3px solid var(--accent-color, #4F46E5)'
              }}>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600', textTransform: 'uppercase' }}>
                  Admin Reply ({selectedReview.repliedAt ? new Date(selectedReview.repliedAt).toLocaleDateString() : 'Recorded'})
                </div>
                <p style={{ color: 'var(--text-primary)', fontSize: '14px', lineHeight: '1.6' }}>
                  {selectedReview.adminReply}
                </p>
              </div>
            )}

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
              {canModerate && selectedReview.status !== 'approved' && selectedReview.status !== 'withdrawn' && (
                <button
                  onClick={() => { handleApprove(selectedReview._id); }}
                  style={{
                    padding: '12px 24px',
                    backgroundColor: 'rgba(22, 163, 74, 0.12)',
                    color: 'var(--success-text)',
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
            </div>
          </div>
        </div>
      )}

      {/* Reply Modal */}
      {showReplyModal && selectedReview && (
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
          onClick={() => setShowReplyModal(false)}
        >
          <div
            style={{
              backgroundColor: 'var(--card-bg)',
              borderRadius: '16px',
              padding: '28px',
              maxWidth: '600px',
              width: '100%'
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '8px' }}>
              Reply to Customer Review
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Your reply will be visible publicly under this customer&apos;s review.
            </p>
            <textarea
              rows={5}
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Write an official response on behalf of the store..."
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--input-bg)',
                color: 'var(--text-primary)',
                fontSize: '14px',
                outline: 'none',
                resize: 'vertical',
                marginBottom: '16px'
              }}
            />
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowReplyModal(false)}
                style={{
                  padding: '10px 18px',
                  backgroundColor: 'var(--card-bg)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleReplySubmit}
                disabled={!replyText.trim() || actionLoading === selectedReview._id}
                style={{
                  padding: '10px 18px',
                  backgroundColor: 'var(--accent-color, #4F46E5)',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: '600',
                  cursor: !replyText.trim() ? 'not-allowed' : 'pointer'
                }}
              >
                Submit Reply
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
