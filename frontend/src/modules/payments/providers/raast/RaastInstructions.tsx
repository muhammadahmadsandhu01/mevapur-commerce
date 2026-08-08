import type { PaymentCustomerAction } from '../../core/types';

export default function RaastInstructions({
  action
}: {
  action: PaymentCustomerAction;
}) {
  return (
    <dl className="grid gap-2 text-sm">
      <div><dt className="font-semibold">Account title</dt><dd>{action.accountTitle}</dd></div>
      <div><dt className="font-semibold">Raast ID</dt><dd>{action.raastId}</dd></div>
    </dl>
  );
}
