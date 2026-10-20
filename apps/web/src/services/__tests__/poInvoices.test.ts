import { describe, it, expect } from 'vitest';
import { INITIAL_POS, INITIAL_PROJECTS } from '../mockData';
import { recalculatePOBalances, recalculateProjectBalances, getPOCounts } from '../../lib/poUtils';
import { Invoice } from '../../types/domain';

describe('Purchase Order Invoices & Balance Module', () => {
  const hdfcPo = INITIAL_POS.find((p) => p.id === 'po-101')!;
  const rawInfyPo = INITIAL_POS.find((p) => p.id === 'po-102')!;
  const infyPo = {
    ...rawInfyPo,
    invoices: rawInfyPo.invoices.map((inv) => ({ ...inv, status: 'Issued' as const })),
  };

  describe('1. HDFC PO (po-101) Independent Calculations', () => {
    it('should calculate PO-specific financial values correctly for HDFC', () => {
      const recalculated = recalculatePOBalances(hdfcPo);

      expect(recalculated.amountExclGst).toBe(5000000);
      expect(recalculated.invoicedExclGst).toBe(2000000); // 12L + 8L
      expect(recalculated.creditNotesExclGst).toBe(200000); // 2L
      // Formula: 50L - 20L + 2L = 32L
      expect(recalculated.remainingBalanceExclGst).toBe(3200000);
    });

    it('should separate tax invoices from credit notes in count metrics for HDFC', () => {
      const counts = getPOCounts(hdfcPo);

      expect(counts.taxInvoiceCount).toBe(2);
      expect(counts.creditNoteCount).toBe(1);
      expect(counts.totalLedgerCount).toBe(3);
    });

    it('should ensure credit notes restore the PO balance exactly once for HDFC', () => {
      // Without credit note: 50L - 20L = 30L
      // With 2L credit note: 30L + 2L = 32L
      const recalculated = recalculatePOBalances(hdfcPo);
      const balanceWithoutCreditNote = hdfcPo.amountExclGst - recalculated.invoicedExclGst;

      expect(recalculated.remainingBalanceExclGst).toBe(balanceWithoutCreditNote + recalculated.creditNotesExclGst);
      expect(recalculated.remainingBalanceExclGst).toBe(3200000);
    });
  });

  describe('2. Infosys PO (po-102) Independent Calculations', () => {
    it('should calculate PO-specific financial values correctly for Infosys', () => {
      const recalculated = recalculatePOBalances(infyPo);

      expect(recalculated.amountExclGst).toBe(2500000);
      expect(recalculated.invoicedExclGst).toBe(1650000); // 10L + 6.5L
      expect(recalculated.creditNotesExclGst).toBe(0);
      // Formula: 25L - 16.5L = 8.5L
      expect(recalculated.remainingBalanceExclGst).toBe(850000);
    });

    it('should separate tax invoices from credit notes in count metrics for Infosys', () => {
      const counts = getPOCounts(infyPo);

      expect(counts.taxInvoiceCount).toBe(2);
      expect(counts.creditNoteCount).toBe(0);
      expect(counts.totalLedgerCount).toBe(2);
    });
  });

  describe('3. Data Isolation Between POs', () => {
    it('should not leak invoices or credit notes between HDFC and Infosys POs', () => {
      const hdfcRec = recalculatePOBalances(hdfcPo);
      const infyRec = recalculatePOBalances(infyPo);

      // Adding a new invoice to HDFC PO should NOT alter Infosys PO
      const newHdfcInvoice: Invoice = {
        id: 'inv-test-hdfc',
        poId: hdfcPo.id,
        invoiceNumber: 'INV/PS/25-26/999',
        invoiceDate: '2025-10-01',
        billingPeriodStart: '2025-09-01',
        billingPeriodEnd: '2025-09-30',
        amountExclGst: 500000,
        gstRate: 18,
        gstAmount: 90000,
        totalAmountInclGst: 590000,
        status: 'Issued',
      };

      const updatedHdfcPo = recalculatePOBalances({
        ...hdfcRec,
        invoices: [...hdfcRec.invoices, newHdfcInvoice],
      });

      const updatedInfyPo = recalculatePOBalances(infyRec);

      expect(updatedHdfcPo.invoicedExclGst).toBe(2500000);
      expect(updatedHdfcPo.remainingBalanceExclGst).toBe(2700000);

      // Infosys PO remains unchanged
      expect(updatedInfyPo.invoicedExclGst).toBe(1650000);
      expect(updatedInfyPo.remainingBalanceExclGst).toBe(850000);
    });
  });

  describe('4. Invoice Cancellation & Credit Note Rules', () => {
    it('should restore PO balance when a tax invoice is cancelled', () => {
      const poWithCancelledInvoice = {
        ...hdfcPo,
        invoices: hdfcPo.invoices.map((inv) =>
          inv.id === 'inv-2' ? { ...inv, status: 'Cancelled' as const } : inv
        ),
      };

      const recalculated = recalculatePOBalances(poWithCancelledInvoice);

      // Cancelled inv-2 (8L) -> Invoiced drops from 20L to 12L.
      // Remaining = 50L - 12L + 2L = 40L
      expect(recalculated.invoicedExclGst).toBe(1200000);
      expect(recalculated.remainingBalanceExclGst).toBe(4000000);
    });

    it('should reverse balance restoration when a credit note is cancelled', () => {
      const poWithCancelledCN = {
        ...hdfcPo,
        invoices: hdfcPo.invoices.map((inv) =>
          inv.id === 'inv-3' ? { ...inv, status: 'Cancelled' as const } : inv
        ),
      };

      const recalculated = recalculatePOBalances(poWithCancelledCN);

      // Cancelled inv-3 (CN 2L) -> Credit notes drops from 2L to 0.
      // Remaining = 50L - 20L + 0 = 30L
      expect(recalculated.creditNotesExclGst).toBe(0);
      expect(recalculated.remainingBalanceExclGst).toBe(3000000);
    });
  });

  describe('5. Infosys INV/PS/25-26/205 Cancellation & Reload Persistence', () => {
    it('should cancel invoice INV/PS/25-26/205, update balance to 15,00,000, and append audit log', () => {
      const cancelledInvoicePo = {
        ...infyPo,
        invoices: infyPo.invoices.map((inv) =>
          inv.invoiceNumber === 'INV/PS/25-26/205'
            ? { ...inv, status: 'Cancelled' as const }
            : inv
        ),
        activityLogs: [
          ...infyPo.activityLogs,
          {
            id: 'act-test-cancel',
            poId: infyPo.id,
            timestamp: '2025-10-13 12:00 PM',
            userName: 'Kavita Nair',
            userRole: 'Billing Lead',
            action: 'Invoice Cancelled',
            details: 'Invoice INV/PS/25-26/205 was cancelled. Balance restored.',
          },
        ],
      };

      const recalculated = recalculatePOBalances(cancelledInvoicePo);

      // Total PO: 25,00,000. Active invoice (INV/PS/25-26/102): 10,00,000.
      // Cancelled invoice (INV/PS/25-26/205): 6,50,000 -> does NOT reduce balance.
      // Remaining PO Balance = 25,00,000 - 10,00,000 = 15,00,000.
      expect(recalculated.invoicedExclGst).toBe(1000000);
      expect(recalculated.remainingBalanceExclGst).toBe(1500000);

      // Audit log check
      const cancelLog = recalculated.activityLogs.find((a) => a.action === 'Invoice Cancelled');
      expect(cancelLog).toBeDefined();
      expect(cancelLog?.details).toContain('INV/PS/25-26/205');
    });

    it('should preserve cancelled status, balance of 15,00,000, and audit log on page reload simulation', () => {
      const cancelledInvoicePo = {
        ...infyPo,
        invoices: infyPo.invoices.map((inv) =>
          inv.invoiceNumber === 'INV/PS/25-26/205'
            ? { ...inv, status: 'Cancelled' as const }
            : inv
        ),
        activityLogs: [
          ...infyPo.activityLogs,
          {
            id: 'act-test-cancel',
            poId: infyPo.id,
            timestamp: '2025-10-13 12:00 PM',
            userName: 'Kavita Nair',
            userRole: 'Billing Lead',
            action: 'Invoice Cancelled',
            details: 'Invoice INV/PS/25-26/205 was cancelled. Balance restored.',
          },
        ],
      };

      const recalculated = recalculatePOBalances(cancelledInvoicePo);

      // Simulate localStorage save & reload (Serialization + Deserialization)
      const serialized = JSON.stringify([recalculated]);
      const deserialized: typeof INITIAL_POS = JSON.parse(serialized);

      const reloadedPo = recalculatePOBalances(deserialized[0]);

      expect(reloadedPo.invoices.find((i) => i.invoiceNumber === 'INV/PS/25-26/205')?.status).toBe('Cancelled');
      expect(reloadedPo.invoicedExclGst).toBe(1000000);
      expect(reloadedPo.remainingBalanceExclGst).toBe(1500000);
      expect(reloadedPo.activityLogs.some((a) => a.action === 'Invoice Cancelled')).toBe(true);
    });
  });

  describe('6. Project Balance Synchronization', () => {
    it('should synchronize project totals with active PO balances', () => {
      const updatedProjects = recalculateProjectBalances(INITIAL_PROJECTS, [hdfcPo, infyPo]);

      const hdfcProject = updatedProjects.find((p) => p.id === 'proj-hdfc-01')!;
      const infyProject = updatedProjects.find((p) => p.id === 'proj-infy-02')!;

      expect(hdfcProject.totalPoValue).toBe(5000000);
      expect(hdfcProject.remainingBalance).toBe(3200000);

      expect(infyProject.totalPoValue).toBe(2500000);
      expect(infyProject.remainingBalance).toBe(850000);
    });
  });
});
