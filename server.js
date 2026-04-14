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
const UPLOADS_DIR = path.join(__dirname, 'uploads');

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
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// IMPORTANT: Define API routes BEFORE static files
// (Static files will be served last to avoid conflicts)

// Supabase Client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
let supabase = null;
if (supabaseUrl && supabaseKey && supabaseUrl.trim().length > 0 && supabaseKey.trim().length > 0) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
  } catch (error) {
    console.log('Supabase initialization skipped, using file-based storage');
  }
}

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
  res.sendFile(path.join(__dirname, 'index.html'));
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

app.delete('/categories/:id', async (req, res) => {
  const { id } = req.params;
  try {
    if (supabase) {
      const { error } = await supabase.from('categories').delete().eq('id', id);
      if (error) throw error;
      res.json({ success: true });
    } else {
      mockCategories = mockCategories.filter(cat => cat.id != id);
      writeJsonFile('categories.json', mockCategories);
      res.json({ success: true });
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
        image: image
      };
      mockProducts.push(newProduct);
      writeJsonFile('products.json', mockProducts);
      res.json(newProduct);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/products/:id', async (req, res) => {
  const { id } = req.params;
  try {
    if (supabase) {
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) throw error;
      res.json({ success: true });
    } else {
      mockProducts = mockProducts.filter(prod => prod.id != id);
      writeJsonFile('products.json', mockProducts);
      res.json({ success: true });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/products/:id', upload.single('image'), async (req, res) => {
  const { id } = req.params;
  const { name, category_id, price, description } = req.body;
  const image = req.file?.filename || null;

  try {
    if (supabase) {
      const updateData = {
        name,
        category_id: parseInt(category_id),
        price: parseFloat(price),
        description
      };
      if (image) {
        updateData.image = image;
      }
      const { data, error } = await supabase.from('products').update(updateData).eq('id', id).select();
      if (error) throw error;
      res.json(data[0]);
    } else {
      const productIndex = mockProducts.findIndex(p => p.id == id);
      if (productIndex !== -1) {
        mockProducts[productIndex] = {
          ...mockProducts[productIndex],
          name,
          category_id: parseInt(category_id),
          price: parseFloat(price),
          description,
          ...(image && { image })
        };
        writeJsonFile('products.json', mockProducts);
        res.json(mockProducts[productIndex]);
      } else {
        res.status(404).json({ error: 'Product not found' });
      }
    }
  } catch (error) {
    console.error('Error updating product:', error);
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
  const { customer_name, customer_email, customer_phone, delivery_address, items, total, payment_method, customer_notes } = req.body;

  try {
    if (supabase) {
      const { data, error } = await supabase.from('orders').insert({
        customer_name,
        customer_email,
        customer_phone,
        delivery_address,
        items: JSON.stringify(items),
        total,
        payment_method,
        customer_notes,
        status: 'pending',
        created_at: new Date().toISOString()
      }).select();
      if (error) throw error;
      res.json(data[0]);
    } else {
      const newOrder = {
        id: mockOrders.length + 1,
        customer_name,
        customer_email,
        customer_phone,
        delivery_address,
        items,
        total,
        payment_method,
        customer_notes,
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

app.put('/orders/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    if (supabase) {
      const { data, error } = await supabase.from('orders').update({ status, updated_at: new Date().toISOString() }).eq('id', id).select();
      if (error) throw error;
      res.json(data[0]);
    } else {
      const order = mockOrders.find(o => o.id == id);
      if (order) {
        order.status = status;
        order.updated_at = new Date().toISOString();
        writeJsonFile('orders.json', mockOrders);
        res.json(order);
      } else {
        res.status(404).json({ error: 'Order not found' });
      }
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Payments
app.get('/payments', async (req, res) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  try {
    if (supabase) {
      const { data, error } = await supabase.from('payments').select('*');
      if (error) throw error;
      res.json(data || []);
    } else {
      res.json(mockPayments);
    }
  } catch (error) {
    console.error('Erro ao listar pagamentos:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/payments/create', async (req, res) => {
  const { order_id, amount_brl, customer_wallet } = req.body;

  try {
    const rate = await getTonToBrlRate();
    const amount_ton = rate > 0 ? (amount_brl / rate).toFixed(4) : 0;
    const payment_address = MERCHANT_WALLET_ADDRESS || 'UQDJmJcwf5x8m_gf3z1z0z1z0z1z0z1z0';

    if (supabase) {
      const { data, error } = await supabase.from('payments').insert({
        order_id,
        amount_brl,
        amount_ton,
        payment_address,
        customer_wallet,
        exchange_rate: rate,
        status: 'pending',
        created_at: new Date().toISOString()
      }).select();
      if (error) throw error;
      res.json({ success: true, payment: data[0] });
    } else {
      const newPayment = {
        id: mockPayments.length + 1,
        order_id,
        amount_brl,
        amount_ton,
        payment_address,
        customer_wallet,
        exchange_rate: rate,
        status: 'pending',
        created_at: new Date().toISOString()
      };
      mockPayments.push(newPayment);
      writeJsonFile('payments.json', mockPayments);
      res.json({ success: true, payment: newPayment });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/payments/:id/status', async (req, res) => {
  const { id } = req.params;
  try {
    if (supabase) {
      const { data, error } = await supabase.from('payments').select('status').eq('id', id).single();
      if (error) throw error;
      res.json(data);
    } else {
      const payment = mockPayments.find(p => p.id == id);
      if (payment) {
        res.json({ status: payment.status });
      } else {
        res.status(404).json({ error: 'Payment not found' });
      }
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

// Serve static files AFTER all API routes
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(__dirname));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Customer site: http://localhost:${PORT}`);
  console.log(`Admin panel: http://localhost:${PORT}/admin.html`);
});