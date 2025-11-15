module.exports = {
  // Backstage formatting rules
  singleQuote: true,
  trailingComma: 'all',
  arrowParens: 'avoid',
  printWidth: 120,

  // Import sorting plugin
  plugins: ['@trivago/prettier-plugin-sort-imports'],
  importOrder: ['<THIRD_PARTY_MODULES>', '^[.]'],
  importOrderSeparation: true,
  importOrderSortSpecifiers: true,
};
