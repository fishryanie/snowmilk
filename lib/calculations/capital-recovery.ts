function safeNonNegative(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function calculateCapitalRecovery(
  investmentTotal: number,
  withdrawnTotal: number,
) {
  const investment = safeNonNegative(investmentTotal);
  const withdrawn = safeNonNegative(withdrawnTotal);
  const remainingCapital = Math.max(0, investment - withdrawn);
  const excessWithdrawal = Math.max(0, withdrawn - investment);

  return {
    investmentTotal: investment,
    withdrawnTotal: withdrawn,
    remainingCapital,
    excessWithdrawal,
    recoveryRate: investment > 0 ? (withdrawn / investment) * 100 : 0,
    isRecovered: investment > 0 && withdrawn >= investment,
  };
}
