import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { join } from 'node:path';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { PlannerData } from './src/lib/plannerData';
import { buildSeedData } from './src/lib/plannerData';

const DB_FILE = join(process.cwd(), 'planner-data.json');

type PlannerDb = Low<PlannerData>;

const createPlannerDb = async (): Promise<PlannerDb> => {
  const adapter = new JSONFile<PlannerData>(DB_FILE);
  const db = new Low(adapter, buildSeedData());
  await db.read();
  if (!db.data) {
    db.data = buildSeedData();
    await db.write();
  }
  return db;
};

const readBody = async (req: IncomingMessage): Promise<string> =>
  await new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => resolve(data));
    req.on('error', (error) => reject(error));
  });

const isPlannerData = (value: unknown): value is PlannerData => {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    Array.isArray(record.sprints) &&
    Array.isArray(record.developers) &&
    Array.isArray(record.features) &&
    Array.isArray(record.tickets)
  );
};

const plannerApiPlugin = () => {
  let dbPromise: Promise<PlannerDb> | null = null;

  const getDb = () => {
    if (!dbPromise) {
      dbPromise = createPlannerDb();
    }
    return dbPromise;
  };

  const sendJson = (res: ServerResponse, status: number, payload: unknown) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(payload));
  };

  return {
    name: 'pi-planner-api',
    async buildStart() {
      await getDb();
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/planner')) {
          next();
          return;
        }

        try {
          const db = await getDb();
          await db.read();
          if (!db.data) {
            db.data = buildSeedData();
            await db.write();
          }

          if (req.method === 'GET') {
            sendJson(res, 200, db.data);
            return;
          }

          if (req.method === 'PUT') {
            const raw = await readBody(req);
            const parsed = raw ? JSON.parse(raw) : null;
            if (!isPlannerData(parsed)) {
              sendJson(res, 400, { error: 'Invalid planner payload.' });
              return;
            }
            db.data = parsed;
            await db.write();
            res.statusCode = 204;
            res.end();
            return;
          }

          if (req.method === 'DELETE') {
            db.data = buildSeedData();
            await db.write();
            res.statusCode = 204;
            res.end();
            return;
          }

          res.statusCode = 405;
          res.setHeader('Allow', 'GET, PUT, DELETE');
          res.end();
        } catch (error) {
          console.error('pi-planner: API request failed', error);
          sendJson(res, 500, { error: 'Internal error' });
        }
      });
    },
  };
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), plannerApiPlugin()],
});
