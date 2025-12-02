// computeProposals.js
const Decimal = require("decimal.js");
const {
  REMIT_PRIMARY,
  REMIT_SECONDARY,
  REMIT_TERTIARY,
} = require("../../constants");

function toDecimal(v) {
  try {
    return new Decimal(v || 0);
  } catch (e) {
    return new Decimal(0);
  }
}

// Returns stats and proposals (proposals contain adjustmentId, parentRemId, currentAmount Decimal, newAmount Decimal, delta Decimal)
function computeStatsAndProposals(
  claimId,
  remittances = [],
  claimAdjustmentDetails = []
) {
  let PendingCapFromPrimary = new Decimal(0);
  let PendingCapFromSecondary = new Decimal(0);
  for (const remit of remittances) {
    const remitType = Number(remit.smvs_remit_type_indicator || 0);
    const pendingFromAdditional = toDecimal(
      remit.smvs_pending_from_additional_payer || 0
    );
    const patientResp = toDecimal(remit.smvs_patient_responsibility || 0);
    const useVal = Decimal.max(pendingFromAdditional, patientResp);

    if (remitType === REMIT_PRIMARY)
      PendingCapFromPrimary = PendingCapFromPrimary.plus(useVal);
    else if (remitType === REMIT_SECONDARY)
      PendingCapFromSecondary = PendingCapFromSecondary.plus(useVal);
  }

  let totalAdjSecondary = new Decimal(0);
  let totalAdjTertiary = new Decimal(0);

  for (const cad of claimAdjustmentDetails) {
    const amt = toDecimal(cad.amount);
    const remitType = cad.remitTypeIndicator ?? null;
    if (remitType === REMIT_SECONDARY) {
      totalAdjSecondary = totalAdjSecondary.plus(amt);
    } else if (remitType === REMIT_TERTIARY)
      totalAdjTertiary = totalAdjTertiary.plus(amt);
  }

  const stats = {
    claimId,
    PendingCapFromPrimary,
    totalAdjSecondary,
    Secondary_Excess: totalAdjSecondary.minus(PendingCapFromPrimary),
    PendingCapFromSecondary,
    totalAdjTertiary,
    Tertiary_Excess: totalAdjTertiary.minus(PendingCapFromSecondary),
    remittanceCount: remittances.length,
    adjustmentCount: claimAdjustmentDetails.length,
  };

  // Generate changes to be made for migration

  const proposals = [];

  // helper to collect and reduce list for typeMatch predicate
  function generateAdjustmentProposals(
    remitTypeFilter,
    pendingAmountForCap,
    totalAdj,
    label
  ) {
    if (!totalAdj.gt(pendingAmountForCap)) return;

    let adjustmentsOverflow = totalAdj.minus(pendingAmountForCap);
    // collect relevant adj rows with smvs_amount > 0
    const filteredClaimAdjustmentDetails = claimAdjustmentDetails
      .filter((cad) => {
        const remitType = cad.remitTypeIndicator ?? null;
        return remitTypeFilter(remitType);
      })
      .map((a) => ({ ...a, amountDec: toDecimal(a.amount) }))
      .filter((x) => x.amountDec.gt(0));

    // sort Adjustments by amount DESC then createdon ASC if equal
    filteredClaimAdjustmentDetails.sort((a, b) => {
      const cmp = b.amountDec.minus(a.amountDec).toNumber();
      if (cmp !== 0) return cmp;
      const ca =
        a.raw && a.raw.createdon ? new Date(a.raw.createdon).getTime() : 0;
      const cb =
        b.raw && b.raw.createdon ? new Date(b.raw.createdon).getTime() : 0;
      return ca - cb;
    });

    for (const cad of filteredClaimAdjustmentDetails) {
      if (adjustmentsOverflow.lte(0)) break;
      const current = cad.amountDec;
      const reduction = Decimal.min(current, adjustmentsOverflow);
      const proposed = current.minus(reduction);

      proposals.push({
        adjustmentId: cad.adjId,
        parentRemId: cad.parentRemId,
        currentAmount: current,
        newAmount: proposed,
        delta: proposed.minus(current),
      });
      adjustmentsOverflow = adjustmentsOverflow.minus(reduction);
    }
  }

  // secondary adjustments must be <= cap1
  generateAdjustmentProposals(
    (prt) => prt === REMIT_SECONDARY,
    stats.PendingCapFromPrimary,
    stats.totalAdjSecondary,
    "secondary"
  );
  // tertiary adjustments must be <= cap2
  generateAdjustmentProposals(
    (prt) => prt === REMIT_TERTIARY,
    stats.PendingCapFromSecondary,
    stats.totalAdjTertiary,
    "tertiary"
  );

  return { stats, proposals };
}

module.exports = { computeStatsAndProposals };
