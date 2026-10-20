# Database ER diagram

Phase 1 data model from `packages/db/prisma/schema.prisma` (PostgreSQL 17 on Neon), compared with what the frontend screens need. The frontend checked is the active static build in the `HRMS-PrimeStar` repo, `po-only` branch, including its uncommitted work.

Every table also has `createdAt`, `updatedAt` and `createdById`. These are left out of the diagrams to keep them readable. IDs are UUID v7. Money is `Decimal(14,2)`, and dates are plain dates in India time.

## 1. Overview

All 23 tables and how they connect. Read `||--o{` as "one to many" and `|o--o{` as "optional one to many".

```mermaid
erDiagram
    User ||--o{ UserRole : has
    Role ||--o{ UserRole : "granted by"
    User ||--o{ Session : "logs in with"
    User ||--o{ Notification : receives
    Employee |o--o| User : "login for"

    Client ||--o{ Project : owns
    Client ||--o{ PurchaseOrder : issues
    Project ||--o{ ProjectManager : "managed by"
    Employee ||--o{ ProjectManager : manages
    Project ||--o{ Sow : "covered by"
    Project ||--o{ Quote : has
    Sow |o--o{ Quote : "priced by"

    Project ||--o{ PurchaseOrder : "funded by"
    Sow |o--o{ PurchaseOrder : "basis for"
    Quote |o--o{ PurchaseOrder : "accepted as"
    PurchaseOrder |o--o| PurchaseOrder : "renewed as"
    PurchaseOrder ||--o{ PoAmendment : "changed by"
    PurchaseOrder ||--o{ PoComment : has

    PurchaseOrder ||--o{ Invoice : "billed by"
    Invoice ||--o{ InvoiceLine : "split into"
    PurchaseOrder ||--o{ BillingMilestone : schedules
    Invoice |o--o{ BillingMilestone : settles
    PurchaseOrder ||--o{ ProformaInvoice : drafts
    Invoice |o--o{ ProformaInvoice : "converted to"

    PurchaseOrder |o--o{ Assignment : staffs
    Project ||--o{ Assignment : staffs
    Employee ||--o{ Assignment : "works on"
    Assignment |o--o| Assignment : "replaced by"
    Assignment |o--o{ InvoiceLine : "billed in"
    Employee ||--o{ InvoiceLine : "billed in"
    Employee |o--o{ ProformaInvoice : "billed in"

    Employee |o--o{ Employee : "reports to"
    Employee ||--o{ EmploymentPeriod : "employed in"
    Employee ||--o{ SensitiveId : "PAN / Aadhaar"

    File |o--o{ Sow : document
    File |o--o{ Quote : document
    File |o--o{ PurchaseOrder : document
    File |o--o{ Invoice : document

    AuditLog {
        string entityType
        uuid entityId
    }
    Setting {
        string key PK
    }
```

`AuditLog` points at any table through `entityType` + `entityId`, so it has no foreign keys. `Setting` holds the alert thresholds and recipient roles that the daily alert job reads.

## 2. Users and access

```mermaid
erDiagram
    User {
        uuid id PK
        string username UK
        string email UK
        string passwordHash "argon2id, null until set"
        enum status "INVITED ACTIVE LOCKED DISABLED"
        int failedLoginCount
        datetime lockedUntil
        datetime lastLoginAt
        uuid employeeId FK,UK
    }
    Role {
        uuid id PK
        string key UK
        string name
        string description
        string_list permissions "po.edit, invoice.create ..."
        boolean isSystem
    }
    UserRole {
        uuid userId PK,FK
        uuid roleId PK,FK
        datetime assignedAt
        uuid assignedById
    }
    Session {
        uuid id PK
        uuid userId FK
        string refreshTokenHash UK
        datetime expiresAt
        datetime revokedAt
        uuid replacedById "rotation chain"
        string ip
        string userAgent
    }
    Notification {
        uuid id PK
        uuid userId FK
        string type "expiry low_balance milestone ..."
        string title
        string body
        string link
        string dedupeKey "unique per user"
        datetime readAt
    }
    User ||--o{ UserRole : has
    Role ||--o{ UserRole : "granted by"
    User ||--o{ Session : "refresh tokens"
    User ||--o{ Notification : receives
```

## 3. Clients, projects and contracts

```mermaid
erDiagram
    Client {
        uuid id PK
        string name UK
        string gstin
        string billingAddress
    }
    Project {
        uuid id PK
        string code UK
        string name
        uuid clientId FK
        enum status "ACTIVE ON_HOLD COMPLETED"
        date startDate
        date endDate
    }
    ProjectManager {
        uuid projectId PK,FK
        uuid employeeId PK,FK
        boolean isPrimary
    }
    Sow {
        uuid id PK
        string sowNumber "unique per project"
        string title
        uuid projectId FK
        date effectiveDate
        date expiryDate
        decimal valueExGst
        enum status "ACTIVE EXPIRED SUPERSEDED"
        uuid fileId FK
    }
    Quote {
        uuid id PK
        string quoteNumber "unique per project"
        uuid projectId FK
        uuid sowId FK
        date quoteDate
        decimal amountExGst
        decimal gstRate
        enum status "PENDING APPROVED REJECTED"
        uuid fileId FK
    }
    Client ||--o{ Project : owns
    Project ||--o{ ProjectManager : "managed by"
    Project ||--o{ Sow : "covered by"
    Project ||--o{ Quote : has
    Sow |o--o{ Quote : "priced by"
```

## 4. Purchase orders

```mermaid
erDiagram
    PurchaseOrder {
        uuid id PK
        string poNumber "unique per client"
        uuid clientId FK
        uuid projectId FK
        uuid sowId FK
        uuid quoteId FK
        string requesterName
        date startDate
        date endDate
        decimal originalAmountExGst
        decimal amountExGst "after approved amendments"
        enum gstType "IGST CGST_SGST"
        decimal gstRate
        decimal amountInclGst
        string billingAddress
        string shippingAddress
        enum status "ACTIVE RENEWED EXHAUSTED EXPIRED CLOSED"
        uuid previousPoId FK,UK "renewal chain"
        string closedReason
        datetime closedAt
        uuid fileId FK
        int version "optimistic lock"
    }
    PoAmendment {
        uuid id PK
        uuid poId FK
        string field "amountExGst endDate ..."
        string oldValue
        string newValue
        string reason
        date effectiveDate
        enum status "PENDING APPROVED REJECTED"
        uuid approvedById
        datetime approvedAt
        string rejectionReason
    }
    PoComment {
        uuid id PK
        uuid poId FK
        string body
    }
    PurchaseOrder |o--o| PurchaseOrder : "renewed as"
    PurchaseOrder ||--o{ PoAmendment : "changed by"
    PurchaseOrder ||--o{ PoComment : has
```

The remaining balance isn't stored. It's worked out as `amountExGst − issued invoices + credit notes`, ignoring cancelled invoices. "Expiring soon" and "running low" are warnings worked out each day, not stored statuses.

## 5. Billing

```mermaid
erDiagram
    Invoice {
        uuid id PK
        string invoiceNumber UK
        uuid poId FK
        enum type "INVOICE CREDIT_NOTE"
        enum status "ISSUED PAID CANCELLED"
        date paidAt
        date billingMonth "first day of month"
        date periodStart
        date periodEnd
        date invoiceDate
        date dueDate
        decimal amountExGst
        decimal gstRate
        decimal gstAmount
        decimal amountInclGst
        string overrideReason "over balance or outside PO dates"
        string cancelReason
        uuid fileId FK
    }
    InvoiceLine {
        uuid id PK
        uuid invoiceId FK
        uuid employeeId FK
        uuid assignmentId FK
        decimal monthlyRate
        decimal allocationPercent
        decimal eligibleDays
        int daysInMonth
        decimal calculatedAmount
        decimal attributedAmount
        string overrideReason
    }
    BillingMilestone {
        uuid id PK
        uuid poId FK
        string title
        date dueDate
        decimal amountExGst
        enum status "PENDING INVOICED CANCELLED"
        uuid invoiceId FK
    }
    ProformaInvoice {
        uuid id PK
        string proformaNumber UK
        uuid poId FK
        uuid employeeId FK
        date billingMonth
        date periodStart
        date periodEnd
        enum billableDaysMethod "CALENDAR WORKING_DAYS MANUAL"
        decimal billableDays
        decimal amountExGst
        decimal gstAmount
        decimal amountInclGst
        enum status "DRAFT SENT APPROVED INVOICED CANCELLED"
        int version
        json lineItems
        json history "earlier versions"
        string recipientEmail
        datetime sentAt
        uuid invoiceId FK
    }
    Invoice ||--o{ InvoiceLine : "split into"
    Invoice |o--o{ BillingMilestone : settles
    Invoice |o--o{ ProformaInvoice : "converted to"
```

## 6. Employees and assignments

```mermaid
erDiagram
    Employee {
        uuid id PK
        string empCode UK
        string fullName
        string email UK
        string phone
        string designation
        string department
        string location
        string_list skills
        enum status "CANDIDATE ACTIVE RESIGNED"
        enum pipelineStage "YET_TO_JOIN WILL_JOIN JOINED ..."
        date doj
        uuid managerId FK
    }
    Assignment {
        uuid id PK
        uuid poId FK "optional: null = unbilled"
        uuid projectId FK
        uuid employeeId FK
        date fromDate
        date toDate
        decimal allocationPercent
        decimal billingRatePerMonth
        enum billableDaysMethod
        decimal manualBillableDays
        string endedReason
        uuid replacedById FK,UK
    }
    EmploymentPeriod {
        uuid id PK
        uuid employeeId FK
        date joinDate
        date lastWorkingDate
        string resignationReason
    }
    SensitiveId {
        uuid id PK
        uuid employeeId FK
        enum kind "PAN AADHAAR"
        bytes ciphertext "AES-256-GCM"
        string last4
        string lookupHash "HMAC, unique per kind"
    }
    Employee |o--o{ Employee : "reports to"
    Employee ||--o{ Assignment : "works on"
    Assignment |o--o| Assignment : "replaced by"
    Employee ||--o{ EmploymentPeriod : "employed in"
    Employee ||--o{ SensitiveId : "PAN / Aadhaar"
```

## 7. Files, audit and settings

```mermaid
erDiagram
    File {
        uuid id PK
        string storageKey UK "Cloudinary public_id"
        string originalName
        string mimeType
        int sizeBytes "max 10 MB"
        string sha256
        enum scanStatus "PENDING CLEAN INFECTED"
        datetime deletedAt
    }
    AuditLog {
        uuid id PK
        string entityType
        uuid entityId
        string action
        json before
        json after
        string reason
        uuid actorId
        string actorIp
        datetime createdAt "append-only"
    }
    Setting {
        string key PK "e.g. alerts"
        json value
        uuid updatedById
    }
```

---

## Gaps between the frontend and the schema

These are things the screens on `po-only` use that the schema can't store yet. They're proposals only; none are applied. Each one needs a decision before the first migration.

| # | Frontend screen | What the UI does | Schema today | Proposed change |
| --- | --- | --- | --- | --- |
| 1 | Assignments | An assignment can be saved with a project and **no PO** (`poId` optional) | ✅ **Decided: allowed.** Done in the schema | `poId` is now optional and the table is renamed `Assignment`. Assignments without a PO are flagged as unbilled. |
| 2 | Assignments | Status **On Hold**, a free-text **notes** field, termination date and reason | Only `toDate` and `endedReason` | Add `onHold boolean` (or `status` enum) and `notes`. Termination maps to `toDate` + `endedReason`. |
| 3 | Invoices, PO detail | Status dropdown includes **Paid** and **Pending** | ✅ **Decided: in scope, kept small.** Done in the schema | `PAID` status + `paidAt` + `paidById`. No part payments. "Pending" in the UI means `ISSUED` and not yet paid. |
| 4 | Documents | Upload any document (type, linked project or PO, expiry date, notes, status Verified) | `File` holds only bytes metadata, linked from SOW/Quote/PO/Invoice | Add a `Document` table: `fileId, type, projectId?, poId?, expiryDate?, notes, status` |
| 5 | PO amend modal | Amendment has a **document reference** | No field | Add `PoAmendment.fileId` (or `documentRef` text) |
| 6 | Users & Roles, login | Invite link, password reset link, **must change password** flag | No token storage, no flag | Add `UserToken` table (`userId, kind INVITE/RESET, tokenHash, expiresAt, usedAt`) and `User.mustChangePassword` |
| 7 | Users & Roles | Users have a display **name**, even when not linked to an employee | `User` has only `username` and `email` | Add `User.name` |
| 8 | Users & Roles | CEO role is **locked** (its permissions can't change) | Only `isSystem` (can't delete) | Add `Role.isLocked` |
| 9 | Projects / PO create | Client is typed as a name; SOW number is free text on the PO form | `Client` and `Sow` are real tables | Keep the schema. The PO form should pick a client and SOW from lists, or create them inline. |
| 10 | PO tracker | **Delete PO** button | ✅ **Decided: no hard delete** (Architecture doc: POs are never hard-deleted) | Frontend: replace Delete with **Close PO** plus a reason. A PO created by mistake is closed with the reason "Created in error". No schema change. |
| 11 | PO create | No **GST type** field | ✅ **Decided: pre-filled and editable** | Add `PurchaseOrder.billingState`. GST type is pre-filled from the PO's billing state vs Prime Star's state (a company setting): same state gives CGST + SGST, different gives IGST. The user can change it. |

**These need no change, only mapping in the API:**

| Frontend | Database |
| --- | --- |
| PO status `Expiring Soon`, `Low Balance` | Worked out from `endDate` and balance, not stored |
| PO status `Fully Utilized` | `EXHAUSTED` |
| Milestone `Upcoming` | `PENDING` |
| Project headcount, total PO value, remaining balance | Worked out from assignments, POs and invoices |
| PO activity log, access audit log | `AuditLog` rows |
| Alert settings screen | `Setting` row with key `alerts` |
| Data import | Normal inserts plus `AuditLog`, no extra table |
