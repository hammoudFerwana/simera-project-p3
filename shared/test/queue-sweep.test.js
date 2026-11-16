/**
 * The worker's periodic queue sweep: 'queued' jobs whose send to pg-boss was
 * lost in the API are sent again, without a worker restart. Fake DB and fake
 * boss; no PostgreSQL or pg-boss needed.
 */
const { QUEUE, enqueueLostJobs, startQueueSweep } = require('../src/queue');

function createFakes(lostIds = []) {
  const db = {
    query: jest.fn(async () => ({ rows: lostIds.map((id) => ({ id })) }))
  };
  const boss = { send: jest.fn(async () => 'boss-job-id') };
  return { db, boss };
}

describe('enqueueLostJobs', () => {
  test('sends every lost job once, in id order from the query', async () => {
    const { db, boss } = createFakes([4, 9]);

    const sent = await enqueueLostJobs(boss, db, { graceSeconds: 30 });

    expect(sent).toBe(2);
    expect(boss.send.mock.calls.map((call) => call[1])).toEqual([
      { jobId: 4 },
      { jobId: 9 }
    ]);
    for (const call of boss.send.mock.calls) {
      expect(call[0]).toBe(QUEUE);
    }
  });

  test('the query picks only old queued jobs without a live pg-boss job', async () => {
    const { db, boss } = createFakes();

    await enqueueLostJobs(boss, db);

    const [sql, params] = db.query.mock.calls[0];
    const text = sql.replace(/\s+/g, ' ');
    expect(text).toContain("pj.status = 'queued'");
    expect(text).toContain('make_interval(secs => $2)');
    expect(text).toContain('FROM pgboss.job b');
    expect(text).toContain("b.state IN ('created', 'retry', 'active')");
    expect(text).toContain("b.data->>'jobId' = pj.id::text");
    expect(params).toEqual([QUEUE, 60]);
    expect(boss.send).not.toHaveBeenCalled();
  });
});

describe('startQueueSweep', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const logger = () => ({ log: jest.fn(), error: jest.fn() });

  test('runs every interval and logs what it sent', async () => {
    const { db, boss } = createFakes([7]);
    const log = logger();
    const stop = startQueueSweep(boss, db, {
      intervalSeconds: 60,
      logger: log
    });

    expect(db.query).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(60_000);
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(boss.send).toHaveBeenCalledTimes(1);
    expect(log.log).toHaveBeenCalledWith(
      'queue sweep: 1 lost job(s) sent to the queue'
    );

    await jest.advanceTimersByTimeAsync(60_000);
    expect(db.query).toHaveBeenCalledTimes(2);

    stop();
    await jest.advanceTimersByTimeAsync(120_000);
    expect(db.query).toHaveBeenCalledTimes(2);
  });

  test('a failed run is logged and the next run tries again', async () => {
    const { db, boss } = createFakes();
    db.query.mockRejectedValueOnce(new Error('connection lost'));
    const log = logger();
    const stop = startQueueSweep(boss, db, {
      intervalSeconds: 10,
      logger: log
    });

    await jest.advanceTimersByTimeAsync(10_000);
    expect(log.error).toHaveBeenCalledWith(
      'queue sweep failed:',
      'connection lost'
    );

    await jest.advanceTimersByTimeAsync(10_000);
    expect(db.query).toHaveBeenCalledTimes(2);
    expect(log.log).not.toHaveBeenCalled();
    stop();
  });

  test('a slow run is never overlapped by the next one', async () => {
    const { boss } = createFakes();
    let finish;
    const db = {
      query: jest.fn(
        () =>
          new Promise((resolve) => {
            finish = () => resolve({ rows: [] });
          })
      )
    };
    const stop = startQueueSweep(boss, db, {
      intervalSeconds: 1,
      logger: logger()
    });

    await jest.advanceTimersByTimeAsync(5_000);
    expect(db.query).toHaveBeenCalledTimes(1);

    finish();
    await jest.advanceTimersByTimeAsync(1_000);
    expect(db.query).toHaveBeenCalledTimes(2);
    stop();
  });
});
