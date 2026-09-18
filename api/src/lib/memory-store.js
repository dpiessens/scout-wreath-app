// In-memory stand-in for the Orders table, for tests and the local dev server.
export function memoryStore() {
  const rows = new Map();
  return {
    rows,
    async upsert(entity) {
      rows.set(`${entity.partitionKey}|${entity.rowKey}`, structuredClone(entity));
    },
    async list(partitionKey) {
      return [...rows.values()].filter(e => e.partitionKey === partitionKey).map(e => structuredClone(e));
    },
  };
}
