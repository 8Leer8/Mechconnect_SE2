export const shouldMarkAsAdded = (currentIt: any, previousIt: any): boolean => {
  if (previousIt) return false;

  const currentStatus = String(currentIt?.status || '').toLowerCase();
  const currentChangeType = String(currentIt?.change_type || '').toLowerCase();

  return (
    currentStatus === 'pending' ||
    currentStatus === 'rejected' ||
    currentChangeType === 'added'
  );
};

// Lightweight self-checks for mixed quotation change scenarios.
// This runs only in development when called from UI modules.
export const runQuotationDiffSelfCheck = (): string[] => {
  const failures: string[] = [];

  const cases = [
    {
      name: 'Accepted baseline row is not added',
      current: { status: 'accepted', change_type: null },
      previous: null,
      expected: false,
    },
    {
      name: 'Pending row without previous is added',
      current: { status: 'pending', change_type: null },
      previous: null,
      expected: true,
    },
    {
      name: 'Explicit added row is added',
      current: { status: 'accepted', change_type: 'added' },
      previous: null,
      expected: true,
    },
    {
      name: 'Matched previous row is not added',
      current: { status: 'pending', change_type: 'added' },
      previous: { id: 10 },
      expected: false,
    },
  ];

  cases.forEach((tc) => {
    const actual = shouldMarkAsAdded(tc.current, tc.previous);
    if (actual !== tc.expected) {
      failures.push(`${tc.name} (expected ${String(tc.expected)}, got ${String(actual)})`);
    }
  });

  return failures;
};
