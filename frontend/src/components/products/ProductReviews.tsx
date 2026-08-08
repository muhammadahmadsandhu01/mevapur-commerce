'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { accountService } from '@/services/account.service';
import { useAuthStore } from '@/store/authStore';

type Review = { id: string; rating: number; title: string; comment: string; createdAt: string; isVerifiedPurchase: boolean; user: { fullName: string }; adminReply?: string };

export default function ProductReviews({ productId }: { productId: string }) {
  const { isAuthenticated } = useAuthStore();
  const [reviews, setReviews] = useState<Review[]>([]); const [summary, setSummary] = useState({ count: 0, averageRating: 0 }); const [comment, setComment] = useState(''); const [rating, setRating] = useState(5); const [message, setMessage] = useState(''); const [saving, setSaving] = useState(false);
  const load = useCallback(async () => { try { const result = await accountService.reviews(productId) as { reviews: Review[]; summary: typeof summary }; setReviews(result.reviews); setSummary(result.summary); } catch { setMessage('Reviews are unavailable right now.'); } }, [productId]);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);
  const submit = async (event: FormEvent) => { event.preventDefault(); setSaving(true); setMessage(''); try { await accountService.submitReview({ productId, rating, comment }); setComment(''); setMessage('Thanks. Your verified-purchase review is awaiting moderation.'); } catch { setMessage('A delivered purchase is required and each product can be reviewed once.'); } finally { setSaving(false); } };
  return <section aria-label="Customer reviews"><h3 style={{ fontSize: 20, fontWeight: 700 }}>Customer Reviews</h3><p>{summary.count} approved review{summary.count === 1 ? '' : 's'} · {summary.averageRating.toFixed(1)} / 5</p>{reviews.length === 0 ? <p>No approved reviews yet.</p> : reviews.map((review) => <article key={review.id} style={{ borderTop: '1px solid #e5e7eb', padding: '16px 0' }}><strong>{review.user.fullName}</strong> <span aria-label={`${review.rating} out of 5 stars`}>{Array.from({ length: review.rating }, (_, index) => <Star key={index} size={14} fill="#f59e0b" color="#f59e0b" />)}</span><p>{review.comment}</p>{review.isVerifiedPurchase && <small>Verified purchase</small>}{review.adminReply && <p><strong>HARZAAR reply:</strong> {review.adminReply}</p>}</article>)}{isAuthenticated && <form onSubmit={submit} style={{ display: 'grid', gap: 8, marginTop: 20 }}><label>Rating <select value={rating} onChange={(event) => setRating(Number(event.target.value))}>{[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value} stars</option>)}</select></label><label>Review <textarea required minLength={5} maxLength={1000} value={comment} onChange={(event) => setComment(event.target.value)} /></label><button disabled={saving}>{saving ? 'Submitting…' : 'Submit verified-purchase review'}</button></form>}{message && <p role="status">{message}</p>}</section>;
}
