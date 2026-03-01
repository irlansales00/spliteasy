const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { createClient } = require('@libsql/client');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.SESSION_SECRET || 'splitwise-clone-secret-key-2025';

// --- Database Setup (Turso / local libsql) ---
let db;

function getDB() {
    if (!db) {
        if (process.env.TURSO_DATABASE_URL) {
            db = createClient({
                url: process.env.TURSO_DATABASE_URL,
                authToken: process.env.TURSO_AUTH_TOKEN,
            });
        } else {
            db = createClient({ url: 'file:./splitwise.db' });
        }
    }
    return db;
}

async function initDB() {
    const client = getDB();
    await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      avatar_color TEXT DEFAULT '#1db954',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS groups_ (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      emoji TEXT DEFAULT '💰',
      created_by TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS group_members (
      group_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      PRIMARY KEY (group_id, user_id),
      FOREIGN KEY (group_id) REFERENCES groups_(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      paid_by TEXT NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (group_id) REFERENCES groups_(id),
      FOREIGN KEY (paid_by) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS expense_splits (
      id TEXT PRIMARY KEY,
      expense_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      amount REAL NOT NULL,
      FOREIGN KEY (expense_id) REFERENCES expenses(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS settlements (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      from_user TEXT NOT NULL,
      to_user TEXT NOT NULL,
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (group_id) REFERENCES groups_(id),
      FOREIGN KEY (from_user) REFERENCES users(id),
      FOREIGN KEY (to_user) REFERENCES users(id)
    );
  `);
}

async function queryAll(sql, args = []) {
    const client = getDB();
    const result = await client.execute({ sql, args });
    return result.rows;
}

async function queryOne(sql, args = []) {
    const rows = await queryAll(sql, args);
    return rows.length > 0 ? rows[0] : null;
}

async function execute(sql, args = []) {
    const client = getDB();
    return client.execute({ sql, args });
}

// --- Middleware ---
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '..', 'public')));

// JWT Auth helpers
function createToken(userId) {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
}

function setAuthCookie(res, userId) {
    const token = createToken(userId);
    res.cookie('auth_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: '/',
    });
}

function requireAuth(req, res, next) {
    const token = req.cookies.auth_token;
    if (!token) {
        return res.status(401).json({ error: 'Não autenticado' });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.userId;
        next();
    } catch {
        return res.status(401).json({ error: 'Sessão expirada' });
    }
}

// --- Ensure DB is initialized ---
let dbInitialized = false;
app.use(async (req, res, next) => {
    if (!dbInitialized) {
        await initDB();
        dbInitialized = true;
    }
    next();
});

// --- Auth Routes ---
app.post('/api/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
        }
        if (password.length < 4) {
            return res.status(400).json({ error: 'Senha deve ter pelo menos 4 caracteres' });
        }

        const existing = await queryOne('SELECT id FROM users WHERE username = ? OR email = ?', [username.toLowerCase(), email.toLowerCase()]);
        if (existing) {
            return res.status(400).json({ error: 'Usuário ou email já existe' });
        }

        const id = uuidv4();
        const password_hash = bcrypt.hashSync(password, 10);
        const colors = ['#1db954', '#e74c3c', '#3498db', '#f39c12', '#9b59b6', '#e91e63', '#00bcd4', '#ff5722'];
        const avatar_color = colors[Math.floor(Math.random() * colors.length)];

        await execute('INSERT INTO users (id, username, email, password_hash, avatar_color) VALUES (?, ?, ?, ?, ?)',
            [id, username.toLowerCase(), email.toLowerCase(), password_hash, avatar_color]);

        setAuthCookie(res, id);
        res.json({ id, username: username.toLowerCase(), email: email.toLowerCase(), avatar_color });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
        }

        const user = await queryOne('SELECT * FROM users WHERE username = ? OR email = ?',
            [username.toLowerCase(), username.toLowerCase()]);

        if (!user || !bcrypt.compareSync(password, user.password_hash)) {
            return res.status(401).json({ error: 'Usuário ou senha inválidos' });
        }

        setAuthCookie(res, user.id);
        res.json({ id: user.id, username: user.username, email: user.email, avatar_color: user.avatar_color });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

app.post('/api/logout', (req, res) => {
    res.clearCookie('auth_token', { path: '/' });
    res.json({ ok: true });
});

app.get('/api/me', requireAuth, async (req, res) => {
    const user = await queryOne('SELECT id, username, email, avatar_color FROM users WHERE id = ?', [req.userId]);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json(user);
});

// --- Groups Routes ---
app.get('/api/groups', requireAuth, async (req, res) => {
    try {
        const groups = await queryAll(`
      SELECT g.*, u.username as creator_name,
        (SELECT COUNT(*) FROM group_members gm2 WHERE gm2.group_id = g.id) as member_count,
        (SELECT COALESCE(SUM(e.amount), 0) FROM expenses e WHERE e.group_id = g.id) as total_expenses
      FROM groups_ g
      JOIN group_members gm ON gm.group_id = g.id
      JOIN users u ON u.id = g.created_by
      WHERE gm.user_id = ?
      ORDER BY g.created_at DESC
    `, [req.userId]);
        res.json(groups);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao buscar grupos' });
    }
});

app.post('/api/groups', requireAuth, async (req, res) => {
    try {
        const { name, emoji } = req.body;
        if (!name) return res.status(400).json({ error: 'Nome do grupo é obrigatório' });

        const id = uuidv4();
        await execute('INSERT INTO groups_ (id, name, emoji, created_by) VALUES (?, ?, ?, ?)',
            [id, name, emoji || '💰', req.userId]);
        await execute('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)',
            [id, req.userId]);

        res.json({ id, name, emoji: emoji || '💰' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao criar grupo' });
    }
});

app.get('/api/groups/:id', requireAuth, async (req, res) => {
    try {
        const group = await queryOne('SELECT * FROM groups_ WHERE id = ?', [req.params.id]);
        if (!group) return res.status(404).json({ error: 'Grupo não encontrado' });

        const isMember = await queryOne('SELECT 1 as ok FROM group_members WHERE group_id = ? AND user_id = ?',
            [req.params.id, req.userId]);
        if (!isMember) return res.status(403).json({ error: 'Acesso negado' });

        const members = await queryAll(`
      SELECT u.id, u.username, u.avatar_color
      FROM users u
      JOIN group_members gm ON gm.user_id = u.id
      WHERE gm.group_id = ?
    `, [req.params.id]);

        res.json({ ...group, members });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao buscar grupo' });
    }
});

app.post('/api/groups/:id/members', requireAuth, async (req, res) => {
    try {
        const { username } = req.body;
        if (!username) return res.status(400).json({ error: 'Username é obrigatório' });

        const isMember = await queryOne('SELECT 1 as ok FROM group_members WHERE group_id = ? AND user_id = ?',
            [req.params.id, req.userId]);
        if (!isMember) return res.status(403).json({ error: 'Acesso negado' });

        const user = await queryOne('SELECT id, username, avatar_color FROM users WHERE username = ?',
            [username.toLowerCase()]);
        if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

        const alreadyMember = await queryOne('SELECT 1 as ok FROM group_members WHERE group_id = ? AND user_id = ?',
            [req.params.id, user.id]);
        if (alreadyMember) return res.status(400).json({ error: 'Usuário já está no grupo' });

        await execute('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)',
            [req.params.id, user.id]);

        res.json(user);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao adicionar membro' });
    }
});

// --- Expenses Routes ---
app.get('/api/groups/:id/expenses', requireAuth, async (req, res) => {
    try {
        const isMember = await queryOne('SELECT 1 as ok FROM group_members WHERE group_id = ? AND user_id = ?',
            [req.params.id, req.userId]);
        if (!isMember) return res.status(403).json({ error: 'Acesso negado' });

        const expenses = await queryAll(`
      SELECT e.*, u.username as paid_by_name, u.avatar_color as paid_by_color
      FROM expenses e
      JOIN users u ON u.id = e.paid_by
      WHERE e.group_id = ?
      ORDER BY e.date DESC, e.created_at DESC
    `, [req.params.id]);

        for (const expense of expenses) {
            expense.splits = await queryAll(`
        SELECT es.*, u.username
        FROM expense_splits es
        JOIN users u ON u.id = es.user_id
        WHERE es.expense_id = ?
      `, [expense.id]);
        }

        res.json(expenses);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao buscar despesas' });
    }
});

app.post('/api/groups/:id/expenses', requireAuth, async (req, res) => {
    try {
        const { description, amount, date, splits } = req.body;
        if (!description || !amount) {
            return res.status(400).json({ error: 'Descrição e valor são obrigatórios' });
        }

        const isMember = await queryOne('SELECT 1 as ok FROM group_members WHERE group_id = ? AND user_id = ?',
            [req.params.id, req.userId]);
        if (!isMember) return res.status(403).json({ error: 'Acesso negado' });

        const expenseId = uuidv4();
        const expenseDate = date || new Date().toISOString().split('T')[0];

        await execute('INSERT INTO expenses (id, group_id, paid_by, description, amount, date) VALUES (?, ?, ?, ?, ?, ?)',
            [expenseId, req.params.id, req.userId, description, amount, expenseDate]);

        if (splits && splits.length > 0) {
            for (const split of splits) {
                await execute('INSERT INTO expense_splits (id, expense_id, user_id, amount) VALUES (?, ?, ?, ?)',
                    [uuidv4(), expenseId, split.user_id, split.amount]);
            }
        } else {
            const members = await queryAll('SELECT user_id FROM group_members WHERE group_id = ?', [req.params.id]);
            const splitAmount = Math.round((amount / members.length) * 100) / 100;
            for (const member of members) {
                await execute('INSERT INTO expense_splits (id, expense_id, user_id, amount) VALUES (?, ?, ?, ?)',
                    [uuidv4(), expenseId, member.user_id, splitAmount]);
            }
        }

        res.json({ id: expenseId, description, amount, date: expenseDate });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao criar despesa' });
    }
});

app.delete('/api/expenses/:id', requireAuth, async (req, res) => {
    try {
        const expense = await queryOne('SELECT * FROM expenses WHERE id = ?', [req.params.id]);
        if (!expense) return res.status(404).json({ error: 'Despesa não encontrada' });

        await execute('DELETE FROM expense_splits WHERE expense_id = ?', [req.params.id]);
        await execute('DELETE FROM expenses WHERE id = ?', [req.params.id]);

        res.json({ ok: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao excluir despesa' });
    }
});

// --- Balances Route ---
app.get('/api/groups/:id/balances', requireAuth, async (req, res) => {
    try {
        const isMember = await queryOne('SELECT 1 as ok FROM group_members WHERE group_id = ? AND user_id = ?',
            [req.params.id, req.userId]);
        if (!isMember) return res.status(403).json({ error: 'Acesso negado' });

        const members = await queryAll(`
      SELECT u.id, u.username, u.avatar_color
      FROM users u
      JOIN group_members gm ON gm.user_id = u.id
      WHERE gm.group_id = ?
    `, [req.params.id]);

        const balances = {};
        for (const m of members) { balances[m.id] = { ...m, balance: 0 }; }

        const payments = await queryAll('SELECT paid_by, SUM(amount) as total FROM expenses WHERE group_id = ? GROUP BY paid_by', [req.params.id]);
        for (const p of payments) { if (balances[p.paid_by]) balances[p.paid_by].balance += p.total; }

        const splits = await queryAll(`SELECT es.user_id, SUM(es.amount) as total FROM expense_splits es JOIN expenses e ON e.id = es.expense_id WHERE e.group_id = ? GROUP BY es.user_id`, [req.params.id]);
        for (const s of splits) { if (balances[s.user_id]) balances[s.user_id].balance -= s.total; }

        const settlementsFrom = await queryAll('SELECT from_user, SUM(amount) as total FROM settlements WHERE group_id = ? GROUP BY from_user', [req.params.id]);
        for (const s of settlementsFrom) { if (balances[s.from_user]) balances[s.from_user].balance += s.total; }

        const settlementsTo = await queryAll('SELECT to_user, SUM(amount) as total FROM settlements WHERE group_id = ? GROUP BY to_user', [req.params.id]);
        for (const s of settlementsTo) { if (balances[s.to_user]) balances[s.to_user].balance -= s.total; }

        const memberBalances = Object.values(balances);
        const debtors = memberBalances.filter(m => m.balance < -0.01).map(m => ({ ...m }));
        const creditors = memberBalances.filter(m => m.balance > 0.01).map(m => ({ ...m }));
        debtors.sort((a, b) => a.balance - b.balance);
        creditors.sort((a, b) => b.balance - a.balance);

        const debts = [];
        let i = 0, j = 0;
        while (i < debtors.length && j < creditors.length) {
            const amount = Math.min(-debtors[i].balance, creditors[j].balance);
            if (amount > 0.01) {
                debts.push({
                    from: { id: debtors[i].id, username: debtors[i].username, avatar_color: debtors[i].avatar_color },
                    to: { id: creditors[j].id, username: creditors[j].username, avatar_color: creditors[j].avatar_color },
                    amount: Math.round(amount * 100) / 100
                });
            }
            debtors[i].balance += amount;
            creditors[j].balance -= amount;
            if (Math.abs(debtors[i].balance) < 0.01) i++;
            if (Math.abs(creditors[j].balance) < 0.01) j++;
        }

        res.json({ balances: memberBalances.map(m => ({ ...m, balance: Math.round(m.balance * 100) / 100 })), debts });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao calcular saldos' });
    }
});

// --- Settle Route ---
app.post('/api/groups/:id/settle', requireAuth, async (req, res) => {
    try {
        const { to_user, amount } = req.body;
        if (!to_user || !amount) return res.status(400).json({ error: 'Destinatário e valor são obrigatórios' });

        const id = uuidv4();
        const date = new Date().toISOString().split('T')[0];

        await execute('INSERT INTO settlements (id, group_id, from_user, to_user, amount, date) VALUES (?, ?, ?, ?, ?, ?)',
            [id, req.params.id, req.userId, to_user, amount, date]);

        res.json({ id, amount, date });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao registrar acerto' });
    }
});

app.get('/api/groups/:id/settlements', requireAuth, async (req, res) => {
    try {
        const settlements = await queryAll(`
      SELECT s.*, uf.username as from_username, uf.avatar_color as from_color, ut.username as to_username, ut.avatar_color as to_color
      FROM settlements s
      JOIN users uf ON uf.id = s.from_user
      JOIN users ut ON ut.id = s.to_user
      WHERE s.group_id = ?
      ORDER BY s.date DESC, s.created_at DESC
    `, [req.params.id]);
        res.json(settlements);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao buscar acertos' });
    }
});

app.get('/api/users/search', requireAuth, async (req, res) => {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json([]);
    const users = await queryAll('SELECT id, username, avatar_color FROM users WHERE username LIKE ? AND id != ? LIMIT 10',
        [`%${q.toLowerCase()}%`, req.userId]);
    res.json(users);
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

module.exports = app;

if (require.main === module) {
    initDB().then(() => {
        app.listen(PORT, () => {
            console.log(`🚀 SplitEasy rodando em http://localhost:${PORT}`);
        });
    }).catch(err => {
        console.error('Erro ao inicializar banco:', err);
        process.exit(1);
    });
}
