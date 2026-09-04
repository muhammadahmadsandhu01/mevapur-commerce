'use client';

import { useState, useEffect, useCallback, type FormEvent } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Star, MessageSquare, Edit3, Trash2, CheckCircle2, AlertTriangle, Clock, Ban, Flag, Loader2, AlertCircle } from 'lucide-react';
import {
  accountService,
  type AccountOwnReview,
  getAccountApiErrorMessage
} from '@/services/account.service';
import { getSessionGeneration, isCurrentSessionGeneration } from '@/lib/authSession';
import { branding } from '@/config/branding';

const statusBadge = (status: AccountOwnReview['status']) => {
  switch (status) {
    case 'approved':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
          <CheckCircle2 className="h-3 w-3" /> Approved
        </span>
      );
    case 'pending':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 border border-amber-200">
          <Clock className="h-3 w-3" /> Pending Review
        </span>
      );
    case 'rejected':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700 border border-red-200">
          <Ban className="h-3 w-3" /> Rejected
        </span>
      );
    case 'flagged':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-yellow-50 px-2.5 py-0.5 text-xs font-semibold text-yellow-800 border border-yellow-200">
          <Flag className="h-3 w-3" /> Under Review
        </span>
      );
    case 'withdrawn':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600 border border-slate-200">
          Withdrawn
        </span>
      );
    default:
      return null;
  }
};

export default function MyReviewsList() {
  const [reviews, setReviews] = useState<AccountOwnReview[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 8;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Edit Modal State
  const [editingReview, setEditingReview] = useState<AccountOwnReview | null>(null);
  const [editRating, setEditRating] = useState(5);
  const [editTitle, setEditTitle] = useState('');
  const [editComment, setEditComment] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Withdraw Modal State
  const [withdrawingReview, setWithdrawingReview] = useState<AccountOwnReview | null>(null);
  const [savingWithdraw, setSavingWithdraw] = useState(false);

  const loadReviews = useCallback(async (targetPage = page) => {
    const gen = getSessionGeneration();
    setLoading(true);
    setError(null);
    try {
      const res = await accountService.myReviews({ page: targetPage, limit });
      if (isCurrentSessionGeneration(gen)) {
        setReviews(res.reviews);
        setTotal(res.total);
        setPage(res.page);
      }
    } catch {
      if (isCurrentSessionGeneration(gen)) {
        setError('Could not load your reviews.');
      }
    } finally {
      if (isCurrentSessionGeneration(gen)) {
        setLoading(false);
      }
    }
  }, [page, limit]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadReviews(page);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadReviews, page]);

  const handleStartEdit = (rev: AccountOwnReview) => {
    if (rev.status === 'withdrawn') return;
    setEditingReview(rev);
    setEditRating(rev.rating);
    setEditTitle(rev.title || '');
    setEditComment(rev.comment);
    setError(null);
    setSuccess(null);
  };

  const handleSaveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingReview) return;
    setSavingEdit(true);
    setError(null);
    try {
      await accountService.updateReview(editingReview.id, {
        rating: editRating,
        title: editTitle.trim(),
        comment: editComment.trim()
      });
      setSuccess('Review updated and submitted for re-moderation.');
      setEditingReview(null);
      await loadReviews(page);
    } catch (err: unknown) {
      setError(getAccountApiErrorMessage(err, 'Failed to update review.'));
    } finally {
      setSavingEdit(false);
    }
  };

  const handleConfirmWithdraw = async () => {
    if (!withdrawingReview) return;
    setSavingWithdraw(true);
    setError(null);
    try {
      await accountService.deleteReview(withdrawingReview.id);
      setSuccess('Review withdrawn successfully.');
      setWithdrawingReview(null);
      await loadReviews(page);
    } catch (err: unknown) {
      setError(getAccountApiErrorMessage(err, 'Failed to withdraw review.'));
    } finally {
      setSavingWithdraw(false);
    }
  };

  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
          <MessageSquare className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-[#0b132b]">My Product Reviews</h2>
          <p className="text-xs text-slate-500">
            View, edit, or withdraw reviews you have written for delivered purchases.
          </p>
        </div>
      </div>

      {error && (
        <div role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div role="status" className="mt-4 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Edit Review Modal */}
      {editingReview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-[#0b132b]">
              Edit Review for {editingReview.product?.name || 'Product'}
            </h3>

            <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900 leading-relaxed">
              <p className="font-semibold">Important Moderation Notice:</p>
              <p className="mt-0.5">
                Saving changes will reset this review to <strong>Pending Moderation</strong>. It will be re-reviewed by staff and temporarily excluded from the product&apos;s public rating until re-approved.
              </p>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700">Rating *</label>
                <div className="mt-1 flex gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setEditRating(star)}
                      className="p-1 text-slate-300 hover:text-amber-500 focus:outline-none"
                    >
                      <Star
                        className={`h-6 w-6 ${
                          star <= editRating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor="edit-title" className="block text-xs font-semibold text-slate-700">Title (Optional)</label>
                <input
                  id="edit-title"
                  type="text"
                  maxLength={100}
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#0b132b] focus:outline-none"
                  placeholder="Summary of your experience"
                />
              </div>

              <div>
                <label htmlFor="edit-comment" className="block text-xs font-semibold text-slate-700">Your Review *</label>
                <textarea
                  id="edit-comment"
                  required
                  minLength={5}
                  maxLength={1000}
                  rows={4}
                  value={editComment}
                  onChange={(e) => setEditComment(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#0b132b] focus:outline-none"
                  placeholder="Tell us what you liked or disliked..."
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingReview(null)}
                  disabled={savingEdit}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit || editComment.trim().length < 5}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#0b132b] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1c2a4f] disabled:opacity-50"
                >
                  {savingEdit && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Save and Resubmit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Withdraw Review Modal */}
      {withdrawingReview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-3 text-red-600">
              <AlertTriangle className="h-6 w-6 shrink-0" />
              <h3 className="text-base font-bold text-slate-900">Withdraw Review?</h3>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to withdraw your review for{' '}
              <strong>{withdrawingReview.product?.name || 'this product'}</strong>?
            </p>
            <p className="text-xs text-slate-500">
              Withdrawing removes the review from public display immediately. Note: Withdrawn reviews cannot be re-edited or re-submitted.
            </p>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setWithdrawingReview(null)}
                disabled={savingWithdraw}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Keep Review
              </button>
              <button
                type="button"
                onClick={handleConfirmWithdraw}
                disabled={savingWithdraw}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {savingWithdraw && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Confirm Withdrawal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reviews List */}
      <div className="mt-6 space-y-4">
        {loading ? (
          [1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-slate-100" />
          ))
        ) : reviews.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center">
            <p className="text-sm font-medium text-slate-600">You haven&apos;t written any reviews yet.</p>
            <p className="mt-1 text-xs text-slate-600">
              Reviews can be submitted from product pages after your orders are delivered.
            </p>
          </div>
        ) : (
          reviews.map((rev) => {
            const product = rev.product;
            const productLink = product ? `/products/${product.slug || product.id}` : '#';
            const productImage = product?.images?.[0] || '/images/placeholder.png';

            return (
              <div key={rev.id} className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 space-y-3">
                <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
                  <div className="flex items-start gap-3">
                    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-slate-100 bg-slate-50">
                      {productImage ? (
                        <Image
                          src={productImage}
                          alt={product?.name || 'Product'}
                          fill
                          sizes="56px"
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-slate-300">
                          <Star className="h-6 w-6" />
                        </div>
                      )}
                    </div>
                    <div>
                      {product ? (
                        <Link href={productLink} className="font-bold text-sm text-[#0b132b] hover:underline">
                          {product.name}
                        </Link>
                      ) : (
                        <span className="font-bold text-sm text-slate-500">Unavailable Product</span>
                      )}
                      <div className="mt-1 flex items-center gap-2">
                        <div className="flex items-center gap-0.5" aria-label={`${rev.rating} out of 5 stars`}>
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Star
                              key={s}
                              className={`h-3.5 w-3.5 ${
                                s <= rev.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-200'
                              }`}
                            />
                          ))}
                        </div>
                        {rev.isVerifiedPurchase && (
                          <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                            Verified Purchase
                          </span>
                        )}
                        <span className="text-xs text-slate-600">· {new Date(rev.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-start">
                    {statusBadge(rev.status)}
                  </div>
                </div>

                {rev.title && (
                  <h4 className="font-bold text-xs text-slate-900">{rev.title}</h4>
                )}
                <p className="text-xs leading-relaxed text-slate-700 whitespace-pre-wrap">{rev.comment}</p>

                {/* Staff Reply */}
                {rev.adminReply && (
                  <div className="rounded-lg border border-blue-100 bg-blue-50/40 p-3 text-xs text-slate-800 space-y-1">
                    <p className="font-bold text-blue-900">Response from {branding.siteName}:</p>
                    <p className="text-slate-700">{rev.adminReply}</p>
                    {rev.repliedAt && (
                      <p className="text-[10px] text-slate-600">{new Date(rev.repliedAt).toLocaleDateString()}</p>
                    )}
                  </div>
                )}

                {/* Action Buttons */}
                {rev.status !== 'withdrawn' && (
                  <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => handleStartEdit(rev)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-[#0b132b]"
                    >
                      <Edit3 className="h-3.5 w-3.5" /> Edit Review
                    </button>
                    <button
                      type="button"
                      onClick={() => setWithdrawingReview(rev)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Withdraw
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-4">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-xs text-slate-500">
              Page {page} of {totalPages} ({total} reviews)
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
