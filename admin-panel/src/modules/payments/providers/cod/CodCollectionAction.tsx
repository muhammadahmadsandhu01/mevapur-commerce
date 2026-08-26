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
      style={{ border: 0, borderRadius: '7px', padding: '8px 10px', background: '#FF8A00', color: '#0B132B' }}
    >
      Mark collected
    </button>
  );
}
