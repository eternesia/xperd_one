import type { CbTransaction } from "./cashbank";

/** Only transfers affect a second cash/bank account. Legacy in/out rows may retain a stale counterpart. */
export function matchesCbAccount(
  transaction: Pick<CbTransaction, "trx_type" | "account_code" | "counterpart_account_code">,
  accountCode: string,
) {
  return (
    transaction.account_code === accountCode ||
    (transaction.trx_type === "transfer" && transaction.counterpart_account_code === accountCode)
  );
}
