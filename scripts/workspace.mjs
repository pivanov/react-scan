import { execSync } from 'node:child_process';

const runCommand = (command, filters = []) => {
  const filterArgs = filters.map((filter) => `--filter ${filter}`).join(' ');
  execSync(`WORKSPACE_BUILD=1 pnpm ${filterArgs} ${command}`, { stdio: 'inherit' });
};

const buildAll = () => {
  runCommand('build', ['./packages/scan']);
  runCommand('build', ['./packages/*', '!./packages/scan']);
}

const devAll = () => {
  execSync('WORKSPACE_BUILD=1 pnpm --filter ./packages/scan dev & sleep 2 && pnpm --filter "./packages/*" --filter "!./packages/scan" --parallel dev', {
    stdio: 'inherit',
    shell: true
  });
}

const packAll = () => {
  runCommand('pack', ['./packages/scan']);
  runCommand('--parallel pack', ['./packages/*', '!./packages/scan']);
}

// Parse command-line arguments
const args = process.argv.slice(2);
if (args.includes('build')) buildAll();
else if (args.includes('dev')) devAll();
else if (args.includes('pack')) packAll();
// eslint-disable-next-line no-console
else console.error('Invalid command. Use: node workspace.mjs [build|dev|pack]');
