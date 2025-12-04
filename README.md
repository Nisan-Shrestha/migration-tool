# Dataverse Migration Tool

## For Claim Adjustment Details

This tool performs a deterministic correction of `smvs_amount` values in

`smvs_claim_adjustment_detail` based on remittance caps from

`smvs_patient_remittance`.

It supports:

- **Dry-run (compute + export only)**
- **Apply (patch Dataverse)**
- **Rollback (restore from backups)**

All phases are modular and can be run independently.

---

# **Repository Structure**

```
repo/
  cli.js                   # CLI entrypoint
  http.js                  # Dataverse HTTP client (provided externally)
  constants.js

  migrations/
    migration-runner.js    # Orchestrates dry-run, apply, rollback

    compute/
      computeProposals.js

    queries/
      fetchClaims.js
      fetchRemittances.js
      fetchAdjustments.js

    export/
      writeStatsXlsx.js
      writeProposalsXlsx.js
      writeBackupCsv.js

    apply/
      patchAdjustments.js

    rollback/
      rollbackFromBackup.js

  utils/
    dataverse.js           # Paging, fetch helpers
    helpers.js             # retry(), chunk(), loadClaimFilters(), etc.

```

---

# **Core Behavior**

### 1. **Fetch**

Fetch claims → remittances → adjustments, using paging for Dataverse’s 5000-record limit.

Claim filtering is supported via CLI flags.

### 2. **Compute**

For each claim:

- Compute `PendingCapFromPrimary`
- Compute `PendingCapFromSecondary`
- Identify excess in secondary / tertiary adjustments
- Sort adjustments (descending by value, tie-break by createdon + ID)
- Reduce values until total ≤ cap

Output: list of proposed changes.

### 3. **Export**

Dry-run produces:

- `reports/exports/Claim_Adjustment_Cap_Stats.xlsx`
- `reports/proposals/Proposed_Adjustments_batch_XXXX.xlsx`
- `reports/backups/backup_batch_XXXX.csv` (one per batch)

### 4. **Apply**

Reads a proposal batch, validates current values match expectations, then PATCHes

`smvs_amount` for rows that need changes.

Writes to `audit-log.csv`.

### 5. **Rollback**

Restores values using the original backup CSV.

Writes `<backup>.rollback-audit.csv`.

---

# **CLI Usage**

Run everything with:

```
node cli.js <command> [options]

```

---

## **1. Dry-run (no updates)**

```
node cli.js dry-run

```

Generates stats, proposals, and backups.

### Options

| Option                 | Description                       |
| ---------------------- | --------------------------------- |
| `--batchSize <n>`      | Claims per batch (default: 2000)  |
| `--concurrency <n>`    | Parallel fetch limit (default: 6) |
| `--claims <comma IDs>` | Process only listed claim IDs     |
| `--claims-file <path>` | File containing claim IDs         |

### Examples

Only specific claims:

```
node cli.js dry-run --claims 111,222,333

```

Using file:

```
node cli.js dry-run --claims-file ./claims.txt

```

Larger batches:

```
node cli.js dry-run --batchSize 250

```

---

## **2. Apply (update Dataverse)**

```
node cli.js apply --proposals reports/proposals/Proposed_Adjustments_batch_0001.xlsx

```

### Options

| Option               | Description                    |
| -------------------- | ------------------------------ |
| `--proposals <path>` | Required                       |
| `--concurrency <n>`  | Patch parallelism (default: 4) |

---

## **3. Rollback**

```
node cli.js rollback --file reports/backups/backup_batch_0001.csv

```

Restores original amounts.

---

# **Input Filtering**

## `-claims`

Comma-separated claim IDs. No spaces.

Example:

```
--claims 123,456,789

```

## `-claims-file`

File containing IDs. Supports:

- One per line
- CSV line
- Mixed formats (extracted via regex)

Example file:

```
12345
23456
34567

```

Run:

```
--claims-file ./ids.txt

```

---

# **Output Files (Generated)**

| Type          | Location               | Content                       |
| ------------- | ---------------------- | ----------------------------- |
| Stats XLSX    | `reports/exports/`     | Per-claim cap + totals        |
| Proposal XLSX | `reports/proposals/`   | Per-batch proposed new values |
| Backups       | `reports/backups/`     | Original `smvs_amount` values |
| Audit log     | `audit-log.csv`        | Apply history                 |
| Rollback logs | `*.rollback-audit.csv` | Per-backup restore results    |

---

# **Dataverse Behavior**

- Pagination: handled via `@odata.nextLink`
- Page size: Dataverse typically returns max 5000 rows per page
- Throttling: 429 handled via retry + backoff
- All updates are individual PATCH calls (no transactions)
- Updates skip rows where proposed value equals current value

---

# **Failure Handling**

- Each batch is independent
- Backups created before any modification
- Apply checks for mismatched existing values
- Failed rows are logged
- A batch can be safely re-run
- Rollback works for individual batches

---

# **Performance Tuning**

- Reduce concurrency if throttled:

  ```
  --concurrency 2

  ```

- Increase batch size if too many XLSX files:

  ```
  --batchSize 500

  ```

- Use `-claims` / `-claims-file` for targeted testing

---

# **Typical Workflow**

### 1. Test small subset

```
node cli.js dry-run --claims-file ./sample.txt

```

### 2. Inspect proposals

Open files under `reports/proposals/`.

### 3. Apply a single batch

```
node cli.js apply --proposals reports/proposals/Proposed_Adjustments_batch_0001.xlsx

```

### 4. Rollback if needed

```
node cli.js rollback --file reports/backups/backup_batch_0001.csv

```
