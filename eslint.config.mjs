import globals from 'globals';
import pluginJs from '@eslint/js';
import tseslint from 'typescript-eslint';
import stylisticTs from '@stylistic/eslint-plugin-ts';
import pluginChaiFriendly from 'eslint-plugin-chai-friendly';


/** @type {import('eslint').Linter.Config[]} */
export default [
	{
		languageOptions: {
			globals: globals.node
		},
		files: ['**/*.{js,mjs,cjs,ts}'],
		plugins: {
			'@stylistic/ts': stylisticTs,
			'chai-friendly': pluginChaiFriendly
		},
	},


	pluginJs.configs.recommended,
	...tseslint.configs.recommended,

	{
		rules: {
			'indent': 'off',
			'@stylistic/ts/indent': [
				'warn',
				'tab',
				{
					'ignoreComments': true,
					'SwitchCase': 1,
					'ignoredNodes': [
						'CallExpression *',
						'ExpressionStatement *',
						'NewExpression *'
					]
				}
			],
			'linebreak-style': [
				'warn',
				'unix'
			],
			'arrow-parens': 'warn',
			'quotes': [
				'warn',
				'single'
			],
			'semi': [
				'warn',
				'always'
			],
			'@stylistic/ts/member-delimiter-style': [
				'warn',
				{
					'multiline': {
						'delimiter': 'semi',
						'requireLast': true
					},
					'singleline': {
						'delimiter': 'comma',
						'requireLast': false
					}
				}
			],
			'no-shadow': 'off',
			'@typescript-eslint/no-shadow': 'warn',
			'no-trailing-spaces': 'warn',
			'no-var': 'warn',
			'prefer-const': 'warn',
			'space-before-function-paren': 'warn',
			'brace-style': [
				'warn',
				'stroustrup'
			],
			'key-spacing': [
				'warn',
				{
					'beforeColon': false,
					'afterColon': true
				}
			],
			'@stylistic/ts/type-annotation-spacing': [
				'warn',
				{
					'before': false,
					'after': true,
					'overrides': {
						'arrow': {
							'before': true,
							'after': true
						}
					}
				}
			],
			'@typescript-eslint/explicit-function-return-type': 'warn',
			'@typescript-eslint/no-inferrable-types': 'off',
			'@typescript-eslint/no-non-null-assertion': 'warn',
			'@typescript-eslint/no-empty-function': 'warn',
			'@typescript-eslint/no-unused-vars': [
				'warn',
				{
					'caughtErrors': 'none'
				}
			],
			'@typescript-eslint/explicit-module-boundary-types': 'warn',
			'operator-linebreak': [
				'warn',
				'before'
			],
			'no-param-reassign': 'warn',
			'@typescript-eslint/no-empty-interface': 'off',

			// chai expect() hack
			'@typescript-eslint/no-unused-expressions': 'off',
			'chai-friendly/no-unused-expressions': 'error'
		}
	}
];
