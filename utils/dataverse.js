// dataverse.js - wrapper to support FetchXML paging
const { HttpConnection } = require("../http");

/**
 * fetchAllFetchXml - repeatedly call httpConn.query(fetchXml) paging by replacing page/count attributes
 * This assumes HttpConnection.query expects fetchXml string and returns { data: { value: [...] } }.
 */
async function fetchAllFetchXml(
  httpConn,
  fetchXmlTemplate,
  pageSize = 5000,
  logProgress = false
) {
  let page = 1;
  let all = [];
  if (logProgress) console.log("Starting fetchAllFetchXml...");
  while (true) {
    if (logProgress) console.log("Fetching Page:", page);
    const fetchXml = fetchXmlTemplate.replace(/<fetch\b([^>]*)>/, (m, g1) => {
      if (g1.includes("page=")) return `<fetch ${g1}>`;
      return `<fetch page="${page}" count="${pageSize}" ${g1.trimStart()}>`;
    });
    const http = httpConn; // might be instance or class? Expect instance passed
    const resp = await httpConn.query(fetchXml);
    if (!resp || !resp.data) break;
    const arr = resp.data.value || [];
    all = all.concat(arr);
    if (arr.length < pageSize) break;
    page += 1;
  }
  if (logProgress) console.log(`Fetched total records: ${all.length}`);
  return all;
}

module.exports = { fetchAllFetchXml };
