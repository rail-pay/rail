module.exports = {
    plugins: [
        'import'
    ],
    extends: [
        'eslint-config-streamr-ts'
    ],
    parserOptions: {
        ecmaVersion: 2020,
        ecmaFeatures: {
            modules: true
        }
    },
    env: {
        browser: true,
        es6: true
    },
    rules: {
        'no-console': ['error', {allow: ['warn', 'error', 'info']}],
        '@typescript-eslint/no-inferrable-types': 'off',
        'max-len': ['warn', {
            code: 150
        }],
        'no-plusplus': ['error', {
            allowForLoopAfterthoughts: true
        }],
        'no-underscore-dangle': ['error', {
            allowAfterThis: true
        }],
        'padding-line-between-statements': [
            'error',
            {
                blankLine: 'always', prev: 'if', next: 'if'
            }
        ],
        'prefer-destructuring': 'warn',
        'object-curly-newline': 'off',
        'no-continue': 'off',
        'max-classes-per-file': 'off', // javascript is not java
        // TODO check all errors/warnings and create separate PR
        'promise/always-return': 'warn',
        'promise/catch-or-return': 'warn',
        'require-atomic-updates': 'warn',
        'promise/param-names': 'warn',
        'no-restricted-syntax': [
            'error', 'ForInStatement', 'LabeledStatement', 'WithStatement'
        ],
        'import/extensions': ['error', 'never', { json: 'always' }],
        'lines-between-class-beneficiaries': 'off',
        'padded-blocks': 'off',
        'no-use-before-define': 'off',
        'import/order': 'off',
        'no-shadow': 'off',
        '@typescript-eslint/no-shadow': 'error',
        'no-unused-vars': 'off',
        '@typescript-eslint/no-unused-vars': ['error', {
            argsIgnorePattern: '^_',
            varsIgnorePattern: '^_',
        }],
        '@typescript-eslint/consistent-type-imports': ['error', {
            prefer: 'type-imports',
        }],
        'quote-props': ['error', 'consistent-as-needed'],
        'import/no-extraneous-dependencies': ['error', { devDependencies: false }],
        'no-redeclare': 'off',
        '@typescript-eslint/no-redeclare': ['error'],
        'no-dupe-class-beneficiaries': 'off',
        '@typescript-eslint/no-dupe-class-beneficiaries': ['error'],
        'no-useless-constructor': 'off',
        '@typescript-eslint/no-useless-constructor': ['error'],
        'no-empty-function': 'off',
        '@typescript-eslint/ban-ts-comment': 'warn',
        '@typescript-eslint/explicit-module-boundary-types': 'warn'
    },
    settings: {
        'import/resolver': {
            node: {
                extensions: ['.js', '.ts']
            }
        }
    }
}
