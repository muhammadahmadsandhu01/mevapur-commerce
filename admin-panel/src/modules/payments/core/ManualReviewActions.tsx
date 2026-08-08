'use client';

interface ManualReviewActionsProps {
  disabled: boolean;
  onReview: (decision: 'approve' | 'reject') => void;
}

export default function ManualReviewActions({
  disabled,
  onReview
}: ManualReviewActionsProps) {
  return (
    <span style={{ display: 'inline-flex', gap: '6px' }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onReview('approve')}
        style={{ border: 0, borderRadius: '7px', padding: '8px 10px', background: '#0F766E', color: 'white' }}
      >
        Approve
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onReview('reject')}
        style={{ border: 0, borderRadius: '7px', padding: '8px 10px', background: '#B91C1C', color: 'white' }}
      >
        Reject
      </button>
    </span>
  );
}
