// fetchClaims.js
const { HttpConnection } = require("../../http");
const { fetchAllFetchXml } = require("../../utils/dataverse");

const CLAIMS_FETCHXML = `
<fetch distinct="true">
  <entity name="smvs_claim">
    <attribute name="smvs_claimid"/>
    <attribute name="smvs_claimed_amount"/>
    <attribute name="smvs_recieved_amount"/>
    <attribute name="smvs_patient_responsible_payment"/>
    <attribute name="smvs_pending_from_additional_payer"/>
    <attribute name="smvs_adjustment_amount"/>

    <!-- Claims that have at least one remittance -->
    
    <link-entity name="smvs_patient_remittance" from="smvs_claim_id" to="smvs_claimid" link-type="inner" alias="rem">
    
      <!-- Remittances that have at least one adjustment detail with amount > 0 -->
      
      <link-entity name="smvs_claim_adjustment_detail" from="smvs_patient_remittance" to="smvs_patient_remittanceid" link-type="inner" alias="cad">
        <filter>
          <condition attribute="smvs_amount" operator="gt" value="0"/>
        </filter>
      </link-entity>
    </link-entity>
  </entity>
</fetch>
`;

async function fetchClaimsHavingRemittance() {
  const httpConn = new HttpConnection({ logRequests: false });
  console.log("Listing all claim IDs initially");
  const rows = await fetchAllFetchXml(httpConn, CLAIMS_FETCHXML, 5000, true);
  return rows;
}

module.exports = { fetchClaims: fetchClaimsHavingRemittance };
