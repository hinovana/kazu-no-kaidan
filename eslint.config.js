import googleTypeScriptStyle from 'gts';

export default [
  ...googleTypeScriptStyle,
  {
    files: ['generators/onaji-no-tsunagi/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        project: [
          './tsconfig.app.json',
          './generators/onaji-no-tsunagi/tsconfig.json',
        ],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
];
