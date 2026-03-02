require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const TonWeb = require('tonweb');

// Data file paths
const DATA_DIR = path.join(__dirname, 'data');

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
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error(`Error writing ${filename}:`, error.message);
    return false;
  }
}

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware global
app.use(cors());
app.use(express.json());

// Serve arquivos estáticos da raiz (CSS, JS, HTML, imagens, etc.)
app.use(express.static(path.join(__dirname)));

// Serve explicitamente a pasta uploads (para imagens de produtos)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Rotas explícitas para páginas HTML (garante que Vercel sirva corretamente)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// Supabase Client (se configurado)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// Mock data se Supabase não estiver configurado
let mockCategories = readJsonFile('categories.json') || [];
let mockProducts = readJsonFile('products.json') || [];
let mockOrders = readJsonFile('orders.json') || [];
let mockPayments = readJsonFile('payments.json') || [];

// TON Payments Configuration
const TON_PROVIDER = process.env.TON_PROVIDER || 'https://toncenter.com/api/v2/jsonRPC';
const MERCHANT_WALLET_ADDRESS = process.env.MERCHANT_WALLET_ADDRESS || 'UQDJH...'; // Substitua pelo real
const TON_NETWORK = process.env.TON_NETWORK || 'mainnet';
const EXCHANGE_RATE_API = process.env.EXCHANGE_RATE_API || 'https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=brl';

// Initialize TonWeb
let tonweb = null;
let merchantWallet = null;

try {
  const provider = new TonWeb.HttpProvider(TON_PROVIDER, {
    apiKey: process.env.TON_API_KEY || ''
  });
  tonweb = new TonWeb(provider);

  if (MERCHANT_WALLET_ADDRESS && MERCHANT_WALLET_ADDRESS !== 'UQDJH...') {
    merchantWallet = new TonWeb.Address(MERCHANT_WALLET_ADDRESS);
  }
} catch (error) {
  console.log('TON Web initialization warning:', error.message);
}

// Exchange rate cache
let exchangeRateCache = { rate: 0, timestamp: 0 };

// Get TON/BRL rate
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
    console.error('Error fetching exchange rate:', error);
    return 0;
  }
}

// Multer for product image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// Categories Routes
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
  if (!name) return res.status(400).json({ error: 'Nome da categoria é obrigatório' });

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

// Products Routes (exemplo básico – adicione mais rotas se precisar)
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

// ... (insira aqui o restante do seu código original para orders, payments, upload de produtos, etc.
// Exemplo: rotas de orders, payments, POST /products com upload, etc.
// Não remova nem altere as partes que já funcionavam localmente)

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});