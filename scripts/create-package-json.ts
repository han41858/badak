import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';


const [, , argv] = process.argv;

enum BUILD_FORMAT {
	CJS = 'cjs',
	ESM = 'esm'
}


const buildFormatValues: BUILD_FORMAT[] = Object.values(BUILD_FORMAT);

if (!buildFormatValues.includes(argv as BUILD_FORMAT)) {
	console.error([
		`valid build format: ${ buildFormatValues.join(', ') }`,
		`invalid value: ${ argv }`
	].join('\n'));

	process.exit(1);
}

const buildFormat: BUILD_FORMAT = argv as BUILD_FORMAT;


console.log(`### build project - ${ buildFormat }`);

execSync(`tsc -p tsconfig.${ buildFormat }.json`, { stdio: 'inherit' });


console.log('### create package.json');


let typeInPackageJson: string;

switch (buildFormat) {
	case BUILD_FORMAT.CJS:
		typeInPackageJson = 'commonjs';
		break;

	case BUILD_FORMAT.ESM:
		typeInPackageJson = 'module';
		break;
}

const fullStr: string = `{ "type": "${ typeInPackageJson }" }`;
const filePath: string = `./build/${ buildFormat }/package1.json`;

writeFileSync(filePath, fullStr);
