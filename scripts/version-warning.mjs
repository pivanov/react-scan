#!/usr/bin/env node
import boxen from 'boxen';
import chalk from 'chalk';
import { readFileSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Styling constants
const styles = {
  title: '#7B65D0',
  header: chalk.hex('#C4B5FD').bold,
  text: chalk.hex('#E4E4E7'),
  arrow: chalk.hex('#C4B5FD'),
  version: chalk.hex('#C4B5FD'),
  border: '#503C9B',
  dim: chalk.hex('#A1A1AA')
};

const MESSAGES = {
  workspace: {
    header: '📦 Workspace Packages',
    text: 'Make sure to bump versions if publishing'
  },
  package: {
    text: 'Make sure to bump version if publishing'
  }
};

function getWorkspacePackages() {
  const packagesDir = resolve(__dirname, '../packages');
  const packages = {};

  try {
    const dirs = readdirSync(packagesDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory() && dirent.name !== 'extension');

    for (const dir of dirs) {
      const pkgPath = resolve(packagesDir, dir.name, 'package.json');
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
        packages[pkg.name] = pkg.version;
      } catch (err) {
        console.error(`Error reading ${dir.name}/package.json:`, err);
      }
    }

    return packages;
  } catch (err) {
    console.error('Error reading packages directory:', err);
    process.exit(1);
  }
}

function getPackageInfo() {
  const cwd = process.cwd();
  const isWorkspacePackage = cwd.includes('packages/');
  const isRootDir = cwd === resolve(__dirname, '..');
  const isDirectPackageBuild = isWorkspacePackage && !process.env.WORKSPACE_BUILD;

  if (isDirectPackageBuild) {
    const pkgPath = resolve(cwd, 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    return { name: pkg.name, version: pkg.version };
  }

  if (isRootDir) {
    return {
      name: 'Workspace Packages',
      versions: getWorkspacePackages()
    };
  }

  process.exit(0);
}

const pkgInfo = getPackageInfo();

const message = pkgInfo.versions
  ? `${styles.text(MESSAGES.workspace.text)}\n\n` +
  `${styles.header(MESSAGES.workspace.header)}\n` +
  Object.entries(pkgInfo.versions)
    .map(([pkg, version]) => `${styles.dim(pkg.padEnd(12))}${styles.version(`v${version}`)}`)
    .join('\n')
  : `${styles.text(MESSAGES.package.text)}\n\n` +
  `${styles.dim(pkgInfo.name.padEnd(12))}${styles.version(`v${pkgInfo.version}`)}`;

console.log(boxen(message, {
  padding: 1,
  margin: 1,
  borderStyle: 'round',
  borderColor: styles.border,
  title: chalk.hex(styles.title)(`⚡ Version Check`),
  titleAlignment: 'left',
  float: 'left'
}));
