const esbuild = require('esbuild');
const path = require('path');

esbuild.buildSync({
  entryPoints: [path.join(__dirname, 'analytics-entry.js')],
  outfile: path.join(__dirname, '..', 'js', 'vercel-analytics.bundle.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2018'],
  minify: true,
});

console.log('Built js/vercel-analytics.bundle.js');
