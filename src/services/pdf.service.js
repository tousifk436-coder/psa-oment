/* ============================================================================
   PDF SERVICE — GST invoice PDF (download + email attachment)
   ============================================================================ */
'use strict';
const PDFDocument = require('pdfkit');

const rupee = p => 'Rs. ' + (Number(p || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* returns a Buffer */
function invoicePdf(inv, company) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: 'Invoice ' + (inv.number || inv.id) } });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const c = company || {};
    const W = doc.page.width - 96;

    doc.fontSize(20).font('Helvetica-Bold').text(c.companyName || c.name || 'Oment', 48, 48);
    doc.fontSize(9).font('Helvetica').fillColor('#555')
      .text(c.address || '', { width: 260 })
      .text([c.gstin ? 'GSTIN: ' + c.gstin : '', c.email || '', c.phone || ''].filter(Boolean).join('  ·  '), { width: 260 });

    doc.fillColor('#000').fontSize(22).font('Helvetica-Bold').text('TAX INVOICE', 48, 48, { width: W, align: 'right' });
    doc.fontSize(10).font('Helvetica')
      .text('Invoice #: ' + (inv.number || inv.id), { width: W, align: 'right' })
      .text('Issue date: ' + (inv.issueDate || '-'), { width: W, align: 'right' })
      .text('Due date: ' + (inv.dueDate || '-'), { width: W, align: 'right' })
      .text('Status: ' + (inv.status || ''), { width: W, align: 'right' });

    let y = 150;
    doc.moveTo(48, y).lineTo(48 + W, y).strokeColor('#DDD').stroke();
    y += 12;
    doc.fontSize(9).fillColor('#777').text('BILL TO', 48, y);
    doc.fontSize(11).fillColor('#000').font('Helvetica-Bold').text(inv.clientName || '-', 48, y + 12);
    doc.font('Helvetica').fontSize(9).fillColor('#555')
      .text([inv.clientEmail, inv.clientGstin ? 'GSTIN: ' + inv.clientGstin : '', inv.placeOfSupply ? 'Place of supply: ' + inv.placeOfSupply : ''].filter(Boolean).join('\n'), 48, y + 28);

    y += 80;
    const cols = [48, 300, 360, 400, 470];
    doc.rect(48, y, W, 22).fill('#F4F4F5');
    doc.fillColor('#000').font('Helvetica-Bold').fontSize(9)
      .text('Description', cols[0] + 6, y + 7)
      .text('HSN/SAC', cols[1], y + 7)
      .text('Qty', cols[2], y + 7)
      .text('Rate', cols[3], y + 7)
      .text('Amount', cols[4], y + 7, { width: 48 + W - cols[4] - 6, align: 'right' });
    y += 28;
    doc.font('Helvetica').fontSize(9);
    (inv.lines || []).forEach(l => {
      const qty = Number(l.qty || 1), amt = Math.round(qty * Number(l.ratePaise || 0));
      const h = Math.max(16, doc.heightOfString(l.description || '', { width: 240 }) + 6);
      if (y + h > doc.page.height - 160) { doc.addPage(); y = 60; }
      doc.text(l.description || '', cols[0] + 6, y, { width: 240 })
        .text(l.hsnSac || '', cols[1], y)
        .text(String(qty), cols[2], y)
        .text(rupee(l.ratePaise), cols[3], y)
        .text(rupee(amt), cols[4], y, { width: 48 + W - cols[4] - 6, align: 'right' });
      y += h;
    });

    y += 8;
    doc.moveTo(300, y).lineTo(48 + W, y).strokeColor('#DDD').stroke();
    y += 8;
    const row = (label, val, bold) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 9.5)
        .text(label, 300, y).text(val, 300, y, { width: 48 + W - 300 - 6, align: 'right' });
      y += bold ? 20 : 16;
    };
    row('Subtotal', rupee(inv.subtotalPaise));
    if (inv.igstPaise) row('IGST', rupee(inv.igstPaise));
    if (inv.cgstPaise) row('CGST', rupee(inv.cgstPaise));
    if (inv.sgstPaise) row('SGST', rupee(inv.sgstPaise));
    row('Total', rupee(inv.totalPaise), true);
    if (inv.paidPaise) row('Paid', rupee(inv.paidPaise));
    row('Balance due', rupee((inv.totalPaise || 0) - (inv.paidPaise || 0)), true);

    if ((inv.payments || []).length) {
      y += 10;
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#000').text('Payments received', 48, y); y += 14;
      doc.font('Helvetica').fontSize(9).fillColor('#555');
      inv.payments.forEach(p => {
        doc.text(p.date + '  ·  ' + (p.method || '') + (p.reference ? '  ·  Ref ' + p.reference : ''), 48, y)
          .text(rupee(p.amountPaise), 48, y, { width: W, align: 'right' });
        y += 13;
      });
      doc.fillColor('#000');
    }
    if (inv.notes) {
      y += 12;
      doc.font('Helvetica-Bold').fontSize(9).text('Notes', 48, y);
      doc.font('Helvetica').fontSize(9).fillColor('#555').text(inv.notes, 48, y + 13, { width: W });
    }
    doc.fontSize(8).fillColor('#999').text('This is a computer-generated invoice.', 48, doc.page.height - 70, { width: W, align: 'center' });
    doc.end();
  });
}

/* notice → PDF (the notice text is stored as simple HTML) */
function htmlToText(html) {
  return String(html || '')
    .replace(/<\s*br\s*\/?>/gi, '\n').replace(/<\/(p|div|h[1-6]|li)>/gi, '\n').replace(/<li[^>]*>/gi, '\u2022 ')
    .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n').trim();
}
function noticePdf(n, company) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 56, info: { Title: n.title || 'Notice' } });
    const chunks = [];
    doc.on('data', c => chunks.push(c)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
    const c = company || {};
    doc.fontSize(11).fillColor('#666').text(c.companyName || c.name || 'Oment');
    doc.moveDown(0.3).fontSize(9).text('NOTICE' + (n.priority && n.priority !== 'Normal' ? '  \u00b7  ' + String(n.priority).toUpperCase() : ''));
    doc.moveDown(0.8).fillColor('#000').font('Helvetica-Bold').fontSize(20).text(n.title || 'Notice');
    doc.moveDown(0.3).font('Helvetica').fontSize(10).fillColor('#666')
      .text((n.sentAt || n.date) ? 'Date: ' + new Date(n.sentAt || n.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
    doc.moveDown(1).fontSize(12).fillColor('#111').text(htmlToText(n.content), { lineGap: 4 });
    doc.end();
  });
}

module.exports = { invoicePdf, noticePdf, rupee };
