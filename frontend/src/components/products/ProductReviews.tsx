'use client';

import { FormEvent, useCallback, useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { Star, MessageSquare, Flag, CheckCircle2, AlertCircle, Loader2, ShieldCheck } from 'lucide-react';
import { accountService, getAccountApiErrorMessage } from '@/services/account.service';
import { useAuthStore } from '@/store/authStore';
import { branding } from '@/config/branding';
import { useDialogFocusTrap } from '@/hooks/useDialogFocusTrap';

type Review = {
  id: string;
  rating: number;
  title: string;
  comment: string;
  createdAt: string;
  isVerifiedPurchase: boolean;
  user: { fullName: string };
  adminReply?: string;
  repliedAt?: string | null;
};

type ReportCategory = 'inappropriate' | 'spam' | 'misleading' | 'harassment' | 'other';

export default function ProductReviews({ productId }: { productId: string }) {
  const { isAuthenticated } = useAuthStore();

  const [reviews, setReviews] = useState<Review[]>([]);
  const [summary, setSummary] = useState({ count: 0, averageRating: 0 });
  const [comment, setComment] = useState('');
  const [title, setTitle] = useState('');
  const [rating, setRating] = useState(5);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Reporting State
  const [reportingReview, setReportingReview] = useState<Review | null>(null);
  const [reportCategory, setReportCategory] = useState<ReportCategory>('inappropriate');
  const [reportDetails, setReportDetails] = useState('');
  const [savingReport, setSavingReport] = useState(false);
  const [reportSuccess, setReportSuccess] = useState('');
  const [reportError, setReportError] = useState('');

  const reportModalRef = useRef<HTMLDivElement>(null);
  const reportCancelRef = useRef<HTMLButtonElement>(null);

  useDialogFocusTrap({
    isOpen: !!reportingReview,
    onClose: () => {
      if (!savingReport) setReportingReview(null);
    },
    containerRef: reportModalRef,
    initialFocusRef: reportCancelRef,
  });

  const load = useCallback(async () => {
    try {
      const result = await accountService.reviews(productId) as { reviews: Review[]; summary: typeof summary };
      setReviews(result.reviews || []);
      setSummary(result.summary || { count: 0, averageRating: 0 });
    } catch {
      setError('Reviews are unavailable right now.');
    }
  }, [productId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    setError('');

    try {
      await accountService.submitReview({
        productId,
        rating,
        title: title.trim() || undefined,
        comment: comment.trim()
      });
      setComment('');
      setTitle('');
      setMessage('Thank you! Your verified-purchase review was submitted and is awaiting moderation.');
    } catch (err) {
      setError(
        getAccountApiErrorMessage(
          err,
          'A delivered purchase is required and each product can be reviewed once.'
        )
      );
    } finally {
      setSaving(false);
    }
  };

  const handleOpenReport = (rev: Review) => {
    if (!isAuthenticated) {
      setError('Please sign in to report a review.');
      return;
    }
    setReportingReview(rev);
    setReportCategory('inappropriate');
    setReportDetails('');
    setReportSuccess('');
    setReportError('');
  };

  const handleSendReport = async (e: FormEvent) => {
    e.preventDefault();
    if (!reportingReview) return;
    setSavingReport(true);
    setReportError('');
    try {
      await accountService.reportReview(reportingReview.id, {
        category: reportCategory,
        details: reportDetails.trim() || undefined
      });
      setReportSuccess('Thank you. Your report has been submitted for moderation review.');
      setTimeout(() => {
        setReportingReview(null);
      }, 1500);
    } catch (err) {
      setReportError(getAccountApiErrorMessage(err, 'Failed to submit report. You may have already reported this review.'));
    } finally {
      setSavingReport(false);
    }
  };

  return (
    <section aria-label="Customer reviews" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8">
      <div className="flex flex-col justify-between gap-4 border-b border-slate-100 pb-6 sm:flex-row sm:items-center">
        <div>
          <h3 className="text-xl font-bold text-[#0b132b]">Customer Reviews</h3>
          <div className="mt-1 flex items-center gap-2">
            <div className="flex items-center gap-0.5" aria-label={`${summary.averageRating.toFixed(1)} out of 5 stars`}>
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  className={`h-4 w-4 ${
                    star <= Math.round(summary.averageRating)
                      ? 'fill-amber-400 text-amber-400'
                      : 'text-slate-200'
                  }`}
                />
              ))}
            </div>
            <span className="font-bold text-sm text-slate-800">
              {summary.averageRating.toFixed(1)} / 5
            </span>
            <span className="text-xs text-slate-500">
              ({summary.count} approved review{summary.count === 1 ? '' : 's'})
            </span>
          </div>
        </div>
      </div>

      {/* Report Modal */}
      {reportingReview && (
        <div
          ref={reportModalRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="report-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-2 text-amber-700">
              <Flag className="h-5 w-5" />
              <h4 id="report-modal-title" className="text-base font-bold text-slate-900">Report Review</h4>
            </div>

            {reportError && (
              <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                {reportError}
              </div>
            )}

            {reportSuccess && (
              <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">
                {reportSuccess}
              </div>
            )}

            <form onSubmit={handleSendReport} className="space-y-3">
              <div>
                <label htmlFor="report-category" className="block text-xs font-semibold text-slate-700">Reason for reporting *</label>
                <select
                  id="report-category"
                  value={reportCategory}
                  onChange={(e) => setReportCategory(e.target.value as ReportCategory)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-[#0b132b]"
                >
                  <option value="inappropriate">Inappropriate content or profanity</option>
                  <option value="spam">Spam or advertising</option>
                  <option value="misleading">Misleading or false claims</option>
                  <option value="harassment">Harassment or hate speech</option>
                  <option value="other">Other issue</option>
                </select>
              </div>

              <div>
                <label htmlFor="report-details" className="block text-xs font-semibold text-slate-700">Additional details (Optional)</label>
                <textarea
                  id="report-details"
                  maxLength={500}
                  rows={3}
                  value={reportDetails}
                  onChange={(e) => setReportDetails(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-[#0b132b]"
                  placeholder="Provide context for moderators..."
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  ref={reportCancelRef}
                  type="button"
                  onClick={() => setReportingReview(null)}
                  disabled={savingReport}
                  className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingReport}
                  className="min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {savingReport && <Loader2 className="h-3 w-3 animate-spin" />}
                  Submit Report
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reviews Display */}
      <div className="mt-6 divide-y divide-slate-100">
        {reviews.length === 0 ? (
          <p className="py-6 text-sm text-slate-500 text-center">No approved reviews yet. Be the first to review after purchase!</p>
        ) : (
          reviews.map((review) => (
            <article key={review.id} className="py-5 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-[#0b132b]">{review.user.fullName}</span>
                    {review.isVerifiedPurchase && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
                        <ShieldCheck className="h-3 w-3" /> Verified Purchase
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="flex items-center gap-0.5" aria-label={`${review.rating} out of 5 stars`}>
                      {[1, 2, 3, 4, 5].map((index) => (
                        <Star
                          key={index}
                          className={`h-3.5 w-3.5 ${
                            index <= review.rating
                              ? 'fill-amber-400 text-amber-400'
                              : 'text-slate-200'
                          }`}
                        />
                      ))}
                    </div>
                    <span className="text-[11px] text-slate-600">
                      {new Date(review.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleOpenReport(review)}
                  aria-label={`Report review by ${review.user.fullName}`}
                  title="Report review"
                  className="text-slate-400 hover:text-slate-600 p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg"
                >
                  <Flag className="h-4 w-4" />
                </button>
              </div>

              {review.title && (
                <h4 className="font-bold text-xs text-slate-900">{review.title}</h4>
              )}
              <p className="text-xs leading-relaxed text-slate-700 whitespace-pre-wrap">{review.comment}</p>

              {review.adminReply && (
                <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-3 text-xs text-slate-800 space-y-1 mt-2">
                  <p className="font-bold text-blue-900">{branding.siteName} Response:</p>
                  <p className="text-slate-700">{review.adminReply}</p>
                  {review.repliedAt && (
                    <p className="text-[10px] text-slate-600">{new Date(review.repliedAt).toLocaleDateString()}</p>
                  )}
                </div>
              )}
            </article>
          ))
        )}
      </div>

      {/* Review Submission Form */}
      <div className="mt-8 border-t border-slate-200 pt-6">
        {isAuthenticated ? (
          <form onSubmit={submit} className="space-y-4 max-w-xl">
            <h4 className="font-bold text-base text-[#0b132b]">Write a Review</h4>
            <p className="text-xs text-slate-500">
              Share your feedback with other customers. Only customers with delivered orders for this item can submit a review.
            </p>

            {message && (
              <div role="status" className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
                <span>{message}</span>
              </div>
            )}

            {error && (
              <div role="alert" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label htmlFor="rev-rating" className="block text-xs font-semibold text-slate-700">Rating *</label>
              <div id="rev-rating" className="mt-1 flex gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    aria-label={`Rate ${star} out of 5 stars`}
                    aria-pressed={star <= rating}
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center p-1 text-slate-300 hover:text-amber-500 focus:outline-none focus:ring-2 focus:ring-[#ff8a00] rounded"
                  >
                    <Star
                      className={`h-6 w-6 ${
                        star <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="rev-title" className="block text-xs font-semibold text-slate-700">Title (Optional)</label>
              <input
                id="rev-title"
                type="text"
                maxLength={100}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-[#0b132b]"
                placeholder="Summary of your review"
              />
            </div>

            <div>
              <label htmlFor="rev-comment" className="block text-xs font-semibold text-slate-700">Review *</label>
              <textarea
                id="rev-comment"
                required
                minLength={5}
                maxLength={1000}
                rows={4}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-[#0b132b]"
                placeholder="What did you think of the product quality, delivery, and experience?"
              />
            </div>

            <button
              type="submit"
              disabled={saving || comment.trim().length < 5}
              className="inline-flex items-center gap-2 rounded-xl bg-[#0b132b] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#1c2a4f] disabled:opacity-50 shadow-xs"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Submit Verified-Purchase Review
            </button>
          </form>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-6 text-center">
            <MessageSquare className="mx-auto h-8 w-8 text-slate-400 mb-2" />
            <h4 className="font-bold text-sm text-[#0b132b]">Have you purchased this item?</h4>
            <p className="mt-1 text-xs text-slate-600 max-w-sm mx-auto">
              Sign in with your account to submit a verified-purchase review after your order is delivered.
            </p>
            <Link
              href={`/login?redirect=/products/${productId}`}
              className="mt-3 inline-block rounded-lg bg-[#0b132b] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1c2a4f]"
            >
              Sign In to Write a Review
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
