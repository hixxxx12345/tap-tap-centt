//**
 * ==============================================================================
 * প্রজেক্ট: ট্যাপ ট্যাপ সেন্ট (Tap Tap Cent)
 * বর্ণনা: টেলিগ্রাম মিনি অ্যাপ, বট, ডাটাবেস ও ব্যাকএন্ড সিস্টেম (Adsterra Integrated)
 * ==============================================================================
 */

const express = require('express');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');

// ==============================================================================
// ১. কনফিগারেশন ও এনভায়রনমেন্ট
// ==============================================================================
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = '9214134541:AAHJ3vJnGmg86mnOkniLTYQHb8BcQ0cGQgk';
const WEBAPP_URL = process.env.WEBAPP_URL || 'https://tap-tap-centt-1.onrender.com';
const ADSTERRA_LINK = 'https://asiafilm.org/4/4fffdc18fd05373692015ae01448a86d';

const app = express();
app.use(express.json());

// ==============================================================================
// ২. ইন-মেমোরি ডাটাবেস
// ==============================================================================
const db = {
    users: {},
    tasks: [
        { id: '1', title: 'টেলিগ্রাম চ্যানেলে জয়েন করুন', reward: 500, url: 'https://t.me/example', active: true },
        { id: '2', title: 'বিশেষ অফার ও বোনাস দেখুন (Adsterra)', reward: 400, url: ADSTERRA_LINK, active: true }
    ],
    taskCompletions: {},
    withdrawals: [],
    settings: {
        maxEnergy: 1000,
        energyRegenRate: 1,
        referralReward: 1000,
        refereeReward: 500,
        minWithdrawal: 5000
    }
};

// ==============================================================================
// ৩. টেলিগ্রাম বট ইন্টিগ্রেশন (Telegram Bot)
// ==============================================================================
let bot;
try {
    bot = new TelegramBot(BOT_TOKEN, { polling: { interval: 2000, autoStart: true, params: { timeout: 10 } } });

    bot.onText(/\/start(?:\s+(.+))?/, (msg, match) => {
        const chatId = msg.chat.id;
        const referrerId = match[1];
        const firstName = msg.from.first_name || 'ট্যাপার';

        if (!db.users[chatId]) {
            db.users[chatId] = {
                id: chatId,
                username: msg.from.username || '',
                firstName: firstName,
                balance: 0,
                energy: db.settings.maxEnergy,
                lastEnergyUpdate: Date.now(),
                streak: 1,
                referredBy: referrerId || null,
                referralCount: 0,
                referralEarnings: 0
            };

            if (referrerId && db.users[referrerId] && referrerId !== String(chatId)) {
                db.users[referrerId].balance += db.settings.referralReward;
                db.users[referrerId].referralCount += 1;
                db.users[referrerId].referralEarnings += db.settings.referralReward;
                db.users[chatId].balance += db.settings.refereeReward;
            }
        }

        const welcomeText = `স্বাগতম **ট্যাপ ট্যাপ সেন্ট (Tap Tap Cent)**-এ! 🚀\n\nনিচের বোতামে ক্লিক করে গেম খেলা শুরু করুন, টাস্ক পূরণ করুন এবং কয়েন সংগ্রহ করুন!`;
        
        bot.sendMessage(chatId, welcomeText, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🚀 চালু করুন (Open Mini App)', web_app: { url: WEBAPP_URL } }],
                    [{ text: '📢 চ্যানেল', url: 'https://t.me/example' }, { text: '💬 সাপোর্ট', url: 'https://t.me/example' }]
                ]
            }
        });
    });
} catch (e) {
    console.log("বট চালু করতে সমস্যা হয়েছে।");
}

// ==============================================================================
// ৪. ব্যাকএন্ড এপিআই রুটস
// ==============================================================================
app.get('/api/user/:id', (req, res) => {
    const userId = req.params.id;
    let user = db.users[userId];
    if (!user) {
        user = { id: userId, firstName: 'ট্যাপার', balance: 1000, energy: 1000, lastEnergyUpdate: Date.now(), streak: 1, referralCount: 0, referralEarnings: 0 };
        db.users[userId] = user;
    }

    const now = Date.now();
    const elapsedSeconds = Math.floor((now - user.lastEnergyUpdate) / 1000);
    const recoveredEnergy = Math.floor(elapsedSeconds / 2) * db.settings.energyRegenRate;
    user.energy = Math.min(db.settings.maxEnergy, user.energy + recoveredEnergy);
    user.lastEnergyUpdate = now;

    res.json({ success: true, user, settings: db.settings });
});

app.post('/api/tap', (req, res) => {
    const { userId, count } = req.body;
    const user = db.users[userId];
    if (!user) return res.status(404).json({ success: false, message: 'ইউজার পাওয়া যায়নি' });

    const now = Date.now();
    const elapsedSeconds = Math.floor((now - user.lastEnergyUpdate) / 1000);
    const recoveredEnergy = Math.floor(elapsedSeconds / 2) * db.settings.energyRegenRate;
    user.energy = Math.min(db.settings.maxEnergy, user.energy + recoveredEnergy);

    const tapAmount = Math.min(count || 1, 10);
    if (user.energy >= tapAmount) {
        user.energy -= tapAmount;
        user.balance += tapAmount;
        user.lastEnergyUpdate = now;
        return res.json({ success: true, balance: user.balance, energy: user.energy });
    } else {
        return res.status(400).json({ success: false, message: 'পর্যাপ্ত শক্তি নেই!' });
    }
});

app.get('/api/tasks/:userId', (req, res) => {
    const userId = req.params.userId;
    const tasksWithStatus = db.tasks.map(t => ({
        ...t,
        completed: !!db.taskCompletions[`${userId}_${t.id}`]
    }));
    res.json({ success: true, tasks: tasksWithStatus });
});

app.post('/api/tasks/verify', (req, res) => {
    const { userId, taskId } = req.body;
    const key = `${userId}_${taskId}`;
    if (db.taskCompletions[key]) {
        return res.status(400).json({ success: false, message: 'টাস্কটি আগেই সম্পন্ন করা হয়েছে!' });
    }
    const task = db.tasks.find(t => t.id === taskId);
    if (!task) return res.status(404).json({ success: false, message: 'টাস্ক পাওয়া যায়নি' });

    db.taskCompletions[key] = true;
    if (db.users[userId]) {
        db.users[userId].balance += task.reward;
    }
    res.json({ success: true, reward: task.reward, newBalance: db.users[userId] ? db.users[userId].balance : 0 });
});

app.get('/api/leaderboard', (req, res) => {
    const leaderboard = Object.values(db.users)
        .sort((a, b) => b.balance - a.balance)
        .slice(0, 50);
    res.json({ success: true, leaderboard });
});

app.post('/api/withdraw', (req, res) => {
    const { userId, amount, method, address } = req.body;
    const user = db.users[userId];
    if (!user) return res.status(404).json({ success: false, message: 'ইউজার পাওয়া যায়নি' });
    if (amount < db.settings.minWithdrawal) return res.status(400).json({ success: false, message: `সর্বনিম্ন উইথড্র ${db.settings.minWithdrawal} সেন্ট` });
    if (user.balance < amount) return res.status(400).json({ success: false, message: 'পর্যাপ্ত ব্যালেন্স নেই!' });

    user.balance -= amount;
    const request = {
        id: Date.now().toString(),
        userId,
        username: user.firstName,
        amount,
        method,
        address,
        status: 'Pending',
        date: new Date().toLocaleString('bn-BD')
    };
    db.withdrawals.push(request);
    res.json({ success: true, message: 'উইথড্র রিকোয়েস্ট সফলভাবে জমা হয়েছে!' });
});

// ==============================================================================
// ৫. ফ্রন্টএন্ড UI (HTML + CSS + JS) যেখানে অ্যাডসটারার লিংক যুক্ত করা হয়েছে
// ==============================================================================
app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="bn">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ট্যাপ ট্যাপ সেন্ট - Tap Tap Cent</title>
    <script src="https://telegram.org/js/telegram-web-app.js"></script>
    <style>
        :root { --bg-color: #07090e; --card-bg: rgba(18, 24, 38, 0.75); --accent-color: #2563eb; --accent-glow: rgba(59, 130, 246, 0.4); --text-color: #ffffff; --text-secondary: #94a3b8; }
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', system-ui, sans-serif; user-select: none; }
        body { background: linear-gradient(135deg, #05070c 0%, #0d1322 50%, #17153a 100%); color: var(--text-color); min-height: 100vh; display: flex; flex-direction: column; overflow-x: hidden; }
        .container { max-width: 480px; width: 100%; margin: 0 auto; padding: 20px; flex: 1; padding-bottom: 90px; }
        .tab-content { display: none; }
        .tab-content.active { display: block; }
        .header { display: flex; justify-content: space-between; align-items: center; background: var(--card-bg); backdrop-filter: blur(10px); padding: 12px 20px; border-radius: 16px; border: 1px solid rgba(255, 255, 255, 0.08); margin-bottom: 20px; }
        .user-info h3 { font-size: 16px; }
        .user-info span { font-size: 12px; color: #60a5fa; background: rgba(59, 130, 246, 0.15); padding: 2px 8px; border-radius: 8px; }
        .balance-card { text-align: center; margin-bottom: 25px; }
        .balance-title { font-size: 14px; color: var(--text-secondary); margin-bottom: 5px; }
        .balance-amount { font-size: 38px; font-weight: 800; background: linear-gradient(to right, #60a5fa, #a78bfa); -webkit-background-clip: text; -webkit-text-fill-color: transparent; text-shadow: 0 0 20px var(--accent-glow); }
        .tap-container { position: relative; margin: 25px 0; display: flex; justify-content: center; align-items: center; }
        .tap-button { width: 210px; height: 210px; border-radius: 50%; background: radial-gradient(circle, #2563eb 0%, #1d4ed8 70%, #0f172a 100%); border: 4px solid rgba(96, 165, 250, 0.4); box-shadow: 0 0 40px var(--accent-glow), inset 0 0 20px rgba(255,255,255,0.2); cursor: pointer; display: flex; flex-direction: column; justify-content: center; align-items: center; transition: transform 0.05s ease; outline: none; }
        .tap-button:active { transform: scale(0.94); }
        .tap-logo { font-size: 36px; font-weight: 900; color: #fff; letter-spacing: 2px; }
        .tap-sub { font-size: 12px; color: #93c5fd; margin-top: 4px; }
        .energy-section { background: var(--card-bg); padding: 15px 20px; border-radius: 16px; border: 1px solid rgba(255, 255, 255, 0.08); }
        .energy-info { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 8px; color: var(--text-secondary); }
        .energy-bar-bg { width: 100%; height: 10px; background: rgba(255, 255, 255, 0.1); border-radius: 5px; overflow: hidden; }
        .energy-bar-fill { width: 100%; height: 100%; background: linear-gradient(90deg, #3b82f6, #60a5fa); border-radius: 5px; transition: width 0.2s ease; }
        .floating-num { position: absolute; color: #60a5fa; font-weight: bold; font-size: 24px; animation: floatUp 0.7s ease-out forwards; pointer-events: none; }
        @keyframes floatUp { 0% { opacity: 1; transform: translateY(0); } 100% { opacity: 0; transform: translateY(-70px); } }
        .card { background: var(--card-bg); padding: 16px; border-radius: 16px; border: 1px solid rgba(255, 255, 255, 0.08); margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; }
        .btn { background: #2563eb; color: #fff; border: none; padding: 8px 16px; border-radius: 10px; font-weight: 600; cursor: pointer; }
        .btn:disabled { background: #334155; color: #94a3b8; }
        input, select { width: 100%; padding: 12px; margin-top: 8px; margin-bottom: 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.1); background: #0f172a; color: #fff; }
        .nav-bar { position: fixed; bottom: 0; left: 50%; transform: translateX(-50%); width: 100%; max-width: 480px; background: rgba(7, 9, 14, 0.92); backdrop-filter: blur(15px); border-top: 1px solid rgba(255, 255, 255, 0.08); display: flex; justify-content: space-around; padding: 10px 0; z-index: 100; }
        .nav-item { background: none; border: none; color: var(--text-secondary); font-size: 11px; display: flex; flex-direction: column; align-items: center; cursor: pointer; }
        .nav-item.active { color: #60a5fa; }
        .nav-item span { font-size: 18px; margin-bottom: 3px; }
        .ad-banner { background: linear-gradient(135deg, #1e293b, #0f172a); border: 1px solid #3b82f6; padding: 12px; border-radius: 14px; text-align: center; margin-bottom: 15px; }
    </style>
</head>
<body>
    <div class="container">
        <!-- অ্যাডসটারার ব্যানার প্রমোশন -->
        <div class="ad-banner">
            <p style="font-size: 13px; color: #93c5fd; margin-bottom: 6px;">✨ বিশেষ স্পন্সর অফার</p>
            <a href="${ADSTERRA_LINK}" target="_blank" style="color: #60a5fa; font-weight: bold; text-decoration: none; font-size: 14px;">👉 ভিজিট করুন এবং বোনাস নিন</a>
        </div>

        <!-- ১. হোম স্ক্রিন -->
        <div id="tab-home" class="tab-content active">
            <div class="header">
                <div class="user-info">
                    <h3 id="username">ট্যাপার</h3>
                    <span>লেভেল ১</span>
                </div>
                <div style="font-size: 13px; color: #60a5fa;">🔥 স্ট্রিক: ১ দিন</div>
            </div>
            <div class="balance-card">
                <div class="balance-title">ট্যাপ ট্যাপ সেন্ট ব্যালেন্স</div>
                <div class="balance-amount" id="balance">0</div>
            </div>
            <div class="tap-container" id="tapContainer">
                <button class="tap-button" id="tapBtn">
                    <div class="tap-logo">TTC</div>
                    <div class="tap-sub">TAP TAP CENT</div>
                </button>
            </div>
            <div class="energy-section">
                <div class="energy-info">
                    <span>⚡ শক্তি (Energy)</span>
                    <span id="energyText">1000 / 1000</span>
                </div>
                <div class="energy-bar-bg">
                    <div class="energy-bar-fill" id="energyFill"></div>
                </div>
            </div>
        </div>

        <!-- ২. আয় / টাস্ক স্ক্রিন -->
        <div id="tab-earn" class="tab-content">
            <h2 style="margin-bottom: 15px;">টাস্ক পূরণ করে আয় করুন</h2>
            <div id="taskList">লোড হচ্ছে...</div>
        </div>

        <!-- ৩. ফ্রেন্ডস স্ক্রিন -->
        <div id="tab-friends" class="tab-content">
            <h2 style="margin-bottom: 10px;">বন্ধুদের ইনভাইট করুন</h2>
            <p style="color: var(--text-secondary); margin-bottom: 20px;">প্রতিটি ইনভাইটে পাবেন ১,০০০ সেন্ট!</p>
            <div class="card" style="flex-direction: column; align-items: flex-start;">
                <div>আপনার ইনভাইট লিংক:</div>
                <input type="text" id="refLink" readonly>
                <button class="btn" style="width: 100%;" onclick="copyRefLink()">লিংক কপি করুন</button>
            </div>
        </div>

        <!-- ৪. ওয়ালেট / উইথড্র স্ক্রিন -->
        <div id="tab-wallet" class="tab-content">
            <h2 style="margin-bottom: 15px;">উইথড্র করুন</h2>
            <div class="card" style="flex-direction: column; align-items: flex-start;">
                <label>পেমেন্ট মেথড select করুন:</label>
                <select id="withdrawMethod">
                    <option value="Bkash">বিকাশ (bKash)</option>
                    <option value="Nagad">নগদ (Nagad)</option>
                    <option value="Binance">Binance Pay (USDT)</option>
                </select>
                <label>পরিমাণ (সেন্ট):</label>
                <input type="number" id="withdrawAmount" placeholder="সর্বনিম্ন ৫০০০">
                <label>একাউন্ট / ওয়ালেট নাম্বার:</label>
                <input type="text" id="withdrawAddress" placeholder="017xxxxxxxx">
                <button class="btn" style="width: 100%;" onclick="submitWithdrawal()">উইথড্র রিকোয়েস্ট পাঠান</button>
            </div>
        </div>
    </div>

    <!-- বটম নেভিগেশন -->
    <div class="nav-bar">
        <button class="nav-item active" onclick="switchTab('home', this)"><span>🏠</span>হোম</button>
        <button class="nav-item" onclick="switchTab('earn', this)"><span>💰</span>আয়</button>
        <button class="nav-item" onclick="switchTab('friends', this)"><span>👥</span>বন্ধুরা</button>
        <button class="nav-item" onclick="switchTab('wallet', this)"><span>💳</span>ওয়ালেট</button>
    </div>

    <script>
        let tg = window.Telegram ? window.Telegram.WebApp : null;
        if(tg) tg.expand();
        let userId = (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) ? tg.initDataUnsafe.user.id : "123456789";
        let userName = (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) ? tg.initDataUnsafe.user.first_name : "ট্যাপার";
        document.getElementById('username').innerText = userName;
        document.getElementById('refLink').value = 'https://t.me/CentTapTapMining_bot?start=' + userId;

        let balance = 0;
        let energy = 1000;
        let maxEnergy = 1000;
        let tapQueue = 0;

        async function loadUserData() {
            try {
                let res = await fetch('/api/user/' + userId);
                let data = await res.json();
                if(data.success) {
                    balance = data.user.balance;
                    energy = data.user.energy;
                    maxEnergy = data.settings.maxEnergy;
                    updateUI();
                }
            } catch(e) { console.log('ডাটা লোড সমস্যা'); }
        }

        function updateUI() {
            document.getElementById('balance').innerText = balance.toLocaleString();
            document.getElementById('energyText').innerText = energy + ' / ' + maxEnergy;
            document.getElementById('energyFill').style.width = (energy / maxEnergy) * 100 + '%';
        }

        document.getElementById('tapBtn').addEventListener('click', function(e) {
            if (energy > 0) {
                balance += 1;
                energy -= 1;
                tapQueue += 1;
                updateUI();
                if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');

                const rect = this.getBoundingClientRect();
                const floatEl = document.createElement('div');
                floatEl.className = 'floating-num';
                floatEl.innerText = '+1';
                floatEl.style.left = (e.clientX - rect.left - 15) + 'px';
                floatEl.style.top = (e.clientY - rect.top - 15) + 'px';
                document.getElementById('tapContainer').appendChild(floatEl);
                setTimeout(() => floatEl.remove(), 700);
            }
        });

        setInterval(async () => {
            if (tapQueue > 0) {
                let count = tapQueue;
                tapQueue = 0;
                await fetch('/api/tap', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId, count })
                });
            }
        }, 2000);

        setInterval(() => {
            if (energy < maxEnergy) {
                energy = Math.min(maxEnergy, energy + 1);
                updateUI();
            }
        }, 2000);

        function switchTab(tab, btn) {
            document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
            document.getElementById('tab-' + tab).classList.add('active');
            btn.classList.add('active');
            if(tab === 'earn') loadTasks();
        }

        async function loadTasks() {
            let res = await fetch('/api/tasks/' + userId);
            let data = await res.json();
            let html = '';
            data.tasks.forEach(task => {
                html += \`
                    <div class="card">
                        <div>
                            \${task.title}<br>
                            <span style="color: #60a5fa; font-size: 12px;">+\${task.reward} সেন্ট</span>
                        </div>
                        <button class="btn" \${task.completed ? 'disabled' : ''} onclick="doTask('\${task.id}', '\${task.url}')">
                            \${task.completed ? 'সম্পন্ন' : 'সম্পূর্ণ করুন'}
                        </button>
                    </div>
                \`;
            });
            document.getElementById('taskList').innerHTML = html;
        }

        async function doTask(taskId, url) {
            window.open(url, '_blank');
            setTimeout(async () => {
                let res = await fetch('/api/tasks/verify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId, taskId })
                });
                let data = await res.json();
                if(data.success) {
                    alert('টাস্ক সফল! +' + data.reward + ' সেন্ট পেয়েছেন');
                    loadUserData();
                    loadTasks();
                } else {
                    alert(data.message);
                }
            }, 3000);
        }

        function copyRefLink() {
            let copyText = document.getElementById("refLink");
            copyText.select();
            document.execCommand("copy");
            alert("ইনভাইট লিংক কপি হয়েছে!");
        }

        async function submitWithdrawal() {
            let method = document.getElementById('withdrawMethod').value;
            let amount = parseInt(document.getElementById('withdrawAmount').value);
            let address = document.getElementById('withdrawAddress').value;
            if(!amount || !address) return alert('সকল তথ্য সঠিকভাবে দিন!');

            let res = await fetch('/api/withdraw', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, amount, method, address })
            });
            let data = await res.json();
            alert(data.message);
            if(data.success) loadUserData();
        }

        loadUserData();
    </script>
</body>
</html>
    `);
});

// ==============================================================================
// ৬. সার্ভার স্টার্ট
// ==============================================================================
app.listen(PORT, () => {
    console.log('================================================');
    console.log('🚀 ট্যাপ ট্যাপ সেন্ট (Tap Tap Cent) সার্ভার চালু হয়েছে!');
    console.log('PORT: ' + PORT);
    console.log('================================================');
});

});
