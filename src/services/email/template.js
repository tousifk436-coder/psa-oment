/* ============================================================================
   EMAIL TEMPLATE — one branded, mobile-friendly layout for every email
   ----------------------------------------------------------------------------
   Built only with tables and inline styles so it looks the same in Gmail,
   Outlook, Apple Mail and phone apps (no SVG, no external images, no CSS
   files — those are blocked or stripped by many mail apps).
   ============================================================================ */
'use strict';

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* strip the small bits of HTML the engine puts in titles (<strong>) */
const plain = s => String(s == null ? '' : s).replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

const BRAND = '#007AFF';

/* colour + icon chosen from what the email is about */
function toneOf(heading) {
  const h = String(heading || '').toLowerCase();
  if (/approved|paid|received|credited|accepted|welcome|resolved|completed|done/.test(h)) return { color: '#059669', soft: '#ECFDF5', icon: '&#10004;' };
  if (/returned|rejected|declined|cancel|failed|overdue|missed|not checked|deactivated/.test(h)) return { color: '#DC2626', soft: '#FEF2F2', icon: '!' };
  if (/reminder|due|pending|waiting|review|flag|blocked|leave|tomorrow|timer/.test(h)) return { color: '#D97706', soft: '#FFFBEB', icon: '&#9200;' };
  if (/invoice|payment|receipt|payout|wallet|bill/.test(h)) return { color: '#7C3AED', soft: '#F5F3FF', icon: '&#8377;' };
  if (/message|notice|comment|announcement/.test(h)) return { color: BRAND, soft: '#EFF6FF', icon: '&#9993;' };
  return { color: BRAND, soft: '#EFF6FF', icon: '&#9733;' };
}

/* the Oment mark: a blue rounded square with a white plus, drawn with table
   cells so it shows everywhere without loading an image */
function logo() {
  const b = `background:${BRAND}`, w = 'background:#FFFFFF';
  const cell = (st, wd, ht) => `<td width="${wd}" height="${ht}" style="${st};width:${wd}px;height:${ht}px;font-size:0;line-height:0">&nbsp;</td>`;
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:separate;${b};border-radius:9px"><tr><td style="padding:7px">
<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
<tr>${cell(b, 7, 7)}${cell(w, 6, 7)}${cell(b, 7, 7)}</tr>
<tr>${cell(w, 7, 6)}${cell(w, 6, 6)}${cell(w, 7, 6)}</tr>
<tr>${cell(b, 7, 7)}${cell(w, 6, 7)}${cell(b, 7, 7)}</tr>
</table></td></tr></table>`;
}

/**
 * @param {object} o
 *   company   company name shown in the header
 *   heading   big title
 *   greeting  "Hi Alex," (optional)
 *   lines     array of paragraphs (plain text). Short "Label: value" lines are
 *             shown in the details box automatically.
 *   facts     array of [label, value] rows (optional)
 *   button    { label, url } (optional)
 *   footer    small print (optional)
 */
function render(o) {
  const company = plain(o.company || 'Oment');
  const heading = plain(o.heading);
  const tone = toneOf(heading);
  const facts = (o.facts || []).filter(f => f && f[1] !== undefined && f[1] !== null && f[1] !== '').map(f => [plain(f[0]), plain(f[1])]);
  const paras = [];
  (o.lines || []).filter(Boolean).map(plain).forEach(l => {
    const m = /^([A-Z][A-Za-z /]{1,22}):\s+(.{1,90})$/.exec(l.trim());
    if (m && !/\n/.test(l)) facts.push([m[1], m[2]]); else paras.push(l);
  });
  const preheader = (paras[0] || heading).slice(0, 110);
  const now = new Date();
  const year = now.getFullYear();
  /* different in every email, so mail apps never treat it as repeated text */
  const stamp = 'ref ' + now.getTime().toString(36) + Math.random().toString(36).slice(2, 7);
  const sentAt = now.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: process.env.TZ || 'Asia/Kolkata' });

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>${esc(heading)}</title></head>
<body style="margin:0;padding:0;background:#F2F3F7;-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F3F7">
<tr><td align="center" style="padding:28px 12px 36px">

  <!-- brand -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px">
    <tr><td style="padding:0 4px 16px">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td valign="middle">${logo()}</td>
        <td valign="middle" style="padding-left:10px;font-family:Georgia,'Times New Roman',serif;font-size:21px;font-weight:700;color:#18171A;letter-spacing:-.2px">${esc(company)}</td>
      </tr></table>
    </td></tr>
  </table>

  <!-- card -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#FFFFFF;border-radius:16px;border:1px solid #E6E7EC;overflow:hidden">
    <tr><td style="height:5px;background:${tone.color};font-size:0;line-height:0">&nbsp;</td></tr>
    <tr><td style="padding:28px 32px 8px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#18171A">
      <span style="display:none;font-size:0;line-height:0;max-height:0;overflow:hidden">${esc(stamp)}</span>

      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px"><tr>
        <td width="40" height="40" align="center" valign="middle" style="width:40px;height:40px;border-radius:12px;background:${tone.soft};color:${tone.color};font-size:19px;font-weight:700;line-height:40px">${tone.icon}</td>
      </tr></table>

      <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;font-weight:700;letter-spacing:-.2px;color:#18171A">${esc(heading)}</h1>
      ${o.greeting ? `<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#18171A">${esc(plain(o.greeting))}</p>` : ''}
      ${paras.map(l => `<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#3F3E44;white-space:pre-line">${esc(l)}</p>`).join('')}

      ${facts.length ? `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 20px;background:#F7F8FA;border-radius:12px;border:1px solid #EEEFF3">
        ${facts.map((f, i) => `<tr>
          <td style="padding:11px 16px;${i ? 'border-top:1px solid #EEEFF3;' : ''}font-size:13px;color:#77757C;width:38%;vertical-align:top">${esc(f[0])}</td>
          <td style="padding:11px 16px;${i ? 'border-top:1px solid #EEEFF3;' : ''}font-size:14px;color:#18171A;font-weight:600;vertical-align:top">${esc(f[1])}</td>
        </tr>`).join('')}
      </table>` : ''}

      ${o.button && o.button.url ? `
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px"><tr>
        <td align="center" bgcolor="${BRAND}" style="border-radius:11px;background:${BRAND}">
          <a href="${esc(o.button.url)}" target="_blank" style="display:inline-block;padding:13px 26px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:11px">${esc(o.button.label || 'Open')} &rarr;</a>
        </td>
      </tr></table>` : ''}
    </td></tr>

    <tr><td style="padding:18px 32px 22px;border-top:1px solid #F0F1F4;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12.5px;line-height:1.6;color:#8E8B90">
      ${esc(plain(o.footer || ('This is an automatic message from ' + company + '.')))}
      ${o.button && o.button.url ? `<br>Button not working? Open this link: <a href="${esc(o.button.url)}" style="color:${BRAND};text-decoration:none;word-break:break-all">${esc(o.button.url)}</a>` : ''}
    </td></tr>
  </table>

  <!-- bottom -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px">
    <tr><td align="center" style="padding:18px 8px 0;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#A3A1A7">
      &copy; ${year} ${esc(company)} &middot; Sent by Oment &middot; ${esc(sentAt)}
    </td></tr>
  </table>

</td></tr></table>
</body></html>`;

  const text = [
    heading, '',
    o.greeting ? plain(o.greeting) : null,
    ...paras,
    facts.length ? '' : null,
    ...facts.map(f => `${f[0]}: ${f[1]}`),
    o.button && o.button.url ? `\n${o.button.label || 'Open'}: ${o.button.url}` : null,
    '', '— ' + company
  ].filter(x => x !== null).join('\n');

  return { html, text };
}

module.exports = { render, plain, esc };