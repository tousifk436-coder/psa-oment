/* List every route of the Express app: [{ method, path }] — used by the
   verify script and tests to prove every endpoint is reachable. */
'use strict';

function walk(stack, prefix, out) {
  stack.forEach(layer => {
    if (layer.route) {
      Object.keys(layer.route.methods).forEach(m => out.push({ method: m.toUpperCase(), path: (prefix + layer.route.path).replace(/\/+/g, '/').replace(/(.)\/$/, '$1') }));
    } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
      const src = layer.regexp && layer.regexp.source;
      let mount = '';
      if (src && src !== '^\\/?(?=\\/|$)') {
        mount = src.replace('^\\', '').replace('\\/?(?=\\/|$)', '').replace(/\\\//g, '/');
        if (!mount.startsWith('/')) mount = '/' + mount;
      }
      walk(layer.handle.stack, prefix + mount, out);
    }
  });
  return out;
}

module.exports = app => walk(app._router.stack, '', []);
