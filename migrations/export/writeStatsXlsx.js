// writeStatsXlsx.js
const ExcelJS = require("exceljs");
const fs = require("fs");

async function writeStatsXlsx(destPath, statsRows) {
  fs.mkdirSync(require("path").dirname(destPath), { recursive: true });
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Claim Caps");
  ws.columns = [
    { header: "Claim ID", key: "claimId", width: 40 },
    { header: "Claimed Amount", key: "claimedAmt", width: 18 },
    { header: "Received Amount", key: "receivedAmt", width: 18 },
    { header: "Patient Resp", key: "patientResp", width: 18 },
    { header: "Pending Add. Payer", key: "pendingAdditionalPayer", width: 22 },
    { header: "PR Amount", key: "PRAmt", width: 18 },
    { header: "Current Adj Amount", key: "currentAdjustmentAmt", width: 22 },
    { header: "Adjustment Cap", key: "adjustmentCap", width: 18 },
    { header: "Amount to Reduce", key: "amountToReduce", width: 18 },
    { header: "Total Reduced", key: "totalReduced", width: 18 },
    { header: "Remaining to Reduce", key: "remainingToReduce", width: 22 },
  ];
  for (const s of statsRows) {
    ws.addRow({
      claimId: s.claimId,
      claimedAmt: s.claimedAmt.toFixed(2),
      receivedAmt: s.receivedAmt.toFixed(2),
      patientResp: s.patientResp.toFixed(2),
      pendingAdditionalPayer: s.pendingAdditionalPayer.toFixed(2),
      PRAmt: s.PRAmt.toFixed(2),
      currentAdjustmentAmt: s.currentAdjustmentAmt.toFixed(2),
      adjustmentCap: s.adjustmentCap.toFixed(2),
      amountToReduce: s.amountToReduce.toFixed(2),
      totalReduced: s.totalReduced.toFixed(2),
      remainingToReduce: s.remainingToReduce.toFixed(2),
    });
  }
  await wb.xlsx.writeFile(destPath);
  console.log("Wrote stats xlsx to", destPath);
}

module.exports = { writeStatsXlsx };
