# Payment Provider Activation Runbook

1. Keep the provider flag disabled.
2. Verify official documentation and merchant contract.
3. Add secrets through the approved deployment secret store.
4. Run the provider config validator without logging values.
5. Run isolated unit and callback-signature tests.
6. Run sandbox create/status/failure/refund tests where supported.
7. Confirm raw callback bytes and duplicate-event behavior.
8. Confirm public availability metadata contains no secret.
9. Enable only in a non-production edition/staging environment.
10. Monitor payment/order reconciliation and rollback by disabling the flag.

Do not activate JazzCash, Easypaisa or Stripe externally from this P2.2 worktree. No official wallet contract was available, and the existing Stripe test credential was not externally valid.
