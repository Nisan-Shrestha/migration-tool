// helpers.js - small utilities reused across modules
const Decimal = require("decimal.js");

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function patchWithRetries(httpConn, url, data, maxAttempts = 2) {
  let attempt = 0;
  const base = 500;
  while (attempt < maxAttempts) {
    attempt++;
    try {
      await httpConn.patch(url, data);
      return { ok: true };
    } catch (err) {
      const status = err?.response?.status;
      if (status && status >= 400 && status < 500 && status !== 429) {
        return { ok: false, nonRetryable: true, err };
      }
      let wait = base * Math.pow(2, attempt);
      const ra = err?.response?.headers?.["retry-after"];
      if (ra) {
        const maybe = Number(ra);
        if (!Number.isNaN(maybe)) wait = Math.max(wait, maybe * 1000);
      }
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  return { ok: false, err: new Error("max attempts exceeded") };
}

module.exports = { chunkArray, patchWithRetries };
