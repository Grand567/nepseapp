require('esbuild').build({
  entryPoints: ['src/utils/liveData.js'],
  bundle: true,
  outfile: 'out.js',
  format: 'esm',
  external: ['react', '@capacitor/core']
}).then(() => console.log('build success')).catch(() => console.log('build failed'));
