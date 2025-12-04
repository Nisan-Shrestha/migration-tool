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

function computeStatsAndProposalsV2(
  claimId,
  secondaryRems,
  tertiaryRems,
  claimAdjDetailRows,
  amountToReduce
) {
  console.log("_________________________________\n\n\n");
  const proposals = [];
  let remainingToReduce = toDecimal(amountToReduce);

  // Process tertiary remittances first, then secondary
  const remsToProcess = [...tertiaryRems, ...secondaryRems];
  for (const remit of remsToProcess) {
    if (remainingToReduce.lte(0)) break;

    const remitId = remit.smvs_patient_remittanceid;
    // Find all claimAdjDetailRows associated with this remittance
    const associatedAdjustments = claimAdjDetailRows
      .filter((cad) => cad.parentRemId === remitId)
      .map((cad) => ({
        ...cad,
        amount: Decimal(cad.amount),
      }));

    // Sort by amount DESC, then by createdon DESC (latest first) if equal
    associatedAdjustments.sort((a, b) => {
      const cmp = b.amount.minus(a.amount);
      if (cmp !== 0) return cmp;
      const ca =
        a.raw && a.raw.createdon ? new Date(a.raw.createdon).getTime() : 0;
      const cb =
        b.raw && b.raw.createdon ? new Date(b.raw.createdon).getTime() : 0;
      return cb - ca;
    });

    // Generate proposals for each adjustment
    for (const cad of associatedAdjustments) {
      if (remainingToReduce.lte(0)) break;
      const current = cad.amount;
      const reduction = Decimal.min(current, remainingToReduce);
      const proposed = current.minus(reduction);

      proposals.push({
        claimId,
        adjustmentId: cad.adjId,
        parentRemId: cad.parentRemId,
        currentAmount: current,
        newAmount: proposed,
        delta: proposed.minus(current),
      });

      remainingToReduce = remainingToReduce.minus(reduction);
    }
  }

  return {
    proposals,
    totalReduced: toDecimal(amountToReduce).minus(remainingToReduce),
    remainingToReduce,
  };
}

module.exports = { computeStatsAndProposalsV2 };
