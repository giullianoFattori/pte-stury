import Dexie, { type Table } from 'dexie';

export type AppSetting = {
  key: string;
  value: unknown;
};

export class PteDatabase extends Dexie {
  settings!: Table<AppSetting, string>;

  constructor() {
    super('pte-study-db');

    this.version(1).stores({
      settings: 'key',
    });
  }
}

export const db = new PteDatabase();
