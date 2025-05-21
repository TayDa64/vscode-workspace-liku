// esbuild.js
const esbuild = require('esbuild');
const fs = require('node:fs'); // Use node:fs for clarity
const path = require('node:path');

// Ensure dist directory and webview subdirectory exist
const projectRoot = __dirname; // Should be the root of your project
const distDir = path.join(projectRoot, 'dist');
const webviewDistDir = path.join(distDir, 'webview');

try {
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true }); // recursive true is safer
  }
  if (!fs.existsSync(webviewDistDir)) {
    fs.mkdirSync(webviewDistDir, { recursive: true });
  }
} catch (err) {
  console.error('Error creating dist directories:', err);
  process.exit(1);
}

async function build() {
  console.log('Starting build process...');
  const commonConfig = {
    bundle: true,
    sourcemap: true, // Always good for development debugging
    minify: false,   // Keep false for easier debugging initially
    logLevel: 'info', // Provides feedback from esbuild
  };

  try {
    // 1. Build Extension Host Script (extension.ts)
    console.log('Building extension host script...');
    await esbuild.build({
      ...commonConfig,
      entryPoints: [path.join(projectRoot, 'src', 'extension.ts')],
      outfile: path.join(distDir, 'extension.js'),
      platform: 'node',
      format: 'cjs',
      external: ['vscode'],
    });
    console.log(`✅ Extension host build complete: ${path.join(distDir, 'extension.js')}`);

    // 2. Build Webview Script (webview/main.ts)
    console.log('Building webview script...');
    await esbuild.build({
      ...commonConfig,
      entryPoints: [path.join(projectRoot, 'src', 'webview', 'main.ts')],
      outfile: path.join(webviewDistDir, 'main.js'), // Corrected output path
      platform: 'browser',
      format: 'iife',
    });
    console.log(`✅ Webview script build complete: ${path.join(webviewDistDir, 'main.js')}`);

    console.log('Build process finished successfully.');

  } catch (e) {
    console.error('🛑 Build failed:', e);
    process.exit(1); // Exit with error code if build fails
  }
}

// Watch mode logic
if (process.argv.includes('--watch')) {
  console.log('👀 Watch mode enabled. Initial build...');
  build().then(() => { // Perform initial build first
    const chokidar = require('chokidar'); // Moved require here so it's only needed for watch

    console.log('Setting up watchers...');
    const extensionWatcher = chokidar.watch([
      path.join(projectRoot, 'src', '**', '*.ts'),
      `!${path.join(projectRoot, 'src', 'webview', '**', '*.ts')}`, // Exclude webview files
      `!${path.join(projectRoot, 'src', '**', '*.test.ts')}` // Exclude test files
    ], { ignored: /(^|[\/\\])\../, persistent: true }); // Ignore dotfiles

    const webviewWatcher = chokidar.watch(
      path.join(projectRoot, 'src', 'webview', '**', '*.ts'),
      { ignored: /(^|[\/\\])\../, persistent: true }
    );

    extensionWatcher.on('change', async (filePath) => {
      console.log(`Extension file changed: ${filePath}. Rebuilding extension host...`);
      try {
        await esbuild.build({
          ...commonConfig, entryPoints: [path.join(projectRoot, 'src', 'extension.ts')],
          outfile: path.join(distDir, 'extension.js'), platform: 'node', format: 'cjs', external: ['vscode'],
        });
        console.log('✅ Extension host rebuild complete.');
      } catch (e) { console.error("🛑 Extension host rebuild failed:", e); }
    });

    webviewWatcher.on('change', async (filePath) => {
      console.log(`Webview file changed: ${filePath}. Rebuilding webview script...`);
      try {
        await esbuild.build({
          ...commonConfig, entryPoints: [path.join(projectRoot, 'src', 'webview', 'main.ts')],
          outfile: path.join(webviewDistDir, 'main.js'), platform: 'browser', format: 'iife',
        });
        console.log('✅ Webview script rebuild complete.');
      } catch (e) { console.error("🛑 Webview script rebuild failed:", e); }
    });
    console.log('Watchers active.');
  }).catch(err => {
    console.error("🛑 Initial build for watch mode failed:", err);
    process.exit(1);
  });
} else {
  build(); // Perform a single build
}