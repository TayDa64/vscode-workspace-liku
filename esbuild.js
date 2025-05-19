// esbuild.js (add this or modify existing)
const esbuild = require('esbuild');
const path = require('path'); // For joining paths

async function build() {
  const commonConfig = {
    bundle: true,
    sourcemap: true,
    external: ['vscode'],
    // tsconfig: 'tsconfig.json', // if you have one and want esbuild to use it
  };

  try {
    // Extension Code
    await esbuild.build({
      ...commonConfig,
      entryPoints: ['src/extension.ts'],
      outfile: 'dist/extension.js',
      platform: 'node',
      format: 'cjs',
    });
    console.log('✅ Extension build complete: dist/extension.js');

    // Webview Code
    await esbuild.build({
      ...commonConfig,
      entryPoints: ['src/webview/main.ts'],
      outfile: 'dist/webview.js',
      platform: 'browser', // Target browser environment
      format: 'iife',      // IIFE is good for webview scripts to avoid polluting global scope
      external: [], // No 'vscode' external for webview, it uses acquireVsCodeApi
    });
    console.log('✅ Webview script build complete: dist/webview.js');

  } catch (e) {
    console.error('Build failed:', e);
    process.exit(1);
  }
}

// Basic watch functionality (optional, for development)
if (process.argv.includes('--watch')) {
  console.log('👀 Watching for changes...');
  const chokidar = require('chokidar'); // npm install chokidar --save-dev
  
  // Rebuild extension
  chokidar.watch(['src/**/*.ts', '!src/webview/**/*.ts']).on('all', () => {
    console.log('Extension file changed, rebuilding extension...');
    esbuild.build({ /* ... extension config ... */ }).catch(e => console.error("Extension rebuild failed:", e));
  });

  // Rebuild webview script
  chokidar.watch('src/webview/**/*.ts').on('all', () => {
    console.log('Webview file changed, rebuilding webview script...');
    esbuild.build({ /* ... webview config ... */ }).catch(e => console.error("Webview script rebuild failed:", e));
  });
} else {
  build();
}