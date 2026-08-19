/* session-store.js — minimal SQLite-backed express-session store.
 *
 * Replaces the default MemoryStore, which leaks memory and drops every session
 * on restart. Implemented against the already-open sqlite3 handle instead of
 * pulling in `connect-sqlite3` (that package pins sqlite3 ^5 and conflicts with
 * the sqlite3 ^6 used here). */

module.exports = function createSessionStore(session, db) {
  const Store = session.Store;

  class SqliteStore extends Store {
    constructor(options = {}) {
      super(options);
      this.db = options.db;
      this.ttl = options.ttl || 1000 * 60 * 60 * 24 * 7;
      // Prune expired rows hourly. unref() so the timer never blocks exit.
      this.pruneTimer = setInterval(() => this.prune(), 1000 * 60 * 60);
      if (this.pruneTimer.unref) this.pruneTimer.unref();
      this.prune();
    }

    prune() {
      this.db.run('DELETE FROM sessions WHERE expires < ?', [Date.now()], () => {});
    }

    get(sid, cb) {
      this.db.get('SELECT data, expires FROM sessions WHERE sid = ?', [sid], (err, row) => {
        if (err) return cb(err);
        if (!row) return cb(null, null);
        if (row.expires && row.expires < Date.now()) {
          return this.destroy(sid, () => cb(null, null));
        }
        try {
          return cb(null, JSON.parse(row.data));
        } catch (parseErr) {
          return this.destroy(sid, () => cb(null, null));
        }
      });
    }

    set(sid, sess, cb = () => {}) {
      let expires = Date.now() + this.ttl;
      if (sess && sess.cookie && sess.cookie.expires) {
        const parsed = new Date(sess.cookie.expires).getTime();
        if (!Number.isNaN(parsed)) expires = parsed;
      }
      let data;
      try {
        data = JSON.stringify(sess);
      } catch (err) {
        return cb(err);
      }
      this.db.run(
        'INSERT INTO sessions (sid, expires, data) VALUES (?,?,?) ' +
          'ON CONFLICT(sid) DO UPDATE SET expires = excluded.expires, data = excluded.data',
        [sid, expires, data],
        cb
      );
    }

    touch(sid, sess, cb = () => {}) {
      let expires = Date.now() + this.ttl;
      if (sess && sess.cookie && sess.cookie.expires) {
        const parsed = new Date(sess.cookie.expires).getTime();
        if (!Number.isNaN(parsed)) expires = parsed;
      }
      this.db.run('UPDATE sessions SET expires = ? WHERE sid = ?', [expires, sid], cb);
    }

    destroy(sid, cb = () => {}) {
      this.db.run('DELETE FROM sessions WHERE sid = ?', [sid], cb);
    }

    clear(cb = () => {}) {
      this.db.run('DELETE FROM sessions', cb);
    }

    length(cb) {
      this.db.get('SELECT COUNT(*) AS n FROM sessions', [], (err, row) => {
        if (err) return cb(err);
        cb(null, row ? row.n : 0);
      });
    }
  }

  return new SqliteStore({ db });
};
