import type { PaymentCustomerAction } from '../../core/types';

export default function BankTransferInstructions({
  action
}: {
  action: PaymentCustomerAction;
}) {
  return (
    <dl className="grid gap-2 text-sm">
      <div><dt className="font-semibold">Bank</dt><dd>{action.bankName}</dd></div>
      <div><dt className="font-semibold">Account title</dt><dd>{action.accountTitle}</dd></div>
      <div><dt className="font-semibold">Account reference</dt><dd>{action.accountReference}</dd></div>
    </dl>
  );
}
