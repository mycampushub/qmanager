import { renderToString } from 'react-dom/server';
import QRCode from 'react-qr-code';
import type { Ticket, Queue } from '@/lib/types';

export interface PrintTicketOptions {
  ticket: Ticket;
  queue: Queue;
  tenantName: string;
  peopleAhead?: number;
  ewtSeconds?: number;
}

/**
 * Opens a new browser window with a thermal-receipt–formatted ticket
 * and triggers the native print dialog.
 *
 * Supports 58 mm and 80 mm thermal printers via @page CSS.
 */
export function printTicket(options: PrintTicketOptions): void {
  const { ticket, queue, tenantName, peopleAhead, ewtSeconds } = options;

  const origin =
    typeof window !== 'undefined' ? window.location.origin : '';
  const trackingUrl = `${origin}/?ticket=${ticket.id}`;

  // ── Serial number ───────────────────────────────────────────
  const serial =
    ticket._formattedSerial ||
    `${queue.prefix}${String(ticket.serialNumber).padStart(3, '0')}`;

  // ── Timestamps ──────────────────────────────────────────────
  const created =
    ticket.createdAt && ticket.createdAt !== ''
      ? new Date(ticket.createdAt)
      : new Date();
  const dateStr = created.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const timeStr = created.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });

  // ── Wait info ───────────────────────────────────────────────
  const position = (peopleAhead ?? 0) + 1;
  const ewtMin =
    ewtSeconds !== undefined && ewtSeconds !== null
      ? Math.ceil(ewtSeconds / 60)
      : null;

  // ── QR code SVG (rendered server-side style) ────────────────
  const qrSvg = renderToString(
    <QRCode
      value={trackingUrl}
      size={160}
      bgColor="#ffffff"
      fgColor="#000000"
    />
  );

  // ── Build receipt HTML ──────────────────────────────────────
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Ticket ${serial}</title>
<style>
  /* ── Page size: 80mm thermal paper (most common) ────────── */
  @page {
    size: 80mm auto;
    margin: 0;
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: 'Courier New', Courier, monospace;
    width: 80mm;
    padding: 5mm 4mm 8mm;
    color: #000;
    font-size: 12px;
    line-height: 1.4;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .center { text-align: center; }
  .right  { text-align: right; }
  .bold   { font-weight: 700; }

  /* ── Title block ─────────────────────────────────────────── */
  .tenant-name {
    font-size: 16px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  .queue-label {
    font-size: 11px;
    color: #444;
    margin-top: 1px;
  }

  /* ── Separators ──────────────────────────────────────────── */
  .sep {
    border: none;
    border-top: 1px dashed #000;
    margin: 8px 0;
  }
  .sep-double {
    border: none;
    border-top: 3px double #000;
    margin: 10px 0;
  }

  /* ── Ticket number ───────────────────────────────────────── */
  .serial {
    font-size: 48px;
    font-weight: 900;
    letter-spacing: 4px;
    line-height: 1.1;
    margin: 12px 0 4px;
  }
  .serial-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 2px;
    color: #666;
  }

  /* ── Detail rows ─────────────────────────────────────────── */
  .row {
    display: flex;
    justify-content: space-between;
    padding: 2px 0;
    font-size: 12px;
  }
  .row .label { color: #555; }
  .row .value { font-weight: 600; }

  /* ── Stats grid ──────────────────────────────────────────── */
  .stats {
    display: flex;
    justify-content: space-around;
    text-align: center;
    margin: 8px 0;
  }
  .stat-num {
    font-size: 22px;
    font-weight: 700;
  }
  .stat-label {
    font-size: 9px;
    text-transform: uppercase;
    color: #666;
    letter-spacing: 0.5px;
  }

  /* ── QR code ─────────────────────────────────────────────── */
  .qr-block {
    text-align: center;
    margin: 10px auto;
    width: fit-content;
  }
  .qr-block svg {
    width: 130px !important;
    height: 130px !important;
    display: block;
  }
  .qr-hint {
    font-size: 9px;
    color: #666;
    margin-top: 4px;
  }
  .url-text {
    font-size: 8px;
    color: #888;
    word-break: break-all;
    margin-top: 2px;
    max-width: 70mm;
    margin-left: auto;
    margin-right: auto;
  }

  /* ── Footer ──────────────────────────────────────────────── */
  .footer {
    text-align: center;
    font-size: 9px;
    color: #888;
    margin-top: 6px;
  }
  .thank-you {
    font-size: 11px;
    font-weight: 600;
    margin-bottom: 2px;
  }

  /* ── Print-only: hide everything else ─────────────────────── */
  @media print {
    body { width: 80mm; }
  }
</style>
</head>
<body>

  <!-- Header -->
  <div class="center">
    <div class="tenant-name">${escHtml(tenantName)}</div>
    <div class="queue-label">${escHtml(queue.name)}</div>
  </div>

  <hr class="sep">

  <!-- Big ticket number -->
  <div class="center">
    <div class="serial-label">Your Ticket</div>
    <div class="serial">${escHtml(serial)}</div>
  </div>

  <hr class="sep-double">

  <!-- Customer details -->
  <div class="row">
    <span class="label">Customer</span>
    <span class="value">${escHtml(ticket.customerName)}</span>
  </div>
  ${ticket.customerPhone ? `<div class="row">
    <span class="label">Phone</span>
    <span class="value">${escHtml(ticket.customerPhone)}</span>
  </div>` : ''}
  <div class="row">
    <span class="label">Date</span>
    <span class="value">${dateStr}</span>
  </div>
  <div class="row">
    <span class="label">Time</span>
    <span class="value">${timeStr}</span>
  </div>
  <div class="row">
    <span class="label">Status</span>
    <span class="value">${ticket.status}</span>
  </div>

  <hr class="sep">

  <!-- Queue stats -->
  <div class="stats">
    <div>
      <div class="stat-num">#${position}</div>
      <div class="stat-label">Position</div>
    </div>
    <div>
      <div class="stat-num">${peopleAhead ?? '—'}</div>
      <div class="stat-label">Ahead</div>
    </div>
    <div>
      <div class="stat-num">${ewtMin !== null ? ewtMin + 'm' : '—'}</div>
      <div class="stat-label">Est. Wait</div>
    </div>
  </div>

  <hr class="sep">

  <!-- QR code -->
  <div class="qr-block">
    ${qrSvg}
    <div class="qr-hint">Scan to track your ticket</div>
    <div class="url-text">${escHtml(trackingUrl)}</div>
  </div>

  <hr class="sep">

  <!-- Footer -->
  <div class="center">
    <div class="thank-you">Thank you for waiting!</div>
    <div class="footer">Powered by QueueFlow</div>
  </div>

  <script>
    // Auto-trigger print dialog once content is loaded
    window.onload = function () {
      setTimeout(function () { window.print(); }, 300);
    };
    // Close window after printing (or if user cancels)
    window.onafterprint = function () { window.close(); };
  </script>
</body>
</html>`;

  // ── Open print window ───────────────────────────────────────
  const printWin = window.open('', '_blank', 'width=400,height=750');
  if (!printWin) {
    // Popup blocked — fall back to current-tab print
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => document.body.removeChild(iframe), 60000);
    }
    return;
  }

  printWin.document.write(html);
  printWin.document.close();
}

// ── Helpers ─────────────────────────────────────────────────────
function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}