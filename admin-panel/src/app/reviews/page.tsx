'use client';

import { useEffect, useState } from 'react';
import { 
  Star, 
  CheckCircle, 
  XCircle, 
  MessageSquare, 
  Trash2, 
  Search, 
  Filter,
  AlertTriangle,
  Loader,
  Eye,
  Reply
} from 'lucide-react';
import api from '@/lib/api';

interface Review {
  _id: string;
  product: {
    _id: string;
    name: string;
    images: string[];
  };
  user: {
    fullName: string;
    email: string;
  };
  rating: number;
  title: string;
  comment: string;
  isVerifiedPurchase: boolean;
  isApproved: boolean;
  adminReply: string;
  repliedAt: string;
  reported: boolean;
  reportReason: string;
  createdAt: string;
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  pages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [ratingFilter, setRatingFilter] = useState('');
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [stats, setStats] = useState<any>(null);
  const [showReplyModal, setShowReplyModal] = useState(false);
  const [selectedReview, setSelectedReview] = useState<Review | null>(null);
  const [replyText, setReplyText] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    fetchReviews();
    fetchStats();
  }, [currentPage, search, statusFilter, ratingFilter]);

  const fetchReviews = async () => {
    try {
      setLoading(true);
      const params: any = { page: currentPage, limit: 10 };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      if (ratingFilter) params.rating = ratingFilter;

      const response = await api.get('/reviews', { params });
      if (response.data.success) {
        setReviews(response.data.data);
        setPagination(response.data.pagination);
      }
    } catch (error) {
      console.error('Error fetching reviews:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await api.get('/reviews/stats');
      if (response.data.success) {
        setStats(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const handleApprove = async (reviewId: string, isApproved: boolean) => {
    setActionLoading(reviewId);
    try {
      const response = await api.put(`/reviews/${reviewId}/approve`, { isApproved });
      if (response.data.success) {
        await fetchReviews();
        await fetchStats();
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Failed to update review');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (reviewId: string) => {
    if (!confirm('Are you sure you want to delete this review?')) return;
    
    try {
      const response = await api.delete(`/reviews/${reviewId}`);
      if (response.data.success) {
        await fetchReviews();
        await fetchStats();
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Failed to delete review');
    }
  };

  const handleReply = async () => {
    if (!selectedReview || !replyText.trim()) return;
    
    setActionLoading('reply');
    try {
      const response = await api.put(`/reviews/${selectedReview._id}/approve`, {
        isApproved: true,
        adminReply: replyText
      });
      if (response.data.success) {
        setShowReplyModal(false);
        setSelectedReview(null);
        setReplyText('');
        await fetchReviews();
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Failed to send reply');
    } finally {
      setActionLoading(null);
    }
  };

  const openReplyModal = (review: Review) => {
    setSelectedReview(review);
    setReplyText(review.adminReply || '');
    setShowReplyModal(true);
  };

  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        size={16}
        fill={i < rating ? '#F59E0B' : 'none'}
        color={i < rating ? '#F59E0B' : '#D1D5DB'}
      />
    ));
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-PK', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ 
          fontSize: '32px', 
          fontWeight: '800', 
          color: 'var(--text-primary)',
          marginBottom: '8px'
        }}>
          Reviews Management
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>
          Moderate and respond to customer reviews
        </p>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
          gap: '16px',
          marginBottom: '24px'
        }}>
          <div style={{
            backgroundColor: 'var(--card-bg)',
            padding: '20px',
            borderRadius: '12px',
            border: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            gap: '16px'
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '10px',
              backgroundColor: '#DBEAFE',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <MessageSquare size={24} color="#3B82F6" />
            </div>
            <div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                Total Reviews
              </div>
              <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>
                {stats.totalReviews || 0}
              </div>
            </div>
          </div>

          <div style={{
            backgroundColor: 'var(--card-bg)',
            padding: '20px',
            borderRadius: '12px',
            border: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            gap: '16px'
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '10px',
              backgroundColor: '#D1FAE5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <CheckCircle size={24} color="#10B981" />
            </div>
            <div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                Approved
              </div>
              <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>
                {stats.approvedReviews || 0}
              </div>
            </div>
          </div>

          <div style={{
            backgroundColor: 'var(--card-bg)',
            padding: '20px',
            borderRadius: '12px',
            border: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            gap: '16px'
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '10px',
              backgroundColor: '#FEF3C7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Clock size={24} color="#F59E0B" />
            </div>
            <div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                Pending
              </div>
              <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>
                {stats.pendingReviews || 0}
              </div>
            </div>
          </div>

          <div style={{
            backgroundColor: 'var(--card-bg)',
            padding: '20px',
            borderRadius: '12px',
            border: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            gap: '16px'
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '10px',
              backgroundColor: '#FEE2E2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <AlertTriangle size={24} color="#EF4444" />
            </div>
            <div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                Reported
              </div>
              <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>
                {stats.reportedReviews || 0}
              </div>
            </div>
          </div>

          <div style={{
            backgroundColor: 'var(--card-bg)',
            padding: '20px',
            borderRadius: '12px',
            border: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            gap: '16px'
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '10px',
              backgroundColor: '#FEF3C7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Star size={24} color="#F59E0B" />
            </div>
            <div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                Avg Rating
              </div>
              <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>
                {stats.averageRating || 0} ⭐
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{
        backgroundColor: 'var(--card-bg)',
        padding: '20px',
        borderRadius: '12px',
        border: '1px solid var(--border-color)',
        marginBottom: '24px'
      }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: '300px', position: 'relative' }}>
            <Search size={18} style={{
              position: 'absolute', left: '16px', top: '50%',
              transform: 'translateY(-50%)', color: 'var(--text-secondary)'
            }} />
            <input
              type="text"
              placeholder="Search reviews..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '12px 16px 12px 48px',
                border: '1px solid var(--border-color)',
                borderRadius: '10px',
                fontSize: '14px',
                outline: 'none',
                backgroundColor: 'var(--input-bg)',
                color: 'var(--text-primary)'
              }}
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: '12px 16px',
              border: '1px solid var(--border-color)',
              borderRadius: '10px',
              fontSize: '14px',
              backgroundColor: 'var(--input-bg)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              outline: 'none'
            }}
          >
            <option value="">All Status</option>
            <option value="approved">Approved</option>
            <option value="pending">Pending</option>
            <option value="reported">Reported</option>
          </select>

          <select
            value={ratingFilter}
            onChange={(e) => setRatingFilter(e.target.value)}
            style={{
              padding: '12px 16px',
              border: '1px solid var(--border-color)',
              borderRadius: '10px',
              fontSize: '14px',
              backgroundColor: 'var(--input-bg)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              outline: 'none'
            }}
          >
            <option value="">All Ratings</option>
            <option value="5">5 Stars</option>
            <option value="4">4 Stars</option>
            <option value="3">3 Stars</option>
            <option value="2">2 Stars</option>
            <option value="1">1 Star</option>
          </select>
        </div>
      </div>

      {/* Reviews List */}
      {loading ? (
        <div style={{
          backgroundColor: 'var(--card-bg)',
          padding: '60px',
          borderRadius: '12px',
          border: '1px solid var(--border-color)',
          textAlign: 'center'
        }}>
          <Loader size={40} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} color="var(--primary)" />
          <p style={{ color: 'var(--text-secondary)' }}>Loading reviews...</p>
        </div>
      ) : reviews.length === 0 ? (
        <div style={{
          backgroundColor: 'var(--card-bg)',
          padding: '60px',
          borderRadius: '12px',
          border: '1px solid var(--border-color)',
          textAlign: 'center'
        }}>
          <MessageSquare size={64} style={{ margin: '0 auto 16px', opacity: 0.3 }} color="var(--text-secondary)" />
          <p style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '8px' }}>
            No reviews found
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {reviews.map((review) => (
            <div
              key={review._id}
              style={{
                backgroundColor: 'var(--card-bg)',
                borderRadius: '12px',
                border: '1px solid var(--border-color)',
                padding: '24px',
                borderLeft: review.reported ? '4px solid #EF4444' : 
                           review.isApproved ? '4px solid #10B981' : '4px solid #F59E0B'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                <div style={{ display: 'flex', gap: '16px', flex: 1 }}>
                  {review.product?.images?.[0] && (
                    <img
                      src={review.product.images[0]}
                      alt={review.product.name}
                      style={{
                        width: '80px',
                        height: '80px',
                        objectFit: 'cover',
                        borderRadius: '10px',
                        border: '1px solid var(--border-color)'
                      }}
                    />
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                      <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)' }}>
                        {review.product?.name || 'Unknown Product'}
                      </h3>
                      {review.isVerifiedPurchase && (
                        <span style={{
                          padding: '4px 10px',
                          backgroundColor: '#DBEAFE',
                          color: '#1E40AF',
                          borderRadius: '20px',
                          fontSize: '11px',
                          fontWeight: '600'
                        }}>
                          ✓ Verified Purchase
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                      <div style={{ display: 'flex' }}>
                        {renderStars(review.rating)}
                      </div>
                      <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>
                        {review.rating}.0
                      </span>
                    </div>
                    {review.title && (
                      <div style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '4px' }}>
                        "{review.title}"
                      </div>
                    )}
                    <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.5', marginBottom: '8px' }}>
                      {review.comment}
                    </p>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                      By <strong>{review.user?.fullName || 'Anonymous'}</strong> • {formatDate(review.createdAt)}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                  {!review.isApproved && (
                    <button
                      onClick={() => handleApprove(review._id, true)}
                      disabled={actionLoading === review._id}
                      style={{
                        padding: '8px 12px',
                        backgroundColor: '#10B981',
                        color: 'white',
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
                      <CheckCircle size={16} />
                      Approve
                    </button>
                  )}
                  {review.isApproved && (
                    <button
                      onClick={() => handleApprove(review._id, false)}
                      disabled={actionLoading === review._id}
                      style={{
                        padding: '8px 12px',
                        backgroundColor: '#F59E0B',
                        color: 'white',
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
                      <XCircle size={16} />
                      Reject
                    </button>
                  )}
                  <button
                    onClick={() => openReplyModal(review)}
                    style={{
                      padding: '8px 12px',
                      backgroundColor: '#3B82F6',
                      color: 'white',
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
                    <Reply size={16} />
                    Reply
                  </button>
                  <button
                    onClick={() => handleDelete(review._id)}
                    style={{
                      padding: '8px 12px',
                      backgroundColor: '#EF4444',
                      color: 'white',
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
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {review.adminReply && (
                <div style={{
                  marginTop: '16px',
                  padding: '16px',
                  backgroundColor: 'var(--bg-primary)',
                  borderRadius: '10px',
                  borderLeft: '3px solid var(--primary)'
                }}>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--primary)', marginBottom: '8px' }}>
                    Admin Reply:
                  </div>
                  <div style={{ fontSize: '14px', color: 'var(--text-primary)' }}>
                    {review.adminReply}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px' }}>
                    Replied on {formatDate(review.repliedAt)}
                  </div>
                </div>
              )}

              {review.reported && (
                <div style={{
                  marginTop: '12px',
                  padding: '12px',
                  backgroundColor: '#FEE2E2',
                  borderRadius: '8px',
                  border: '1px solid #EF4444',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <AlertTriangle size={16} color="#EF4444" />
                  <span style={{ fontSize: '13px', color: '#991B1B', fontWeight: '600' }}>
                    Reported: {review.reportReason || 'No reason provided'}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.pages > 1 && (
        <div style={{
          marginTop: '24px',
          display: 'flex',
          justifyContent: 'center',
          gap: '8px'
        }}>
          <button
            onClick={() => setCurrentPage(pagination.page - 1)}
            disabled={!pagination.hasPrev}
            style={{
              padding: '8px 16px',
              backgroundColor: pagination.hasPrev ? 'var(--primary)' : '#9CA3AF',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: pagination.hasPrev ? 'pointer' : 'not-allowed',
              fontWeight: '600'
            }}
          >
            Previous
          </button>
          <button
            onClick={() => setCurrentPage(pagination.page + 1)}
            disabled={!pagination.hasNext}
            style={{
              padding: '8px 16px',
              backgroundColor: pagination.hasNext ? 'var(--primary)' : '#9CA3AF',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: pagination.hasNext ? 'pointer' : 'not-allowed',
              fontWeight: '600'
            }}
          >
            Next
          </button>
        </div>
      )}

      {/* Reply Modal */}
      {showReplyModal && selectedReview && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }} onClick={() => setShowReplyModal(false)}>
          <div 
            style={{
              backgroundColor: 'var(--card-bg)',
              borderRadius: '16px',
              padding: '32px',
              width: '100%',
              maxWidth: '600px',
              border: '1px solid var(--border-color)'
            }}
            onClick={e => e.stopPropagation()}
          >
            <h2 style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '24px' }}>
              Reply to Review
            </h2>

            <div style={{
              padding: '16px',
              backgroundColor: 'var(--bg-primary)',
              borderRadius: '10px',
              marginBottom: '20px',
              border: '1px solid var(--border-color)'
            }}>
              <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                Review by {selectedReview.user?.fullName}
              </div>
              <div style={{ display: 'flex', marginBottom: '8px' }}>
                {renderStars(selectedReview.rating)}
              </div>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                {selectedReview.comment}
              </p>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                Your Reply
              </label>
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Write your reply to this review..."
                rows={5}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  border: '1px solid var(--border-color)',
                  borderRadius: '10px',
                  fontSize: '14px',
                  outline: 'none',
                  backgroundColor: 'var(--input-bg)',
                  color: 'var(--text-primary)',
                  resize: 'vertical'
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button
                onClick={() => setShowReplyModal(false)}
                style={{
                  flex: 1,
                  padding: '14px',
                  backgroundColor: 'var(--card-bg)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  fontWeight: '600'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleReply}
                disabled={!replyText.trim() || actionLoading === 'reply'}
                style={{
                  flex: 1,
                  padding: '14px',
                  backgroundColor: !replyText.trim() ? '#9CA3AF' : 'var(--primary)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '10px',
                  cursor: !replyText.trim() ? 'not-allowed' : 'pointer',
                  fontWeight: '600',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                {actionLoading === 'reply' ? (
                  <Loader size={20} style={{ animation: 'spin 1s linear infinite' }} />
                ) : (
                  <Reply size={20} />
                )}
                Send Reply
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// Import Clock for pending icon
import { Clock } from 'lucide-react';