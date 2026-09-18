// The Orders table in Azure Table Storage. One partition per season, one row per order.
import { TableClient, odata } from '@azure/data-tables';

export function tableStore(connectionString, tableName) {
  const client = TableClient.fromConnectionString(connectionString, tableName);
  return {
    // Replace, not merge: the device always sends the whole order.
    upsert: entity => client.upsertEntity(entity, 'Replace'),
    async list(partitionKey) {
      const rows = [];
      for await (const e of client.listEntities({ queryOptions: { filter: odata`PartitionKey eq ${partitionKey}` } })) rows.push(e);
      return rows;
    },
  };
}
