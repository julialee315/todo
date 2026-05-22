// Tiny mock factory for the supabase-js query builder. The real builder is a
// chainable object whose terminal value (the result) is delivered either by an
// awaited terminator (.single() / .maybeSingle()) or by awaiting the chain
// itself (it's thenable). Our mock mimics both.
//
// Usage:
//   const client = makeClient({
//     tasks: { data: [...], error: null },
//     subtasks: () => makeChain({ data: [...], error: null }), // per-call
//   });
//   await myAdapter(client, ...)

import { vi, type Mock } from 'vitest';

type QueryResult = { data: any; error: any };

export interface MockChain {
  select: Mock;
  insert: Mock;
  update: Mock;
  delete: Mock;
  upsert: Mock;
  eq: Mock;
  in: Mock;
  order: Mock;
  limit: Mock;
  range: Mock;
  match: Mock;
  is: Mock;
  maybeSingle: Mock;
  single: Mock;
  then: (resolve: any, reject?: any) => Promise<any>;
}

export function makeChain(result: QueryResult): MockChain {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {};
  for (const m of [
    'select',
    'insert',
    'update',
    'delete',
    'upsert',
    'eq',
    'in',
    'order',
    'limit',
    'range',
    'match',
    'is',
  ]) {
    chain[m] = vi.fn(() => chain);
  }
  chain.maybeSingle = vi.fn(() => Promise.resolve(result));
  chain.single = vi.fn(() => Promise.resolve(result));
  chain.then = (resolve: any, reject?: any) =>
    Promise.resolve(result).then(resolve, reject);
  return chain;
}

type TableSpec = QueryResult | (() => MockChain);

export interface MockClient {
  from: Mock;
  /** Last chain returned for the named table — convenient for assertions. */
  _last: Record<string, MockChain>;
}

export function makeClient(byTable: Record<string, TableSpec> = {}): MockClient {
  const last: Record<string, MockChain> = {};
  const from = vi.fn((table: string) => {
    const spec = byTable[table];
    const chain = typeof spec === 'function' ? spec() : makeChain(spec ?? { data: [], error: null });
    last[table] = chain;
    return chain;
  });
  return { from, _last: last } as MockClient;
}
