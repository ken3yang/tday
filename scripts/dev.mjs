#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const rootDir = fileURLToPath(new URL('..', import.meta.url));
const coreDir = path.join(rootDir, 'crates', 'tday-core');
const desktopDir = path.join(rootDir, 'apps', 'desktop');
const lockfilePath = path.join(rootDir, 'pnpm-lock.yaml');
const modulesManifestPath = path.join(rootDir, 'node_modules', '.modules.yaml');
const rebuildStampPath = path.join(rootDir, 'node_modules', '.cache', 'tday-electron-rebuild.json');

function commandForCurrentPlatform(command) {
  return process.platform === 'win32' ? `${command}.cmd` : command;
}

function run(command, args, options = {}) {
  const result = spawnSync(commandForCurrentPlatform(command), args, {
    cwd: rootDir,
    stdio: 'inherit',
    ...options
  });

  if (result.error) {
    if (result.error.code === 'ENOENT') {
      console.error(`[tday] Missing required command: ${command}`);
    } else {
      console.error(`[tday] Failed to run ${command}:`, result.error.message);
    }
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function ensureNodeVersion() {
  const major = Number.parseInt(process.versions.node.split('.')[0], 10);
  if (major < 20) {
    console.error(`[tday] Node.js 20+ is required. Current version: ${process.version}`);
    process.exit(1);
  }
}

function shouldInstallDependencies() {
  if (!existsSync(modulesManifestPath)) {
    return true;
  }

  return statSync(modulesManifestPath).mtimeMs < statSync(lockfilePath).mtimeMs;
}

function installDependenciesIfNeeded() {
  if (!shouldInstallDependencies()) {
    console.log('[tday] Using existing dependencies');
    return;
  }

  console.log('[tday] Installing workspace dependencies');
  run('corepack', ['pnpm', 'install']);
}

function rebuildElectronNativeDepsIfNeeded() {
  const desktopPkgPath = path.join(desktopDir, 'package.json');
  let nodePtyPkgPath;
  try {
    nodePtyPkgPath = require.resolve('node-pty/package.json', { paths: [desktopDir] });
  } catch {
    return;
  }
  if (!existsSync(desktopPkgPath)) {
    return;
  }

  const desktopPkg = JSON.parse(readFileSync(desktopPkgPath, 'utf8'));
  const nodePtyPkg = JSON.parse(readFileSync(nodePtyPkgPath, 'utf8'));
  const stamp = JSON.stringify({
    electron: desktopPkg.devDependencies?.electron ?? '',
    nodePty: nodePtyPkg.version ?? '',
    lockfileMtimeMs: statSync(lockfilePath).mtimeMs,
  });

  if (existsSync(rebuildStampPath) && readFileSync(rebuildStampPath, 'utf8') === stamp) {
    console.log('[tday] Electron native deps already rebuilt');
    return;
  }

  console.log('[tday] Rebuilding Electron native deps');
  run('corepack', ['pnpm', '--filter', '@tday/desktop', 'exec', 'electron-rebuild', '-f', '-w', 'node-pty']);
  mkdirSync(path.dirname(rebuildStampPath), { recursive: true });
  writeFileSync(rebuildStampPath, stamp);
}

function buildRustCore() {
  console.log('[tday] Building tday-core');
  run('cargo', ['build', '--release'], { cwd: coreDir });
}

function launchDesktopApp() {
  console.log('[tday] Launching desktop app');

  const child = spawn(commandForCurrentPlatform('corepack'), ['pnpm', '--filter', '@tday/desktop', 'dev'], {
    cwd: rootDir,
    stdio: 'inherit'
  });

  child.on('error', (error) => {
    console.error('[tday] Failed to launch desktop app:', error.message);
    process.exit(1);
  });

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      if (!child.killed) {
        child.kill(signal);
      }
    });
  }

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

ensureNodeVersion();
installDependenciesIfNeeded();
rebuildElectronNativeDepsIfNeeded();
buildRustCore();
launchDesktopApp();
