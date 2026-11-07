module.exports = {
  forbidden: [
    {
      name: 'no-circular-dependencies',
      severity: 'error',
      comment: 'Circular dependencies cause initialization bugs and tight coupling.',
      from: {},
      to: { circular: true }
    },
    {
      name: 'ui-cannot-import-db-directly',
      severity: 'error',
      comment: 'UI components must route through services or API layers, never directly to database/models.',
      from: { path: '^src/(components|pages|views|ui)/' },
      to: { path: '^src/(db|database|models|prisma|repositories)/' }
    }
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true
  }
};
