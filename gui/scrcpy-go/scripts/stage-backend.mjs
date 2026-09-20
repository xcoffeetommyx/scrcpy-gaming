import { cpSync, existsSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const platform = process.platform;
if (!['win32', 'linux'].includes(platform)) throw new Error('Only Windows and Linux builds are supported.');
const build = platform === 'win32' ? 'build-win64' : 'build-linux-x86_64';
const source = realpathSync(resolve(process.env.SCRCPY_GO_BACKEND_DIR || join(app, '../../release/work', build, 'dist')));
const destination = join(app, 'src-tauri/resources/backend');
const executable = platform === 'win32' ? '.exe' : '';
for (const name of [`scrcpy${executable}`, `adb${executable}`, 'scrcpy-server']) {
  if (!existsSync(join(source, name))) throw new Error(`Backend distribution is missing ${name}`);
}
const result = spawnSync(join(source, `scrcpy${executable}`), ['--help'], {
  cwd: source, encoding: 'utf8', windowsHide: true, timeout: 15_000,
});
if (result.error || result.status !== 0) throw new Error(`Backend validation failed: ${result.error || result.stderr}`);
for (const flag of ['--game-mode-profile', '--fullscreen-exclusive', '--render-vsync']) {
  if (!(result.stdout + result.stderr).includes(flag)) throw new Error(`Backend is outdated: missing ${flag}`);
}
// Resolve symlinks before deleting generated resources; reject overlapping paths.
mkdirSync(destination, { recursive: true });
const target = realpathSync(destination);
const resources = realpathSync(join(app, 'src-tauri/resources'));
const inside = (parent, child) => { const rel = relative(parent, child); return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel)); };
if (target !== join(resources, 'backend') || inside(source, target) || inside(target, source)) {
  throw new Error('Unsafe or overlapping backend staging paths.');
}
rmSync(target, { recursive: true });
cpSync(source, target, { recursive: true, dereference: true });
writeFileSync(join(target, '.gitkeep'), '');
console.log(`Staged ${platform} backend from ${source}`);
