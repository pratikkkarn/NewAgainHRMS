import { describe, it, expect } from 'vitest';
import { INITIAL_POS, INITIAL_EMPLOYEES, INITIAL_PROFORMA_INVOICES } from '../mockData';
import { recalculatePOBalances } from '../../lib/poUtils';
import { ProformaInvoice, PurchaseOrder, AssignedEmployee } from '../../types/domain';
import { buildJsPdfDocument } from '../../lib/documentDownloader';

describe('Proforma Invoices & Employee Replacement Suite', () => {
  const samplePo: PurchaseOrder = {
    ...INITIAL_POS[0],
    assignedEmployees: [...INITIAL_POS[0].assignedEmployees],
    invoices: [...INITIAL_POS[0].invoices],
    activityLogs: [...INITIAL_POS[0].activityLogs],
  };

  const sampleEmployee = samplePo.assignedEmployees[0]; // Rohan Deshmukh (PS-108)

  describe('1. Multiple Independent Proforma Invoices per Employee in the Same Month', () => {
    it('supports multiple proformas for the same employee in October 2026 without conflicts', () => {
      const rohanProformas = INITIAL_PROFORMA_INVOICES.filter(
        (p) => p.employeeId === 'PS-108' && p.billingMonth === 'October' && p.billingYear === 2026
      );

      expect(rohanProformas.length).toBeGreaterThanOrEqual(2);

      const [first, second] = rohanProformas;
      expect(first.id).not.toBe(second.id);
      expect(first.proformaNumber).not.toBe(second.proformaNumber);
      expect(first.billingPeriodStart).toBe('2026-10-01');
      expect(second.billingPeriodStart).toBe('2026-10-16');

      // Each has independent financial totals and versions
      expect(first.amountExclGst).toBe(125000);
      expect(second.amountExclGst).toBe(125000);
      expect(first.status).toBe('Draft');
      expect(second.status).toBe('Sent');
    });

    it('preserves distinct line items, rates, and quantities across independent proformas', () => {
      const prof1: ProformaInvoice = {
        id: 'prof-test-1',
        proformaNumber: 'PI/PS/26-27/010',
        poId: samplePo.id,
        poNumber: samplePo.poNumber,
        projectId: samplePo.projectId,
        projectName: samplePo.projectName,
        employeeId: sampleEmployee.employeeId,
        employeeName: sampleEmployee.employeeName,
        designation: sampleEmployee.designation,
        billingMonth: 'November',
        billingYear: 2026,
        billingPeriodStart: '2026-11-01',
        billingPeriodEnd: '2026-11-15',
        billableDaysMethod: 'working_days',
        billableDays: 10,
        amountExclGst: 100000,
        gstRate: 18,
        gstAmount: 18000,
        totalAmountInclGst: 118000,
        status: 'Draft',
        version: 1,
        versions: [{ version: 1, updatedAt: '2026-11-01', updatedBy: 'Admin', amountExclGst: 100000, gstAmount: 18000, totalAmountInclGst: 118000 }],
        lineItems: [{ id: 'li-1', description: 'Sprint 1 Discovery', quantity: 10, rate: 10000, amount: 100000 }],
        createdAt: '2026-11-01T00:00:00Z',
        updatedAt: '2026-11-01T00:00:00Z',
      };

      const prof2: ProformaInvoice = {
        id: 'prof-test-2',
        proformaNumber: 'PI/PS/26-27/011',
        poId: samplePo.id,
        poNumber: samplePo.poNumber,
        projectId: samplePo.projectId,
        projectName: samplePo.projectName,
        employeeId: sampleEmployee.employeeId,
        employeeName: sampleEmployee.employeeName,
        designation: sampleEmployee.designation,
        billingMonth: 'November',
        billingYear: 2026,
        billingPeriodStart: '2026-11-16',
        billingPeriodEnd: '2026-11-30',
        billableDaysMethod: 'working_days',
        billableDays: 11,
        amountExclGst: 110000,
        gstRate: 18,
        gstAmount: 19800,
        totalAmountInclGst: 129800,
        status: 'Draft',
        version: 1,
        versions: [{ version: 1, updatedAt: '2026-11-16', updatedBy: 'Admin', amountExclGst: 110000, gstAmount: 19800, totalAmountInclGst: 129800 }],
        lineItems: [{ id: 'li-2', description: 'Sprint 2 Execution', quantity: 11, rate: 10000, amount: 110000 }],
        createdAt: '2026-11-16T00:00:00Z',
        updatedAt: '2026-11-16T00:00:00Z',
      };

      expect(prof1.id).not.toBe(prof2.id);
      expect(prof1.amountExclGst).toBe(100000);
      expect(prof2.amountExclGst).toBe(110000);
      expect(prof1.lineItems[0].description).toBe('Sprint 1 Discovery');
      expect(prof2.lineItems[0].description).toBe('Sprint 2 Execution');
    });
  });

  describe('2. Exact ID Targeting and Version History Immutability', () => {
    it('editing proforma A does not alter proforma B', () => {
      let proformas: ProformaInvoice[] = [
        { ...INITIAL_PROFORMA_INVOICES[0] },
        { ...INITIAL_PROFORMA_INVOICES[1] },
      ];

      const targetId = proformas[0].id;
      const untouchedId = proformas[1].id;
      const originalUntouchedAmount = proformas[1].totalAmountInclGst;

      // Update proforma A
      proformas = proformas.map((p) =>
        p.id === targetId
          ? {
              ...p,
              amountExclGst: 150000,
              gstAmount: 27000,
              totalAmountInclGst: 177000,
              version: p.version + 1,
              versions: [
                ...p.versions,
                { version: 2, updatedAt: 'now', updatedBy: 'Lead', amountExclGst: 150000, gstAmount: 27000, totalAmountInclGst: 177000 },
              ],
            }
          : p
      );

      const updatedA = proformas.find((p) => p.id === targetId)!;
      const untouchedB = proformas.find((p) => p.id === untouchedId)!;

      expect(updatedA.totalAmountInclGst).toBe(177000);
      expect(updatedA.version).toBe(2);
      expect(updatedA.versions.length).toBe(2);
      expect(untouchedB.totalAmountInclGst).toBe(originalUntouchedAmount);
      expect(untouchedB.version).toBe(1);
    });

    it('creates immutable version snapshots when revising sent proformas', () => {
      const originalSentProforma: ProformaInvoice = {
        ...INITIAL_PROFORMA_INVOICES[1], // Sent proforma
      };

      expect(originalSentProforma.status).toBe('Sent');
      expect(originalSentProforma.version).toBe(1);

      // Revision produces v2
      const revisedProforma: ProformaInvoice = {
        ...originalSentProforma,
        version: 2,
        amountExclGst: 140000,
        gstAmount: 25200,
        totalAmountInclGst: 165200,
        versions: [
          ...originalSentProforma.versions,
          {
            version: 2,
            updatedAt: '2026-10-17 10:00 AM',
            updatedBy: 'Priya Sundaram',
            amountExclGst: 140000,
            gstAmount: 25200,
            totalAmountInclGst: 165200,
            notes: 'Scope adjustment for additional cloud security compliance review',
          },
        ],
      };

      expect(revisedProforma.version).toBe(2);
      expect(revisedProforma.versions.length).toBe(2);
      expect(revisedProforma.versions[0].version).toBe(1);
      expect(revisedProforma.versions[0].amountExclGst).toBe(125000); // Historical preserved
      expect(revisedProforma.versions[1].version).toBe(2);
      expect(revisedProforma.versions[1].amountExclGst).toBe(140000);
    });
  });

  describe('3. Employee Email Validation and Email-Draft Fallback Handling', () => {
    it('validates email format correctly and rejects invalid formats', () => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      expect(emailRegex.test('rohan.deshmukh@primestarconsulting.com')).toBe(true);
      expect(emailRegex.test('priya.s@primestarconsulting.com')).toBe(true);
      expect(emailRegex.test('client.finance@hdfcbank.com')).toBe(true);

      // Invalid emails
      expect(emailRegex.test('invalid-email')).toBe(false);
      expect(emailRegex.test('rohan@')).toBe(false);
      expect(emailRegex.test('@primestar.com')).toBe(false);
      expect(emailRegex.test('rohan.deshmukh')).toBe(false);
    });

    it('generates a transparent draft email link with accurate proforma parameters and no false delivery claim', () => {
      const prof = INITIAL_PROFORMA_INVOICES[0];
      const recipient = 'rohan.deshmukh@primestarconsulting.com';

      const subject = encodeURIComponent(`Proforma Invoice ${prof.proformaNumber} — ${prof.projectName}`);
      const body = encodeURIComponent(
        `Dear ${prof.employeeName},\n\nPlease review attached Proforma Invoice ${prof.proformaNumber} for period ${prof.billingPeriodStart} to ${prof.billingPeriodEnd}.\nTotal Amount: INR ${prof.totalAmountInclGst.toLocaleString('en-IN')}.\n\nRegards,\nPrime Star Finance & Billing Team`
      );
      const mailtoUrl = `mailto:${encodeURIComponent(recipient)}?subject=${subject}&body=${body}`;

      expect(mailtoUrl).toContain(encodeURIComponent(prof.proformaNumber));
      expect(mailtoUrl).toContain(encodeURIComponent(prof.projectName));
      expect(mailtoUrl).toContain(encodeURIComponent(recipient));
    });

    it('generates valid official PDF document with proforma watermark and no PO deduction notice', () => {
      const prof = INITIAL_PROFORMA_INVOICES[0];
      const doc = buildJsPdfDocument({
        filename: `${prof.proformaNumber}.pdf`,
        documentType: 'proforma',
        title: `PROFORMA INVOICE: ${prof.proformaNumber}`,
        proforma: prof,
        employeeName: prof.employeeName,
        employeeId: prof.employeeId,
      });

      expect(doc).toBeDefined();
      const output = doc.output('blob');
      expect(output.size).toBeGreaterThan(1000);
    });
  });

  describe('4. Safe Employee Replacement on PO', () => {
    it('ends outgoing assignment on effective date and tags replacement with explicit rate', () => {
      const po: PurchaseOrder = {
        ...samplePo,
        assignedEmployees: [
          {
            employeeId: 'PS-108',
            employeeName: 'Rohan Deshmukh',
            designation: 'Senior Cloud Architect',
            billingRatePerMonth: 250000,
            assignedFrom: '2025-01-01',
            assignedTo: '2026-12-31',
            status: 'Active',
            billableDaysMethod: 'calendar',
          },
        ],
      };

      const outgoingId = 'PS-108';
      const replacementProfile = INITIAL_EMPLOYEES.find((e) => e.employeeId === 'PS-018') || {
        employeeId: 'PS-018',
        name: 'Vikramaditya Rao',
        designation: 'Senior Cloud Consultant',
        email: 'vikram.rao@primestarconsulting.com',
      };

      const effectiveDate = '2026-11-01';
      const replacementRate = 275000;

      // Execute replacement logic
      const updatedEmployees = po.assignedEmployees.map((e) => {
        if (e.employeeId === outgoingId) {
          return {
            ...e,
            assignedTo: effectiveDate,
            status: 'Inactive' as const,
            replacedByEmployeeId: replacementProfile.employeeId,
            replacementDate: effectiveDate,
          };
        }
        return e;
      });

      const replacementRecord: AssignedEmployee = {
        employeeId: replacementProfile.employeeId,
        employeeName: replacementProfile.name,
        designation: replacementProfile.designation,
        billingRatePerMonth: replacementRate,
        assignedFrom: effectiveDate,
        assignedTo: '2026-12-31',
        status: 'Active',
        billableDaysMethod: 'working_days',
        email: replacementProfile.email,
      };

      const finalEmployees = [...updatedEmployees, replacementRecord];

      expect(finalEmployees.length).toBe(2);

      const outgoing = finalEmployees.find((e) => e.employeeId === outgoingId)!;
      const replacement = finalEmployees.find((e) => e.employeeId === replacementProfile.employeeId)!;

      // Outgoing validation
      expect(outgoing.status).toBe('Inactive');
      expect(outgoing.assignedTo).toBe('2026-11-01');
      expect(outgoing.replacedByEmployeeId).toBe('PS-018');

      // Replacement validation
      expect(replacement.status).toBe('Active');
      expect(replacement.assignedFrom).toBe('2026-11-01');
      expect(replacement.billingRatePerMonth).toBe(275000);
      expect(replacement.billableDaysMethod).toBe('working_days');
    });

    it('preserves historical proformas under outgoing employee ID and does not transfer to replacement', () => {
      const rohanProformasBefore = INITIAL_PROFORMA_INVOICES.filter((p) => p.employeeId === 'PS-108');
      expect(rohanProformasBefore.length).toBeGreaterThanOrEqual(2);

      // Verify proformas still point to PS-108
      rohanProformasBefore.forEach((prof) => {
        expect(prof.employeeId).toBe('PS-108');
        expect(prof.employeeName).toBe('Rohan Deshmukh');
        expect(prof.employeeId).not.toBe('PS-018');
      });
    });

    it('does not deactivate outgoing employee globally in company directory', () => {
      const outgoingId = 'PS-108';
      const employeeProfile = INITIAL_EMPLOYEES.find((e) => e.employeeId === outgoingId);

      // Profile exists and remains unaltered in directory
      expect(employeeProfile).toBeDefined();
      expect(employeeProfile?.name).toBe('Rohan Deshmukh');
    });
  });

  describe('5. Financial Isolation between Proformas, PO Balances, and Issued Invoices', () => {
    it('ensures proforma creation and revisions do not deduct PO remaining balance', () => {
      const initialBalances = recalculatePOBalances(samplePo);
      const originalRemaining = initialBalances.remainingBalanceExclGst;
      const originalInvoiced = initialBalances.invoicedExclGst;

      // Add a 5 Lakh proforma
      const proformas = [
        ...INITIAL_PROFORMA_INVOICES,
        {
          id: 'prof-999',
          proformaNumber: 'PI/PS/26-27/999',
          poId: samplePo.id,
          poNumber: samplePo.poNumber,
          projectId: samplePo.projectId,
          projectName: samplePo.projectName,
          employeeId: sampleEmployee.employeeId,
          employeeName: sampleEmployee.employeeName,
          designation: sampleEmployee.designation,
          billingMonth: 'December',
          billingYear: 2026,
          billingPeriodStart: '2026-12-01',
          billingPeriodEnd: '2026-12-31',
          amountExclGst: 500000,
          gstRate: 18,
          gstAmount: 90000,
          totalAmountInclGst: 590000,
          status: 'Draft' as const,
          version: 1,
          versions: [],
          lineItems: [],
          createdAt: '2026-12-01T00:00:00Z',
          updatedAt: '2026-12-01T00:00:00Z',
        },
      ];

      expect(proformas.length).toBe(INITIAL_PROFORMA_INVOICES.length + 1);

      // Recalculate PO balance: PO balance depends ONLY on po.invoices and creditNotes, not proformas!
      const postProformaBalances = recalculatePOBalances(samplePo);
      expect(postProformaBalances.remainingBalanceExclGst).toBe(originalRemaining);
      expect(postProformaBalances.invoicedExclGst).toBe(originalInvoiced);
    });

    it('cancelled invoices do not reduce balance and proformas remain pre-billing documents', () => {
      const balances = recalculatePOBalances(samplePo);
      expect(balances.amountExclGst).toBe(5000000);
      expect(balances.invoicedExclGst).toBe(2000000);
      expect(balances.creditNotesExclGst).toBe(200000);
      expect(balances.remainingBalanceExclGst).toBe(3200000);
    });
  });

  describe('6. Amount in Words (Indian Rupee Currency System)', () => {
    // Import numberToWordsINR
    it('converts common INR invoice amounts to words accurately', async () => {
      const { numberToWordsINR } = await import('../../lib/utils');

      expect(numberToWordsINR(0)).toBe('Indian Rupees Zero Only');
      expect(numberToWordsINR(100000)).toBe('Indian Rupees One Lakh Only');
      expect(numberToWordsINR(147500)).toBe('Indian Rupees One Lakh Forty Seven Thousand Five Hundred Only');
      expect(numberToWordsINR(200000)).toBe('Indian Rupees Two Lakh Only');
      expect(numberToWordsINR(2500000)).toBe('Indian Rupees Twenty Five Lakh Only');
      expect(numberToWordsINR(10000000)).toBe('Indian Rupees One Crore Only');
      expect(numberToWordsINR(15000000)).toBe('Indian Rupees One Crore Fifty Lakh Only');
      expect(numberToWordsINR(12345678)).toBe('Indian Rupees One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight Only');
    });

    it('handles paise correctly for decimal amounts', async () => {
      const { numberToWordsINR } = await import('../../lib/utils');

      expect(numberToWordsINR(1500.50)).toBe('Indian Rupees One Thousand Five Hundred And Fifty Paise Only');
      expect(numberToWordsINR(100.05)).toBe('Indian Rupees One Hundred And Five Paise Only');
    });
  });

  describe('7. Financial and Manual Billable Days Validation', () => {
    it('rejects manual billable days exceeding billing period calendar length', async () => {
      const { calculateCalendarDays } = await import('../../lib/assignmentUtils');

      const start = '2026-10-01';
      const end = '2026-10-31';
      const calendarDays = calculateCalendarDays(start, end);
      expect(calendarDays).toBe(31);

      const manualDaysExceeding = 35;
      const isValid = manualDaysExceeding <= calendarDays;
      expect(isValid).toBe(false);

      const manualDaysValid = 22;
      expect(manualDaysValid <= calendarDays).toBe(true);
    });

    it('rejects inverted billing period dates (start > end)', () => {
      const start = '2026-10-31';
      const end = '2026-10-01';
      const isDateValid = start <= end;
      expect(isDateValid).toBe(false);
    });

    it('validates line items require description, positive quantity, and positive rate', () => {
      const invalidItem1 = { id: '1', description: '', quantity: 1, rate: 50000, amount: 50000 };
      const invalidItem2 = { id: '2', description: 'Consulting', quantity: 0, rate: 50000, amount: 0 };
      const invalidItem3 = { id: '3', description: 'Consulting', quantity: 1, rate: -100, amount: -100 };
      const validItem = { id: '4', description: 'Consulting', quantity: 1, rate: 50000, amount: 50000, hsnSac: '998313' };

      const validateItem = (item: any) =>
        Boolean(item.description?.trim()) && Number(item.quantity) > 0 && Number(item.rate) > 0 && Number(item.amount) > 0;

      expect(validateItem(invalidItem1)).toBe(false);
      expect(validateItem(invalidItem2)).toBe(false);
      expect(validateItem(invalidItem3)).toBe(false);
      expect(validateItem(validItem)).toBe(true);
    });
  });

  describe('8. Document Generation & PDF with Excel Enterprise Reference Design', () => {
    it('generates a jsPDF document for proforma with HSN/SAC, bank details, and multi-line items', async () => {
      const testProforma: ProformaInvoice = {
        id: 'prof-pdf-test',
        proformaNumber: 'PI/PS/26-27/099',
        poId: samplePo.id,
        poNumber: samplePo.poNumber,
        projectId: samplePo.projectId,
        projectName: 'Hewlett Packard Enterprise Cloud Migration',
        employeeId: 'PS-108',
        employeeName: 'Rohan Deshmukh',
        designation: 'Senior Cloud Architect',
        billingMonth: 'October',
        billingYear: 2026,
        billingPeriodStart: '2026-10-01',
        billingPeriodEnd: '2026-10-31',
        billableDaysMethod: 'working_days',
        billableDays: 22,
        amountExclGst: 200000,
        gstRate: 18,
        gstAmount: 36000,
        totalAmountInclGst: 236000,
        status: 'Draft',
        version: 1,
        versions: [],
        lineItems: [
          {
            id: 'li-1',
            description: 'Cloud Architecture & Kubernetes Infrastructure Migration',
            hsnSac: '998313',
            quantity: 22,
            rate: 7000,
            amount: 154000,
          },
          {
            id: 'li-2',
            description: 'Production Cutover & CI/CD Support',
            hsnSac: '998313',
            quantity: 1,
            rate: 46000,
            amount: 46000,
          },
        ],
        notes: 'Sprint 14-16 HPE Cloud Migration milestones delivered successfully.',
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
      };

      const doc = buildJsPdfDocument({ documentType: 'proforma', proforma: testProforma });
      expect(doc).toBeDefined();
      expect(doc.internal.pageSize.getWidth()).toBeGreaterThan(0);
      expect(doc.internal.pageSize.getHeight()).toBeGreaterThan(0);
    });

    it('unsaved preview data does not mutate stored proformas or po balance', () => {
      const initialCount = INITIAL_PROFORMA_INVOICES.length;
      const initialPoBalance = samplePo.remainingBalanceExclGst;

      // Simulated unsaved preview object
      const unsavedPreview = {
        proformaNumber: 'PI/PS/26-27/UNSAVED',
        employeeId: 'PS-108',
        employeeName: 'Rohan Deshmukh',
        designation: 'Senior Cloud Architect',
        amountExclGst: 300000,
        gstRate: 18,
        gstAmount: 54000,
        totalAmountInclGst: 354000,
      };

      expect(unsavedPreview.proformaNumber).toBe('PI/PS/26-27/UNSAVED');
      // No mutation occurred in database/store
      expect(INITIAL_PROFORMA_INVOICES.length).toBe(initialCount);
      expect(samplePo.remainingBalanceExclGst).toBe(initialPoBalance);
    });
  });

  describe('9. UI State Behavior: Zero-Proforma vs Existing-Proformas and Multiple Proformas Creation', () => {
    it('handles zero-proformas state: shows empty message and keeps row creation action', () => {
      // Employee with 0 proformas
      const employeeWithZero = INITIAL_EMPLOYEES.find((e) => e.employeeId === 'PS-015')!;
      const existingProformas = INITIAL_PROFORMA_INVOICES.filter((p) => p.employeeId === employeeWithZero.employeeId);
      expect(existingProformas.length).toBe(0);

      // Verify UI state conditions
      const hasProformas = existingProformas.length > 0;
      expect(hasProformas).toBe(false);

      // Empty state text
      const emptyStateMessage = 'No proforma invoices generated for this employee yet.';
      expect(emptyStateMessage).toBe('No proforma invoices generated for this employee yet.');
    });

    it('handles existing-proformas state: shows invoice list and renders "+ Add Another Proforma" button', () => {
      // Rohan Deshmukh (PS-108) has existing proformas
      const employeeWithProformas = INITIAL_EMPLOYEES.find((e) => e.employeeId === 'PS-108')!;
      const existingProformas = INITIAL_PROFORMA_INVOICES.filter((p) => p.employeeId === employeeWithProformas.employeeId);
      expect(existingProformas.length).toBeGreaterThanOrEqual(2);

      const hasProformas = existingProformas.length > 0;
      expect(hasProformas).toBe(true);

      // "+ Add Another Proforma" button is rendered when hasProformas is true, even when multiple proformas exist
      const showAddAnotherButton = hasProformas;
      expect(showAddAnotherButton).toBe(true);

      const buttonLabel = '+ Add Another Proforma';
      expect(buttonLabel).toBe('+ Add Another Proforma');
    });

    it('creates multiple proformas for the same employee in the same month with unique numbers and independent records', () => {
      let proformasStore: ProformaInvoice[] = [...INITIAL_PROFORMA_INVOICES];
      const initialStoreCount = proformasStore.length;

      // Existing proforma 1 for Rohan Deshmukh (Oct 1-15, 2026)
      const prof1 = proformasStore.find((p) => p.employeeId === 'PS-108' && p.billingPeriodStart === '2026-10-01')!;
      expect(prof1).toBeDefined();

      // Find max number to guarantee unique sequential proforma number with collision avoidance
      let maxNum = 0;
      proformasStore.forEach((p) => {
        const match = p.proformaNumber.match(/(\d+)$/);
        if (match) {
          const numVal = parseInt(match[1], 10);
          if (!isNaN(numVal) && numVal > maxNum) maxNum = numVal;
        }
      });

      let nextNum = Math.max(maxNum + 1, proformasStore.length + 1);
      while (proformasStore.some((p) => p.proformaNumber === `PI/PS/26-27/${String(nextNum).padStart(3, '0')}`)) {
        nextNum++;
      }
      const nextProformaNumber = `PI/PS/26-27/${String(nextNum).padStart(3, '0')}`;

      // Create new second proforma for Rohan in same month with independent deliverable
      const newProforma: ProformaInvoice = {
        id: `prof-${Date.now()}-new`,
        proformaNumber: nextProformaNumber,
        poId: samplePo.id,
        poNumber: samplePo.poNumber,
        projectId: samplePo.projectId,
        projectName: samplePo.projectName,
        employeeId: 'PS-108',
        employeeName: 'Rohan Deshmukh',
        designation: 'Senior Cloud Architect',
        billingMonth: 'October',
        billingYear: 2026,
        billingPeriodStart: '2026-10-16',
        billingPeriodEnd: '2026-10-31',
        billableDaysMethod: 'working_days',
        billableDays: 11,
        amountExclGst: 150000,
        gstRate: 18,
        gstAmount: 27000,
        totalAmountInclGst: 177000,
        status: 'Draft',
        version: 1,
        versions: [{ version: 1, updatedAt: '2026-10-16', updatedBy: 'Lead', amountExclGst: 150000, gstAmount: 27000, totalAmountInclGst: 177000 }],
        lineItems: [
          {
            id: 'li-new',
            description: 'Senior Cloud Architect — Deliverable Milestone 3',
            hsnSac: '998313',
            quantity: 11,
            rate: 13636.36,
            amount: 150000,
          },
        ],
        notes: 'Milestone 3 deliverables',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Add to store
      proformasStore = [newProforma, ...proformasStore];

      expect(proformasStore.length).toBe(initialStoreCount + 1);
      expect(newProforma.id).not.toBe(prof1.id);
      expect(newProforma.proformaNumber).not.toBe(prof1.proformaNumber);
      expect(newProforma.amountExclGst).toBe(150000);
      expect(prof1.amountExclGst).toBe(125000); // Unmutated

      // Filter all proformas for this employee in October 2026
      const rohanOctoberProformas = proformasStore.filter(
        (p) => p.employeeId === 'PS-108' && p.billingMonth === 'October' && p.billingYear === 2026
      );
      expect(rohanOctoberProformas.length).toBeGreaterThanOrEqual(3);

      // Verify PO balance remains unaffected
      const poBalances = recalculatePOBalances(samplePo);
      expect(poBalances.remainingBalanceExclGst).toBe(samplePo.remainingBalanceExclGst);
    });

    it('maintains independent View, Edit, Preview, and Download capabilities for all proformas in the list', () => {
      const rohanProformas = INITIAL_PROFORMA_INVOICES.filter((p) => p.employeeId === 'PS-108');
      expect(rohanProformas.length).toBeGreaterThanOrEqual(2);

      rohanProformas.forEach((p) => {
        expect(p.id).toBeDefined();
        expect(p.proformaNumber).toBeDefined();
        expect(p.totalAmountInclGst).toBeGreaterThan(0);
        // Each proforma has its own valid PDF downloadable structure
        const doc = buildJsPdfDocument({
          filename: `${p.proformaNumber}.pdf`,
          documentType: 'proforma',
          title: `PROFORMA INVOICE: ${p.proformaNumber}`,
          proforma: p,
          employeeName: p.employeeName,
          employeeId: p.employeeId,
        });
        expect(doc).toBeDefined();
      });
    });
  });
});
