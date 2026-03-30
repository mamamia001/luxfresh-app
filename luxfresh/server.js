const express = require('express');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const multer = require('multer');
const app = express();

app.use(express.json());

// --- FIX: ENHANCED STATIC FILE SERVING ---
// This ensures Render finds your 'public' folder accurately
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

// --- FIX: EXPLICIT ROUTE FOR HOME PAGE ---
// If 'Cannot GET /' persists, this forces the server to send your HTML file
app.get('/', (req, res) => {
    const indexPath = path.join(publicPath, 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send("Error: index.html not found in public folder. Check your GitHub files!");
    }
});

// --- PERSISTENT STORAGE SETUP ---
const DATA_DIR = process.env.RENDER_DISK_PATH || path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

app.use('/uploads', express.static(UPLOADS_DIR));

const inventoryPath = path.join(DATA_DIR, 'inventory.json');
const ordersPath = path.join(DATA_DIR, 'orders.json');
const annPath = path.join(DATA_DIR, 'announcements.json');

const initFile = (filePath, content) => {
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
};

initFile(inventoryPath, []);
initFile(ordersPath, []);
initFile(annPath, { 
    text: "Fresh arrivals daily!", active: true, themeColor: "#16a34a",
    location: "Kabarnet, Baringo", whatsapp: "254700000000", hours: "6AM - 8PM", youtube: "The Maker's Voice"
});

// --- IMAGE UPLOAD ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// --- API ROUTES ---
app.get('/api/products', (req, res) => res.json(JSON.parse(fs.readFileSync(inventoryPath))));
app.get('/api/announcement', (req, res) => res.json(JSON.parse(fs.readFileSync(annPath))));
app.get('/api/orders', (req, res) => res.json(JSON.parse(fs.readFileSync(ordersPath))));

app.post('/api/upload', upload.single('image'), (req, res) => res.json({ imageUrl: `/uploads/${req.file.filename}` }));

app.post('/api/update-inventory', (req, res) => {
    fs.writeFileSync(inventoryPath, JSON.stringify(req.body, null, 2));
    res.sendStatus(200);
});

// --- M-PESA STK PUSH (SANDBOX) ---
const shortCode = "174379", passkey = "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919";
const cKey = "FIGoha3T6fzetlyQkJz1AAyytH9MvtzkmM8o2SAUnZafGM9H", cSecret = "X6dDIGzVNA5GG50da9REAj3kuGcPpgK5g7JNKAn2b7Lhwyt5ApvScnzQQu4JoE59";

async function getAuth() {
    const auth = Buffer.from(`${cKey}:${cSecret}`).toString('base64');
    try {
        const res = await axios.get("https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials", { headers: { Authorization: `Basic ${auth}` } });
        return res.data.access_token;
    } catch { return null; }
}

app.post('/api/stkpush', async (req, res) => {
    const { phone, amount, items } = req.body;
    const token = await getAuth();
    const ts = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
    const pass = Buffer.from(shortCode + passkey + ts).toString('base64');
    
    // Auto-detect Render URL for Callback
    const host = req.get('host');
    const protocol = req.protocol;
    const callbackUrl = `${protocol}://${host}/api/callback`;

    try {
        await axios.post("https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest", {
            BusinessShortCode: shortCode, Password: pass, Timestamp: ts, TransactionType: "CustomerPayBillOnline",
            Amount: amount, PartyA: phone.replace(/^0/, '254'), PartyB: shortCode, PhoneNumber: phone.replace(/^0/, '254'),
            CallBackURL: callbackUrl, 
            AccountReference: "LuxFresh", TransactionDesc: "Grocery Order"
        }, { headers: { Authorization: `Bearer ${token}` } });
        
        const ords = JSON.parse(fs.readFileSync(ordersPath));
        ords.push({ id: Date.now(), phone, amount, items, status: "PENDING", time: new Date().toLocaleString() });
        fs.writeFileSync(ordersPath, JSON.stringify(ords, null, 2));
        res.sendStatus(200);
    } catch { res.status(500).send("STK Error"); }
});

app.post('/api/callback', (req, res) => {
    const result = req.body.Body.stkCallback;
    if (result.ResultCode === 0) {
        const ords = JSON.parse(fs.readFileSync(ordersPath));
        const phoneItem = result.CallbackMetadata.Item.find(i => i.Name === "PhoneNumber");
        if(phoneItem) {
            const phone = phoneItem.Value.toString();
            const lastOrder = ords.slice().reverse().find(o => phone.includes(o.phone.slice(-9)));
            if(lastOrder) lastOrder.status = "PAID ✅";
            fs.writeFileSync(ordersPath, JSON.stringify(ords, null, 2));
        }
    }
    res.json({ ResultCode: 0 });
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`LUXFRESH ONLINE ON PORT ${PORT}`));
