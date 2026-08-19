import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import * as ExcelJS from 'exceljs';
import { RoughCountryXlsxFeedClient } from './rough-country-xlsx-feed.client';

interface SheetSpec {
  name: string;
  rows: unknown[][];
}

const buildWorkbook = async (sheets: SheetSpec[]): Promise<Buffer> => {
  const workbook = new ExcelJS.Workbook();
  for (const sheet of sheets) {
    const ws = workbook.addWorksheet(sheet.name);
    sheet.rows.forEach((row) => ws.addRow(row));
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
};

const HEADERS = ['sku', 'availability', 'NV_Stock', 'TN_Stock'];

describe('RoughCountryXlsxFeedClient', () => {
  const config = { get: jest.fn() };
  let client: RoughCountryXlsxFeedClient;
  let fetchMock: jest.SpyInstance;

  const respondWith = (buffer: Buffer, init: ResponseInit = {}) => {
    fetchMock.mockResolvedValue(new Response(new Uint8Array(buffer), init));
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    config.get.mockReturnValue({
      enabled: true,
      feedUrl: 'https://example.test/feed.xlsx',
      branchNvId: 2,
      branchTnId: 1,
      timeZone: 'America/Mexico_City',
    });
    fetchMock = jest.spyOn(global, 'fetch');

    const moduleRef = await Test.createTestingModule({
      providers: [
        RoughCountryXlsxFeedClient,
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    client = moduleRef.get(RoughCountryXlsxFeedClient);
  });

  afterEach(() => fetchMock.mockRestore());

  it('reads sku, NV_Stock and TN_Stock from the first worksheet', async () => {
    respondWith(
      await buildWorkbook([
        {
          name: 'General',
          rows: [
            HEADERS,
            ['401002', 'In Stock', 4, 11],
            ['PAT21', 'In Stock', 0, 7],
          ],
        },
      ]),
    );

    await expect(client.fetchStockRows()).resolves.toEqual([
      { sku: '401002', nvStock: 4, tnStock: 11 },
      { sku: 'PAT21', nvStock: 0, tnStock: 7 },
    ]);
  });

  it('locates columns by header name rather than by position', async () => {
    respondWith(
      await buildWorkbook([
        {
          name: 'General',
          rows: [
            ['TN_Stock', 'sku', 'price', 'NV_Stock'],
            [11, '401002', 499.95, 4],
          ],
        },
      ]),
    );

    await expect(client.fetchStockRows()).resolves.toEqual([
      { sku: '401002', nvStock: 4, tnStock: 11 },
    ]);
  });

  it('collapses duplicate SKUs to a single row, keeping the last occurrence', async () => {
    respondWith(
      await buildWorkbook([
        {
          name: 'General',
          rows: [
            HEADERS,
            ['51055', 'In Stock', 20, 40],
            ['51055', 'In Stock', 25, 41],
          ],
        },
      ]),
    );

    await expect(client.fetchStockRows()).resolves.toEqual([
      { sku: '51055', nvStock: 25, tnStock: 41 },
    ]);
  });

  it('normalizes missing, non-numeric and negative quantities to zero', async () => {
    respondWith(
      await buildWorkbook([
        {
          name: 'General',
          rows: [
            HEADERS,
            ['A1', 'In Stock', null, 5],
            ['A2', 'In Stock', 'n/a', 5],
            ['A3', 'In Stock', -8, 5],
          ],
        },
      ]),
    );

    await expect(client.fetchStockRows()).resolves.toEqual([
      { sku: 'A1', nvStock: 0, tnStock: 5 },
      { sku: 'A2', nvStock: 0, tnStock: 5 },
      { sku: 'A3', nvStock: 0, tnStock: 5 },
    ]);
  });

  it('trims SKUs and drops rows without one', async () => {
    respondWith(
      await buildWorkbook([
        {
          name: 'General',
          rows: [
            HEADERS,
            ['  10020WC  ', 'In Stock', 1, 2],
            [null, 'In Stock', 9, 9],
            ['', '', 1, 1],
          ],
        },
      ]),
    );

    await expect(client.fetchStockRows()).resolves.toEqual([
      { sku: '10020WC', nvStock: 1, tnStock: 2 },
    ]);
  });

  it('ignores every worksheet after the first', async () => {
    respondWith(
      await buildWorkbook([
        { name: 'General', rows: [HEADERS, ['REAL', 'In Stock', 1, 2]] },
        {
          name: 'Vehicle Fitment',
          rows: [HEADERS, ['FITMENT', 'In Stock', 99, 99]],
        },
      ]),
    );

    const rows = await client.fetchStockRows();

    expect(rows.map((r) => r.sku)).toEqual(['REAL']);
  });

  it('coerces numeric SKUs to strings', async () => {
    respondWith(
      await buildWorkbook([
        { name: 'General', rows: [HEADERS, [401002, 'In Stock', 1, 2]] },
      ]),
    );

    const rows = await client.fetchStockRows();

    expect(rows[0].sku).toBe('401002');
  });

  it('raises ServiceUnavailableException when the feed responds with an error', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 503 }));

    await expect(client.fetchStockRows()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('raises ServiceUnavailableException when a required column is absent', async () => {
    respondWith(
      await buildWorkbook([
        {
          name: 'General',
          rows: [
            ['sku', 'availability'],
            ['A1', 'In Stock'],
          ],
        },
      ]),
    );

    await expect(client.fetchStockRows()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
