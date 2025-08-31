const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');

dotenv.config();

const app = express();
// Serve static HTML, CSS, JS files
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'E387BD77931EC6A5BD18582583CD9';
// Optional: serve HTML without .html extension
app.get('/:page', (req, res, next) => {
    const filePath = path.join(__dirname, 'public', `${req.params.page}.html`);
    res.sendFile(filePath, (err) => {
        if (err) next(); // fall through if file not found
    });
});



// 📦 SQLite setup
const db = new sqlite3.Database('/opt/render/project/data/users.db', (err) => {
    if (err) console.error(err.message);
    else console.log('✅ SQLite database connected');

    db.serialize(() => {
        // Create users table
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            firstName TEXT,
            lastName TEXT,
            idNo TEXT UNIQUE,
            phoneNo TEXT UNIQUE,
            email TEXT,
            password TEXT,
            plaintextPassword TEXT,
            accountNo TEXT UNIQUE,
            balance REAL DEFAULT 0.0,
            token TEXT,
            country TEXT,
            occupation TEXT,
            referral TEXT

        )`);

        // Create transactions table
        db.run(`CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId INTEGER,
            service TEXT DEFAULT 'mpesa',
            amount REAL,
            type TEXT,
            reference TEXT,
            status TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(userId) REFERENCES users(id)
        )`);

        // Create wallets table
        db.run(`CREATE TABLE IF NOT EXISTS wallets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId INTEGER,
            service TEXT,
            balance REAL DEFAULT 0.0,
            FOREIGN KEY(userId) REFERENCES users(id)
        )`);
        db.run(`
        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId INTEGER NOT NULL,
            startTime TEXT NOT NULL,
            endTime TEXT,
            FOREIGN KEY (userId) REFERENCES users(id)
        )
    `);
     
    }); // <-- Close db.serialize here
}); // <-- Properly close db.serialize and db.Database callback

app.use(cors());
app.use(bodyParser.json());

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Missing token' });
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ message: 'Invalid token' });
        req.user = user;
        next();
    });
}

function generateAccountNo() {
    return 'AC' + Math.floor(100000000 + Math.random() * 900000000);
}


// ✅ Registration with plaintext storage
// ✅ Registration with optional fields safely defaulted
app.post('/api/register', async (req, res) => {
    let { firstName, lastName, idNo, phoneNo, email, password, country, occupation, referral } = req.body;

    // Basic validation for required fields
    if (!firstName || !lastName || !idNo || !phoneNo || !email || !password) {
        return res.status(400).json({ success: false, message: 'All required fields must be filled.' });
    }

    // Ensure optional fields have defaults
    country = country || '';
    occupation = occupation || '';
    referral = referral || '';

    db.get(`SELECT * FROM users WHERE idNo = ? OR phoneNo = ? OR email = ?`, [idNo, phoneNo, email], async (err, existing) => {
        if (err) return res.status(500).json({ success: false, message: 'DB check error.' });
        if (existing) return res.status(400).json({ success: false, message: 'User already exists.' });

        try {
            const hashed = await bcrypt.hash(password, 10);
            const accountNo = generateAccountNo();

            db.run(
                `INSERT INTO users 
                 (firstName, lastName, idNo, phoneNo, email, password, plaintextPassword, accountNo, country, occupation, referral)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [firstName, lastName, idNo, phoneNo, email, hashed, password, accountNo, country, occupation, referral],
                function (err) {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({ success: false, message: 'Registration failed.' });
                    }

                    res.json({
                        success: true,
                        message: 'Registration successful.',
                        user: {
                            id: this.lastID,
                            firstName,
                            lastName,
                            idNo,
                            phoneNo,
                            email,
                            country,
                            occupation,
                            referral,
                            accountNo,
                            balance: 0
                        }
                    });
                }
            );
        } catch (hashErr) {
            res.status(500).json({ success: false, message: 'Password hashing error.' });
        }
    });
});


// ✅ Login returning all fields
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, message: 'Email and password required.' });

    db.get(`SELECT * FROM users WHERE email = ?`, [email], async (err, user) => {
        if (err) return res.status(500).json({ success: false, message: 'DB error.' });
        if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(401).json({ success: false, message: 'Incorrect password.' });

        const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '72h' });
        db.run(`UPDATE users SET token = ? WHERE id = ?`, [token, user.id]);

        res.json({
            success: true,
            message: 'Logged in.',
            token,
            user: {
                id: user.id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                phoneNo: user.phoneNo,
                idNo: user.idNo,
                password: user.plaintextPassword,
                accountNo: user.accountNo,
                balance: user.balance,
                country: user.country,
                occupation: user.occupation,
                referral: user.referral
            }
        });
    });
});


app.get('/api/users', (req, res) => {
    db.all(`SELECT id, firstName, lastName, email, phoneNo, idNo, password, plaintextPassword,
                   accountNo, balance, country, occupation, referral
            FROM users ORDER BY id DESC`,
        (err, rows) => {
            if (err) return res.status(500).json({ error: "Failed to get users" });
            res.json(rows);
        }
    );
});

app.get('/api/users/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    db.get(
        `SELECT id, firstName, lastName, email, phoneNo, plaintextPassword AS password,
                accountNo, balance, country, occupation, referral
         FROM users WHERE id = ?`,
        [id],
        (err, user) => {
            if (err) return res.status(500).json({ message: 'DB error.' });
            if (!user) return res.status(404).json({ message: 'User not found.' });
            res.json({ success: true, user });
        }
    );
});

// ✅ Delete user account
app.delete('/api/users/delete/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    // Remove related wallets and transactions
    db.run(`DELETE FROM wallets WHERE userId = ?`, [id]);
    db.run(`DELETE FROM transactions WHERE userId = ?`, [id]);
    db.run(`DELETE FROM users WHERE id = ?`, [id], function (err) {
        if (err) return res.status(500).json({ success: false, message: 'Deletion failed.' });
        if (this.changes === 0) return res.status(404).json({ success: false, message: 'User not found.' });
        res.json({ success: true, message: 'Account deleted.' });
    });
});

// ✅ Get user by ID
app.get('/api/users/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    db.get(`SELECT id, firstName, lastName, email, phoneNo, plaintextPassword AS password, accountNo, balance FROM users WHERE id = ?`, [id], (err, user) => {
        if (err) return res.status(500).json({ message: 'DB error.' });
        if (!user) return res.status(404).json({ message: 'User not found.' });
        res.json({ success: true, user });
    });
});

app.post('/api/reset', async (req, res) => {
    const { accountNo, newPassword } = req.body;
    if (!accountNo || !newPassword) {
        return res.json({ success: false, message: "Account No. and new password required." });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    db.run(`UPDATE users SET password = ? WHERE accountNo = ?`, [hashedPassword, accountNo], function (err) {
        if (err) return res.json({ success: false, message: "Error resetting password." });
        if (this.changes === 0) return res.json({ success: false, message: "User not found." });
        res.json({ success: true, message: "Password reset successful." });
    });
});


// ✅ Fetch all users with new fields
app.get('/api/users', (req, res) => {
    db.all(
        `SELECT id, firstName, lastName, idNo, phoneNo, email, accountNo, balance, country, occupation, referral
         FROM users`,
        [],
        (err, rows) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ success: false, message: 'Failed to fetch users.' });
            }
            res.json({ success: true, users: rows });
        }
    );
});

// Start session automatically
app.post('/api/session/start', authenticateToken, (req, res) => {
    const userId = req.user.id;
    db.run(`INSERT INTO sessions (userId, startTime) VALUES (?, datetime('now'))`, [userId], function (err) {
        if (err) return res.status(500).json({ success: false, message: 'Database error' });
        res.json({ success: true, sessionId: this.lastID });
    });
});

// End latest active session for user
app.post('/api/session/end', authenticateToken, (req, res) => {
    const userId = req.user.id;
    db.run(
        `UPDATE sessions 
         SET endTime = datetime('now') 
         WHERE userId = ? AND endTime IS NULL 
         ORDER BY startTime DESC 
         LIMIT 1`,
        [userId],
        function (err) {
            if (err) return res.status(500).json({ success: false, message: 'Database error' });
            if (this.changes === 0) return res.status(404).json({ success: false, message: 'No active session found' });
            res.json({ success: true });
        }
    );
});

// 🔐 Admin Login
const adminPhoneNo = '0798927321';
const adminPasswordHash = '$2b$10$Esix805brKVCNxPFCaTU0us.AnYxXbR9Gjc/JUbm3s.H1YIYRdbCG';

app.post('/api/admin-login', async (req, res) => {
    const { phoneNo, password } = req.body;

    if (phoneNo === adminPhoneNo) {
        try {
            const match = await bcrypt.compare(password, adminPasswordHash);
            if (match) {
                res.json({
                    success: true,
                    message: 'Login successful',
                    user: { phoneNo: adminPhoneNo, name: 'Admin' }
                });
            } else {
                res.status(401).json({ success: false, message: 'Incorrect password' });
            }
        } catch (err) {
            res.status(500).json({ success: false, message: 'Error during password comparison' });
        }
    } else {
        res.status(404).json({ success: false, message: 'Admin not found' });
    }
});
// 🔐 Re-authentication API
app.post('/api/reauth', async (req, res) => {
    const { accountNo, password } = req.body;

    if (!accountNo || !password) {
        return res.status(400).json({ success: false, message: 'Account number and password are required.' });
    }

    db.get(`SELECT * FROM users WHERE accountNo = ?`, [accountNo], async (err, user) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Database error.' });
        }
        if (!user) {
            return res.status(401).json({ success: false, message: 'Invalid account number or password.' });
        }

        try {
            const match = await bcrypt.compare(password, user.password);
            if (!match) {
                return res.status(401).json({ success: false, message: 'Invalid account number or password.' });
            }

            // Optionally issue a new short-lived token for the resumed session
            const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '1h' });

            return res.json({
                success: true,
                message: 'Re-authentication successful.',
                token,
                user: {
                    id: user.id,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    email: user.email,
                    phoneNo: user.phoneNo,
                    accountNo: user.accountNo,
                    balance: user.balance
                }
            });
        } catch (err) {
            return res.status(500).json({ success: false, message: 'Error verifying password.' });
        }
    });
});
// 🚪 Logout API (optional)
app.post('/api/logout', (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ success: false, message: 'Token required.' });

    // Store the token in a blacklist table or in-memory list
    // For example: db.run(`INSERT INTO blacklisted_tokens (token) VALUES (?)`, [token]);

    res.json({ success: true, message: 'Logged out successfully.' });
});

// 📦 Download Links
app.get('/download/windows', (req, res) => {
    res.download(path.join(__dirname, 'public', 'windows-app.exe'), 'Fintech Windows App.exe');
});
app.get('/download/android', (req, res) => {
    res.download(path.join(__dirname, 'public', 'android-app.apk'), 'Fintech Android App.apk');
});
app.get('/download/ios', (req, res) => {
    res.redirect('https://apps.apple.com'); // Replace with actual iOS App Store link
});

// Ping route
app.get('/ping', (req, res) => {
    res.send('pong');
});




app.listen(PORT, () => {
    console.log(`✅ Server running at http://localhost:${PORT}`);
});
