// fetchClaims.js
const { HttpConnection } = require("../../http");
const { fetchAllFetchXml } = require("../../utils/dataverse");

const CLAIMS_FETCHXML = `
<fetch>
  <entity name="smvs_claim">
    <attribute name="smvs_claimid" />
  </entity>
</fetch>
`;

async function fetchClaims() {
  const httpConn = new HttpConnection({ logRequests: false });
  console.log("Listing all claim IDs initially");
  const rows = await fetchAllFetchXml(httpConn, CLAIMS_FETCHXML, 5000, true);
  return rows;
}

module.exports = { fetchClaims };
