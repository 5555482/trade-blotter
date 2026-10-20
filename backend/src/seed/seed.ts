import { PrismaClient } from '@prisma/client';

const SYMBOLS = ['AAPL', 'MSFT', 'TSLA', 'GOOGL', 'AMZN', 'META', 'NVDA', 'JPM', 'GS', 'BABA'];
const TRADERS = ['JSMITH', 'ABROWN', 'MJONES', 'KWILLIAMS', 'SDAVIS', 'LTAYLOR', 'OMARTIN'];
const BOOKS = ['EQUITIES_UK', 'EQUITIES_US', 'TECH_GROWTH', 'EMERGING_MKTS', 'FIXED_INCOME'];
const COUNTERPARTIES = ['Goldman Sachs', 'JP Morgan', 'Morgan Stanley', 'Barclays', 'Deutsche Bank', 'UBS', 'Citi'];

function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomBetween(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function generateTradeId(index: number): string {
  return `TRD-${String(100001 + index).padStart(6, '0')}`;
}

function randomTimestamp(): Date {
  const now = new Date();
  const daysAgo = Math.floor(Math.random() * 30);
  const hoursAgo = Math.floor(Math.random() * 8);
  const minutesAgo = Math.floor(Math.random() * 60);
  const d = new Date(now);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(9 + hoursAgo, minutesAgo, Math.floor(Math.random() * 60), 0);
  return d;
}

export async function seed(db?: PrismaClient): Promise<void> {
  const client = db ?? new PrismaClient();
  const count = await client.trade.count();
  if (count > 0) {
    if (!db) await client.$disconnect();
    return;
  }

  const trades = Array.from({ length: 200 }, (_, i) => ({
    id: generateTradeId(i),
    symbol: randomElement(SYMBOLS),
    quantity: Math.floor(randomBetween(100, 10000) / 100) * 100,
    price: Math.round(randomBetween(50, 600) * 100) / 100,
    side: randomElement(['BUY', 'SELL'] as const),
    trader: randomElement(TRADERS),
    book: randomElement(BOOKS),
    counterparty: randomElement(COUNTERPARTIES),
    tradeTimestamp: randomTimestamp(),
    status: Math.random() > 0.15 ? 'ACTIVE' : 'CANCELLED',
  }));

  await client.trade.createMany({ data: trades });
  console.log(`Seeded ${trades.length} trades`);
  if (!db) await client.$disconnect();
}

if (require.main === module) {
  seed().catch(console.error);
}
