'use client';

import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import type { Ticket } from '@/lib/types';

interface DownloadTicketPdfOptions {
  ticket: Ticket;
  peopleAhead?: number;
  ewtSeconds?: number;
}

/**
 * Generates a professional PDF ticket and triggers an automatic download.
 * Includes business branding, ticket position, QR code, and track-your-position link.
 */
export async function downloadTicketPdf(options: DownloadTicketPdfOptions): Promise<void> {
  const { ticket, peopleAhead, ewtSeconds } = options;

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const trackingUrl = `${origin}/?ticket=${ticket.id}`;

  const serial =
    ticket._formattedSerial ||
    `${ticket.queue?.prefix ?? '?'}${String(ticket.serialNumber).padStart(3, '0')}`;

  const created = ticket.createdAt ? new Date(ticket.createdAt) : new Date();
  const dateStr = created.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const timeStr = created.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });

  const position = (peopleAhead ?? 0) + 1;
  const ewtMin =
    ewtSeconds !== undefined && ewtSeconds !== null
      ? Math.ceil(ewtSeconds / 60)
      : null;

  const tenantName = ticket.tenant?.name ?? 'QueueFlow';
  const queueName = ticket.queue?.name ?? '';

  // Parse branding color
  let primaryColor = '#059669';
  if (ticket.tenant?.brandingConfig) {
    try {
      const cfg = JSON.parse(ticket.tenant.brandingConfig) as Record<string, string>;
      if (cfg.primaryColor) primaryColor = cfg.primaryColor;
    } catch { /* ignore */ }
  }

  // Convert hex to RGB for jsPDF
  const r = parseInt(primaryColor.slice(1, 3), 16);
  const g = parseInt(primaryColor.slice(3, 5), 16);
  const b = parseInt(primaryColor.slice(5, 7), 16);

  // Status config
  const statusMap: Record<string, { label: string; color: number[] }> = {
    WAITING: { label: 'WAITING', color: [245, 158, 11] },
    SERVING: { label: 'NOW SERVING', color: [5, 150, 105] },
    COMPLETED: { label: 'COMPLETED', color: [22, 163, 74] },
    SKIPPED: { label: 'SKIPPED', color: [107, 114, 128] },
    CANCELLED: { label: 'CANCELLED', color: [220, 38, 38] },
  };
  const sc = statusMap[ticket.status] ?? statusMap.WAITING;

  // Generate QR code as data URL
  let qrDataUrl: string;
  try {
    qrDataUrl = await QRCode.toDataURL(trackingUrl, {
      width: 280,
      margin: 1,
      color: { dark: '#000000', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    });
  } catch {
    qrDataUrl = '';
  }

  // Create PDF (A4)
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const centerX = pageW / 2;

  // ── Full-page background ──
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageW, pageH, 'F');

  // ── Top branding banner ──
  const bannerH = 38;
  doc.setFillColor(r, g, b);
  doc.roundedRect(0, 0, pageW, bannerH, 0, 0, 'F');

  // Business name
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(255, 255, 255);
  doc.text(tenantName.toUpperCase(), centerX, 16, { align: 'center' });

  // Queue name
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  doc.text(queueName, centerX, 26, { align: 'center' });

  // Decorative line
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.3);
  doc.line(pageW * 0.25, 31, pageW * 0.75, 31);

  // ── Status badge ──
  const statusY = bannerH + 10;
  doc.setFillColor(sc.color[0], sc.color[1], sc.color[2]);
  const badgeW = doc.getTextWidth(sc.label) + 20;
  doc.roundedRect(centerX - badgeW / 2, statusY, badgeW, 10, 5, 5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text(sc.label, centerX, statusY + 7, { align: 'center' });

  // ── "Your Ticket" label ──
  const ticketLabelY = statusY + 20;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(107, 114, 128);
  doc.text('YOUR TICKET', centerX, ticketLabelY, { align: 'center' });

  // ── Big ticket number ──
  const ticketNumY = ticketLabelY + 16;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(56);
  doc.setTextColor(17, 24, 39);
  doc.text(serial, centerX, ticketNumY, { align: 'center' });

  // ── Customer name ──
  const custY = ticketNumY + 10;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(13);
  doc.setTextColor(75, 85, 99);
  doc.text(`for ${ticket.customerName}`, centerX, custY, { align: 'center' });

  // ── Separator line ──
  const sep1Y = custY + 8;
  doc.setDrawColor(243, 244, 246);
  doc.setLineWidth(0.5);
  doc.line(25, sep1Y, pageW - 25, sep1Y);

  // ── Stats row ──
  const statsY = sep1Y + 12;
  const statSpacing = 50;

  // Position
  const pos1X = centerX - statSpacing;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(28);
  doc.setTextColor(r, g, b);
  doc.text(`#${position}`, pos1X, statsY, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(156, 163, 175);
  doc.text('POSITION', pos1X, statsY + 6, { align: 'center' });

  // People ahead
  const pos2X = centerX;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(28);
  doc.setTextColor(r, g, b);
  doc.text(`${peopleAhead ?? '—'}`, pos2X, statsY, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(156, 163, 175);
  doc.text('AHEAD', pos2X, statsY + 6, { align: 'center' });

  // Est. wait
  const pos3X = centerX + statSpacing;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(28);
  doc.setTextColor(r, g, b);
  doc.text(ewtMin !== null ? `${ewtMin}m` : '—', pos3X, statsY, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(156, 163, 175);
  doc.text('EST. WAIT', pos3X, statsY + 6, { align: 'center' });

  // ── Separator line ──
  const sep2Y = statsY + 14;
  doc.setDrawColor(243, 244, 246);
  doc.setLineWidth(0.5);
  doc.line(25, sep2Y, pageW - 25, sep2Y);

  // ── Details table ──
  const detailStartY = sep2Y + 8;
  const detailLineH = 8;
  doc.setFontSize(12);

  const details: Array<{ label: string; value: string }> = [
    { label: 'Date', value: dateStr },
    { label: 'Time', value: timeStr },
  ];
  if (ticket.customerPhone) {
    details.push({ label: 'Phone', value: ticket.customerPhone });
  }

  details.forEach((d, i) => {
    const y = detailStartY + i * detailLineH;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(156, 163, 175);
    doc.text(d.label, 30, y, { align: 'left' });
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(55, 65, 81);
    doc.text(d.value, pageW - 30, y, { align: 'right' });
  });

  // ── Separator line ──
  const sep3Y = detailStartY + details.length * detailLineH + 6;
  doc.setDrawColor(243, 244, 246);
  doc.setLineWidth(0.5);
  doc.line(25, sep3Y, pageW - 25, sep3Y);

  // ── QR Code ──
  const qrSize = 32;
  const qrX = centerX - qrSize / 2;
  const qrY = sep3Y + 6;

  if (qrDataUrl) {
    doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);
  }

  // QR hint
  const qrHintY = qrY + qrSize + 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(107, 114, 128);
  doc.text('Scan to track your ticket on another device', centerX, qrHintY, { align: 'center' });

  // ── Track Your Live Position button ──
  const btnY = qrHintY + 10;
  const btnW = 70;
  const btnH = 10;
  const btnX = centerX - btnW / 2;

  // Button background
  doc.setFillColor(r, g, b);
  doc.roundedRect(btnX, btnY, btnW, btnH, 3, 3, 'F');

  // Button text
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text('TRACK YOUR LIVE POSITION', centerX, btnY + 6.5, { align: 'center' });

  // Make the button area a clickable link
  doc.setDrawColor(r, g, b);
  doc.link(btnX, btnY, btnW, btnH, { url: trackingUrl });

  // ── Tracking URL text ──
  const urlY = btnY + btnH + 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(156, 163, 175);
  doc.text(trackingUrl, centerX, urlY, { align: 'center' });

  // ── Footer ──
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(209, 213, 219);
  doc.text('Powered by QueueFlow', centerX, pageH - 10, { align: 'center' });

  // ── Save / download ──
  doc.save(`Ticket-${serial}.pdf`);
}