// type tests (spec/types) against the packed package, as consumers use it
// npm pack -> npm install the tarball into a temp project -> compile each type test with import 'badak'
// for ESM (node16, nodenext, bundler) and CJS (node16)
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';


const root: string = process.cwd();
const isWindows: boolean = process.platform === 'win32';
const npm: string = isWindows ? 'npm.cmd' : 'npm';
const tsc: string = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');

interface Mode {
	name: string;
	module: string;
	moduleResolution: string;
	extension: '.mts' | '.cts';
}

const modes: Mode[] = [
	{ name: 'ESM node16', module: 'node16', moduleResolution: 'node16', extension: '.mts' },
	{ name: 'ESM nodenext', module: 'nodenext', moduleResolution: 'nodenext', extension: '.mts' },
	{ name: 'ESM bundler', module: 'esnext', moduleResolution: 'bundler', extension: '.mts' },
	{ name: 'CJS node16', module: 'node16', moduleResolution: 'node16', extension: '.cts' }
];

const typeTestDir: string = path.join(root, 'spec', 'types');
const typeTests: string[] = fs.readdirSync(typeTestDir).filter((file: string): boolean => file.endsWith('.types.ts'));

if (typeTests.length === 0) {
	console.error(`no type tests in ${ typeTestDir }`);
	process.exit(1);
}

const tempDir: string = fs.mkdtempSync(path.join(os.tmpdir(), 'badak-dist-types-'));
let failed: number = 0;

try {
	// prepack builds the package
	execFileSync(npm, ['pack', '--silent', '--pack-destination', tempDir], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'], shell: isWindows });

	const tarball: string | undefined = fs.readdirSync(tempDir).find((file: string): boolean => file.endsWith('.tgz'));

	if (tarball === undefined) {
		throw new Error('npm pack didn\'t make a tarball');
	}

	fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'badak-dist-types', private: true }));

	execFileSync(npm, ['install', '--no-save', '--no-audit', '--no-fund', path.join(tempDir, tarball)], {
		cwd: tempDir,
		stdio: ['ignore', 'ignore', 'inherit'],
		shell: isWindows
	});

	for (const typeTest of typeTests) {
		const source: string = fs.readFileSync(path.join(typeTestDir, typeTest), 'utf8');
		const consumerSource: string = source.replace(/(['"])\.\.\/\.\.\/src\/index\.js\1/g, '\'badak\'');

		if (consumerSource === source) {
			throw new Error(`${ typeTest } should import '../../src/index.js'`);
		}

		for (const mode of modes) {
			const file: string = path.join(tempDir, typeTest.replace(/\.ts$/, mode.extension));

			fs.writeFileSync(file, consumerSource);

			try {
				execFileSync(process.execPath, [
					tsc,
					'--ignoreConfig',
					'--noEmit',
					'--strict',
					'--target', 'es2022',
					'--module', mode.module,
					'--moduleResolution', mode.moduleResolution,
					'--typeRoots', path.join(root, 'node_modules', '@types'),
					'--types', 'node',
					file
				], { cwd: tempDir, stdio: 'pipe' });

				console.log(`ok   ${ mode.name.padEnd(13) } ${ typeTest }`);
			}
			catch (err: unknown) {
				failed++;

				console.error(`fail ${ mode.name.padEnd(13) } ${ typeTest }`);
				console.error(String((err as { stdout?: Buffer }).stdout ?? err));
			}
			finally {
				fs.rmSync(file);
			}
		}
	}
}
finally {
	fs.rmSync(tempDir, { recursive: true, force: true });
}

if (failed > 0) {
	process.exit(1);
}
