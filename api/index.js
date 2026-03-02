require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const TonWeb = require('tonweb');

// Get parent directory for data files
const DATA_DIR = path.join(__dirname, '..', 'data');
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

// Helper functions for JSON file operations
function readJsonFile(filename) {
  const filepath = path.join(DATA_DIR, filename);
  try {
    if (fs.existsSync(filepath)) {
      const data = fs.readFileSync(filepath, 'utf8');
      return JSON.parse(data);
    }
    return null;
  } catch (error) {
    console.error(`Error reading ${filename}:`, error.message);
    return null;
  }
}

function writeJsonFile(filename, data) {
  const filepath = path.join(DATA_DIR, filename);
  try {
    // Ensure directory exists
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error(`Error writing ${filename}:`, error.message);
    return false;
  }
}

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from root directory
const rootDir = path.join(__dirname, '..');
app.use(express.static(rootDir));
app.use('/uploads', express.static(UPLOADS_DIR));

// Supabase Client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// Default seed data
const defaultCategories = [
  { id: 1, name: "Pizzas" },
  { id: 2, name: "Bebidas" },
  { id: 5, name: "teste nova categoria" }
];

const defaultProducts = [
  { id: 2, name: "Pizza de Pepperoni", price: 12.99, description: "Pizza com pepperoni", category_id: 1 },
  { id: 3, name: "Pizza Havaiana", price: 13.99, description: "Pizza com presunto e abacaxi", category_id: 1 },
  { id: 4, name: "Pizza Vegetariana", price: 11.99, description: "Pizza com vegetais", category_id: 1 },
  { id: 5, name: "Pizza de Frango com BBQ", price: 14.99, description: "Pizza com frango BBQ", category_id: 1 },
  { id: 6, name: "Coca-Cola", price: 2.99, description: "Refrigerante de cola", category_id: 2 },
  { id: 7, name: "Sprite", price: 2.99, description: "Refrigerante de limão", category_id: 2 },
  { id: 8, name: "Água", price: 1.99, description: "Água engarrafada", category_id: 2 }
];

// Mock data
let mockCategories = readJsonFile('categories.json') || defaultCategories;
let mockProducts = readJsonFile('products.json') || defaultProducts;
let mockOrders = readJsonFile('orders.json') || [];
let mockPayments = readJsonFile('payments.json') || [];

// TON Configuration
const TON_PROVIDER = process.env.TON_PROVIDER || 'https://toncenter.com/api/v2/jsonRPC';
const MERCHANT_WALLET_ADDRESS = process.env.MERCHANT_WALLET_ADDRESS || '';
const TON_NETWORK = process.env.TON_NETWORK || 'mainnet';
const EXCHANGE_RATE_API = process.env.EXCHANGE_RATE_API || 'https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=brl';

let tonweb = null;
let merchantWallet = null;

try {
  const provider = new TonWeb.HttpProvider(TON_PROVIDER, {
    apiKey: process.env.TON_API_KEY || ''
  });
  tonweb = new TonWeb(provider);
  
  if (MERCHANT_WALLET_ADDRESS && MERCHANT_WALLET_ADDRESS !== '') {
    merchantWallet = new TonWeb.Address(MERCHANT_WALLET_ADDRESS);
  }
} catch (error) {
  console.log('TON Web init warning:', error.message);
}

// Exchange rate cache
let exchangeRateCache = { rate: 0, timestamp: 0 };

async function getTonToBrlRate() {
  const now = Date.now();
  if (exchangeRateCache.rate > 0 && now - exchangeRateCache.timestamp < 5 * 60 * 1000) {
    return exchangeRateCache.rate;
  }

  try {
    const response = await fetch(EXCHANGE_RATE_API);
    const data = await response.json();
    const rate = data['the-open-network']?.brl || 0;
    exchangeRateCache = { rate, timestamp: now };
    return rate;
  } catch (error) {
    console.error('Error fetching rate:', error);
    return 0;
  }
}

// Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// Root redirect
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// Categories
app.get('/categories', async (req, res) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  try {
    if (supabase) {
      const { data, error } = await supabase.from('categories').select('*');
      if (error) throw error;
      res.json(data || []);
    } else {
      res.json(mockCategories);
    }
  } catch (error) {
    console.error('Erro ao listar categorias:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/categories', async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome obrigatório' });

  try {
    if (supabase) {
      const { data, error } = await supabase.from('categories').insert({ name }).select();
      if (error) throw error;
      res.json(data[0]);
    } else {
      const newCategory = { id: mockCategories.length + 1, name };
      mockCategories.push(newCategory);
      writeJsonFile('categories.json', mockCategories);
      res.json(newCategory);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Products
app.get('/products', async (req, res) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  try {
    if (supabase) {
      const { data, error } = await supabase.from('products').select('*');
      if (error) throw error;
      res.json(data || []);
    } else {
      res.json(mockProducts);
    }
  } catch (error) {
    console.error('Erro ao listar produtos:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/products', upload.single('image'), async (req, res) => {
  const { name, category_id, price, description } = req.body;
  const image = req.file?.filename || null;

  try {
    if (supabase) {
      const { data, error } = await supabase.from('products').insert({
        name,
        category_id: parseInt(category_id),
        price: parseFloat(price),
        description,
        image_url: image
      }).select();
      if (error) throw error;
      res.json(data[0]);
    } else {
      const newProduct = {
        id: mockProducts.length + 1,
        name,
        category_id: parseInt(category_id),
        price: parseFloat(price),
        description,
        image_url: image
      };
      mockProducts.push(newProduct);
      writeJsonFile('products.json', mockProducts);
      res.json(newProduct);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Orders
app.get('/orders', async (req, res) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  try {
    if (supabase) {
      const { data, error } = await supabase.from('orders').select('*');
      if (error) throw error;
      res.json(data || []);
    } else {
      res.json(mockOrders);
    }
  } catch (error) {
    console.error('Erro ao listar pedidos:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/orders', async (req, res) => {
  const { name, email, phone, address, items, total, payment_method, notes } = req.body;

  try {
    if (supabase) {
      const { data, error } = await supabase.from('orders').insert({
        customer_name: name,
        customer_email: email,
        customer_phone: phone,
        delivery_address: address,
        items: JSON.stringify(items),
        total_price: parseFloat(total),
        payment_method,
        customer_notes: notes,
        status: 'pending'
      }).select();
      if (error) throw error;
      res.json(data[0]);
    } else {
      const newOrder = {
        id: mockOrders.length + 1,
        customer_name: name,
        customer_email: email,
        customer_phone: phone,
        delivery_address: address,
        items,
        total_price: parseFloat(total),
        payment_method,
        customer_notes: notes,
        status: 'pending',
        created_at: new Date().toISOString()
      };
      mockOrders.push(newOrder);
      writeJsonFile('orders.json', mockOrders);
      res.json(newOrder);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Payments
app.post('/payments', async (req, res) => {
  const { order_id, payment_method, amount } = req.body;

  try {
    if (supabase) {
      const { data, error } = await supabase.from('payments').insert({
        order_id,
        payment_method,
        amount: parseFloat(amount),
        status: 'pending'
      }).select();
      if (error) throw error;
      res.json(data[0]);
    } else {
      const newPayment = {
        id: mockPayments.length + 1,
        order_id,
        payment_method,
        amount: parseFloat(amount),
        status: 'pending',
        created_at: new Date().toISOString()
      };
      mockPayments.push(newPayment);
      writeJsonFile('payments.json', mockPayments);
      res.json(newPayment);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Exchange Rate
app.get('/exchange-rate', async (req, res) => {
  try {
    const rate = await getTonToBrlRate();
    res.json({ rate });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Export for Vercel
module.exports = app;
