const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 10000;

// --- CONFIGURATION ---
app.use(express.json());
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

// Setup Image Uploads Folder
const uploadDir = path.join(publicPath, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// --- DATA PERSISTENCE ---
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const getFile = (name, def) => {
    const p = path.join(DATA_DIR, name);
    return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p)) : def;
};
const saveFile = (name, data) => fs.writeFileSync(path.join(DATA_DIR, name), JSON.stringify(data));

// --- FIX: EXPLICIT ROUTE FOR HOME PAGE ---
app.get('/', (req, res) => {
    const indexPath = path.join(publicPath, 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send("Error: index.html not found in public folder. Check GitHub names!");
    }
});

// --- API ROUTES ---

// 1. Inventory
app.get('/api/products', (req, res) => res.json(getFile('products.json', [])));
app.post('/api/update-inventory', (req, res) => { saveFile('products.json', req.body); res.json({ s: 1 }); });

// 2. Slideshow
app.get('/api/slides', (req, res) => res.json(getFile('slides.json', [])));
app.post('/api/update-slides', (req, res) => { saveFile('slides.json', req.body); res.json({ s: 1 }); });

// 3. Announcements & Settings
app.get('/api/announcement', (req, res) => res.json(getFile('ann.json', { text: '', active: false })));
app.post('/api/update-announcement', (req, res) => { saveFile('ann.json', req.body); res.json({ s: 1 }); });

// 4. Orders
app.get('/api/orders', (req, res) => res.json(getFile('orders.json', [])));

// 5. Image Upload Handler
app.post('/api/upload', upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).send("No file uploaded.");
    res.json({ imageUrl: `/uploads/${req.file.filename}` });
});

app.listen(PORT, () => console.log(`LuxFresh Server active on port ${PORT}`));
