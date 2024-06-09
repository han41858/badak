import globals from 'globals';
import pluginJs from '@eslint/js';
import tseslint from 'typescript-eslint';


export default [
	{
		languageOptions: {
			globals: globals.node
		}
	},
	pluginJs.configs.recommended,
	...tseslint.configs.recommended,

	{
		rules: {
			'indent': 'off',
			'@typescript-eslint/indent': [
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
				'windows'
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
			'@typescript-eslint/member-delimiter-style': [
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
			'@typescript-eslint/type-annotation-spacing': [
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
			'@typescript-eslint/no-unused-vars': 'warn',
			'@typescript-eslint/explicit-module-boundary-types': 'warn',
			'operator-linebreak': [
				'warn',
				'before'
			],
			'no-param-reassign': 'warn',
			'@typescript-eslint/no-empty-interface': 'off'
		}
	}
];
