'use client';

export default function CodCollectionAction({
  disabled,
  onCollect
}: {
  disabled: boolean;
  onCollect: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onCollect}
      style={{ border: 0, borderRadius: '7px', padding: '8px 10px', background: '#0F766E', color: 'white' }}
    >
      Mark collected
    </button>
  );
}
