// writeStatsXlsx.js
const ExcelJS = require("exceljs");
const fs = require("fs");

async function writeStatsXlsx(destPath, statsRows) {
  fs.mkdirSync(require("path").dirname(destPath), { recursive: true });
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Claim Caps");
  ws.columns = [
    { header: "smvs_claim_id", key: "claimId", width: 40 },
    { header: "PendingCapFromPrimary", key: "cap1", width: 15 },
    { header: "totalAdjSecondary", key: "totSec", width: 18 },
    { header: "Secondary_Excess", key: "secEx", width: 18 },
    { header: "PendingCapFromSecondary", key: "cap2", width: 15 },
    { header: "totalAdjTertiary", key: "totTer", width: 18 },
    { header: "Tertiary_Excess", key: "terEx", width: 18 },
    { header: "RemittanceCount", key: "remCount", width: 12 },
    { header: "AdjustmentCount", key: "adjCount", width: 12 },
  ];
  for (const s of statsRows) {
    ws.addRow({
      claimId: s.claimId,
      cap1: s.PendingCapFromPrimary.toFixed(2),
      totSec: s.totalAdjSecondary.toFixed(2),
      secEx: s.Secondary_Excess.toFixed(2),
      cap2: s.PendingCapFromSecondary.toFixed(2),
      totTer: s.totalAdjTertiary.toFixed(2),
      terEx: s.Tertiary_Excess.toFixed(2),
      remCount: s.remittanceCount,
      adjCount: s.adjustmentCount,
    });
  }
  await wb.xlsx.writeFile(destPath);
  console.log("Wrote stats xlsx to", destPath);
}

module.exports = { writeStatsXlsx };
