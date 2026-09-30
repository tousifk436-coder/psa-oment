/* ============================================================================
   EMAIL TEMPLATE — one clean, mobile-friendly layout for every email
   ============================================================================ */
'use strict';

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* strip the small bits of HTML the engine puts in titles (<strong>) */
const plain = s => String(s == null ? '' : s).replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

/**
 * @param {object} o
 *   company   company name shown in the header
 *   heading   big title
 *   greeting  "Hi Alex," (optional)
 *   lines     array of paragraphs (plain text)
 *   facts     array of [label, value] rows (optional)
 *   button    { label, url } (optional)
 *   footer    small print (optional)
 */
function render(o) {
  const company = plain(o.company || 'Oment');
  const lines = (o.lines || []).filter(Boolean).map(plain);
  const facts = (o.facts || []).filter(f => f && f[1] !== undefined && f[1] !== null && f[1] !== '');

  const html = `<!doctype html><html><body style="margin:0;background:#F4F4F5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18181B">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F4F5;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:14px;overflow:hidden;border:1px solid #E4E4E7">
<tr><td style="background:#18181B;padding:16px 24px;color:#FFFFFF;font-weight:700;font-size:15px;letter-spacing:.2px">${esc(company)}</td></tr>
<tr><td style="padding:24px">
<h1 style="margin:0 0 14px;font-size:19px;line-height:1.35">${esc(plain(o.heading))}</h1>
${o.greeting ? `<p style="margin:0 0 12px;font-size:14.5px;line-height:1.6">${esc(plain(o.greeting))}</p>` : ''}
${lines.map(l => `<p style="margin:0 0 12px;font-size:14.5px;line-height:1.6;white-space:pre-line">${esc(l)}</p>`).join('')}
${facts.length ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:6px 0 16px;border-collapse:collapse;font-size:13.5px">${facts.map(f => `<tr><td style="padding:7px 0;color:#71717A;border-bottom:1px solid #F4F4F5;width:40%">${esc(f[0])}</td><td style="padding:7px 0;border-bottom:1px solid #F4F4F5;font-weight:600">${esc(plain(f[1]))}</td></tr>`).join('')}</table>` : ''}
${o.button && o.button.url ? `<p style="margin:18px 0 6px"><a href="${esc(o.button.url)}" style="display:inline-block;background:#18181B;color:#FFFFFF;text-decoration:none;padding:11px 20px;border-radius:9px;font-weight:600;font-size:14px">${esc(o.button.label || 'Open')}</a></p>` : ''}
</td></tr>
<tr><td style="padding:14px 24px;border-top:1px solid #F4F4F5;color:#A1A1AA;font-size:12px;line-height:1.5">${esc(plain(o.footer || ('This is an automatic message from ' + company + '.')))}</td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    plain(o.heading), '',
    o.greeting ? plain(o.greeting) : null,
    ...lines,
    facts.length ? '' : null,
    ...facts.map(f => `${f[0]}: ${plain(f[1])}`),
    o.button && o.button.url ? `\n${o.button.label || 'Open'}: ${o.button.url}` : null,
    '', '— ' + company
  ].filter(x => x !== null).join('\n');

  return { html, text };
}

module.exports = { render, plain, esc };
