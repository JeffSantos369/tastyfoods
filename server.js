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

// TON Payments Configuration
const TON_PROVIDER = process.env.TON_PROVIDER || 'https://toncenter.com/api/v2/jsonRPC';
const MERCHANT_WALLET_ADDRESS = process.env.MERCHANT_WALLET_ADDRESS || 'UQDJH...'; // Replace with actual merchant wallet
const TON_NETWORK = process.env.TON_NETWORK || 'mainnet'; // mainnet or testnet
const EXCHANGE_RATE_API = process.env.EXCHANGE_RATE_API || 'https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=brl';

// Initialize TonWeb
let tonweb = null;
let merchantWallet = null;

try {
  const provider = new TonWeb.HttpProvider(TON_PROVIDER, {
    apiKey: process.env.TON_API_KEY || ''
  });
  tonweb = new TonWeb(provider);
  
  // Set merchant wallet address
  if (MERCHANT_WALLET_ADDRESS && MERCHANT_WALLET_ADDRESS !== 'UQDJH...') {
    merchantWallet = new TonWeb.Address(MERCHANT_WALLET_ADDRESS);
  }
} catch (error) {
  console.log('TON Web initialization warning:', error.message);
}

// Exchange rate cache (refresh every 5 minutes)
let exchangeRateCache = {
  rate: 0,
  timestamp: 0
};

// Get TON/BRL exchange rate
async function getTonToBrlRate() {
  const now = Date.now();
  // Use cached rate if less than 5 minutes old
  if (exchangeRateCache.rate > 0 && (now - exchangeRateCache.timestamp) < 5 * 60 * 1000) {
    return exchangeRateCache.rate;
  }
  
  try {
    const response = await fetch(EXCHANGE_RATE_API);
    const data = await response.json();
    const rate = data['the-open-network']?.brl || 0;
    exchangeRateCache = { rate, timestamp: now };
    return rate;
  } catch (error) {
    console.log('Error fetching exchange rate:', error.message);
    // Return default rate if API fails
    return exchangeRateCache.rate || 150; // Default fallback rate
  }
}

// Convert BRL to TON
async function convertBrlToTon(brlAmount) {
  const rate = await getTonToBrlRate();
  if (rate === 0) return 0;
  // Add small buffer for network fees (0.01 TON)
  const tonAmount = (brlAmount / rate) + 0.01;
  return tonAmount;
}

// Load data from JSON files (or use defaults if files do not exist)
let mockCategories = readJsonFile('categories.json') || [
  { id: 1, name: 'Pizzas' },
  { id: 2, name: 'Bebidas' }
];
let mockProducts = readJsonFile('products.json') || [
  { id: 1, name: 'Pizza Margherita', price: 10.99, description: 'Pizza clássica de queijo', category_id: 1 },
  { id: 2, name: 'Pizza de Pepperoni', price: 12.99, description: 'Pizza com pepperoni', category_id: 1 },
  { id: 3, name: 'Pizza Havaiana', price: 13.99, description: 'Pizza com presunto e abacaxi', category_id: 1 },
  { id: 4, name: 'Pizza Vegetariana', price: 11.99, description: 'Pizza com vegetais', category_id: 1 },
  { id: 5, name: 'Pizza de Frango com BBQ', price: 14.99, description: 'Pizza com frango BBQ', category_id: 1 },
  { id: 6, name: 'Coca-Cola', price: 2.99, description: 'Refrigerante de cola', category_id: 2 },
  { id: 7, name: 'Sprite', price: 2.99, description: 'Refrigerante de limão', category_id: 2 },
  { id: 8, name: 'Água', price: 1.99, description: 'Água engarrafada', category_id: 2 }
];
let mockOrders = readJsonFile('orders.json') || [];
let mockPayments = readJsonFile('payments.json') || [];

// Supabase client (if env vars are set and valid)
let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY &&
    process.env.SUPABASE_URL !== 'your_supabase_url_here' &&
    process.env.SUPABASE_ANON_KEY !== 'your_supabase_anon_key_here') {
  try {
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  } catch (error) {
    console.log('Supabase not configured, using mock data:', error.message);
  }
}

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage: storage });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.')); // Serve static files from current directory

// Root route to serve index.html
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// Admin panel route
app.get('/admin', (req, res) => {
  res.sendFile(__dirname + '/admin.html');
});

// Routes
app.get('/categories', async (req, res) => {
  if (supabase) {
    const { data, error } = await supabase.from('categories').select('*');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } else {
    res.json(mockCategories);
  }
});

app.post('/categories', async (req, res) => {
  if (supabase) {
    const { data, error } = await supabase.from('categories').insert([req.body]);
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } else {
    const newCat = { id: mockCategories.length + 1, ...req.body };
    mockCategories.push(newCat);
    writeJsonFile('categories.json', mockCategories);
    res.json([newCat]);
  }
});

app.delete('/categories/:id', async (req, res) => {
  if (supabase) {
    // Check if category has products
    const { data: products, error: productsError } = await supabase.from('products').select('*').eq('category_id', req.params.id);
    if (productsError) return res.status(500).json({ error: productsError.message });
    if (products.length > 0) return res.status(400).json({ error: 'Cannot delete category with products' });

    const { error } = await supabase.from('categories').delete().eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ message: 'Category deleted' });
  } else {
    // Check if category has products
    const hasProducts = mockProducts.some(prod => prod.category_id == req.params.id);
    if (hasProducts) return res.status(400).json({ error: 'Cannot delete category with products' });

    const index = mockCategories.findIndex(cat => cat.id == req.params.id);
    if (index !== -1) {
      mockCategories.splice(index, 1);
      writeJsonFile('categories.json', mockCategories);
      res.json({ message: 'Category deleted' });
    } else {
      res.status(404).json({ error: 'Category not found' });
    }
  }
});

app.get('/products', async (req, res) => {
  if (supabase) {
    const { data, error } = await supabase.from('products').select('*');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } else {
    res.json(mockProducts);
  }
});

app.post('/products', upload.single('image'), async (req, res) => {
  const productData = {
    name: req.body.name,
    price: parseFloat(req.body.price),
    description: req.body.description,
    category_id: parseInt(req.body.category_id),
    image: req.file ? req.file.filename : null
  };

  if (supabase) {
    const { data, error } = await supabase.from('products').insert([productData]);
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } else {
    const newProd = { id: mockProducts.length + 1, ...productData };
    mockProducts.push(newProd);
    writeJsonFile('products.json', mockProducts);
    res.json([newProd]);
  }
});

app.delete('/products/:id', async (req, res) => {
  if (supabase) {
    const { error } = await supabase.from('products').delete().eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ message: 'Product deleted' });
  } else {
    const index = mockProducts.findIndex(prod => prod.id == req.params.id);
    if (index !== -1) {
      mockProducts.splice(index, 1);
      writeJsonFile('products.json', mockProducts);
      res.json({ message: 'Product deleted' });
    } else {
      res.status(404).json({ error: 'Product not found' });
    }
  }
});

app.get('/orders', async (req, res) => {
  if (supabase) {
    const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } else {
    // Sort by created_at descending
    const sortedOrders = [...mockOrders].sort((a, b) => {
      const dateA = a.created_at ? new Date(a.created_at) : new Date(0);
      const dateB = b.created_at ? new Date(b.created_at) : new Date(0);
      return dateB - dateA;
    });
    res.json(sortedOrders);
  }
});

// Get single order by ID
app.get('/orders/:id', async (req, res) => {
  const orderId = parseInt(req.params.id);
  
  if (supabase) {
    const { data, error } = await supabase.from('orders').select('*').eq('id', orderId).single();
    if (error) return res.status(404).json({ error: 'Order not found' });
    res.json(data);
  } else {
    const order = mockOrders.find(o => o.id === orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  }
});

// Update order status
app.put('/orders/:id/status', async (req, res) => {
  const orderId = parseInt(req.params.id);
  const { status } = req.body;
  
  // Validate status
  const validStatuses = ['pending', 'confirmed', 'preparing', 'delivered', 'cancelled'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status. Must be one of: ' + validStatuses.join(', ') });
  }
  
  if (supabase) {
    const { data, error } = await supabase.from('orders').update({ status }).eq('id', orderId);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ message: 'Order status updated', status });
  } else {
    const orderIndex = mockOrders.findIndex(o => o.id === orderId);
    if (orderIndex === -1) return res.status(404).json({ error: 'Order not found' });
    
    mockOrders[orderIndex].status = status;
    mockOrders[orderIndex].updated_at = new Date().toISOString();
    writeJsonFile('orders.json', mockOrders);
    res.json({ message: 'Order status updated', status, order: mockOrders[orderIndex] });
  }
});

// Update full order
app.put('/orders/:id', async (req, res) => {
  const orderId = parseInt(req.params.id);
  const updates = req.body;
  
  // Remove id from updates to prevent changing primary key
  delete updates.id;
  
  if (supabase) {
    const { data, error } = await supabase.from('orders').update(updates).eq('id', orderId);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ message: 'Order updated', updates });
  } else {
    const orderIndex = mockOrders.findIndex(o => o.id === orderId);
    if (orderIndex === -1) return res.status(404).json({ error: 'Order not found' });
    
    mockOrders[orderIndex] = { ...mockOrders[orderIndex], ...updates, updated_at: new Date().toISOString() };
    writeJsonFile('orders.json', mockOrders);
    res.json({ message: 'Order updated', order: mockOrders[orderIndex] });
  }
});

app.post('/orders', async (req, res) => {
  const order = req.body;

  // Server-side minimum order check
  if (!order.total || order.total < 25) {
    return res.status(400).json({ 
      error: 'O pedido mínimo é de R$ 25,00' 
    });
  }

  // Enhanced order data with new fields
  const enhancedOrder = {
    ...order,
    created_at: new Date().toISOString(),
    status: 'pending',
    payment_method: order.payment_method || null,
    customer_notes: order.customer_notes || null
  };

  if (supabase) {
    const { data, error } = await supabase.from('orders').insert([enhancedOrder]);
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } else {
    const newOrder = { id: mockOrders.length + 1, ...enhancedOrder };
    mockOrders.push(newOrder);
    writeJsonFile('orders.json', mockOrders);
    res.json([newOrder]);
  }
});

app.get('/payments', async (req, res) => {
  if (supabase) {
    const { data, error } = await supabase.from('payments').select('*');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } else {
    res.json(mockPayments);
  }
});

app.post('/payments', async (req, res) => {
  if (supabase) {
    // Integrate Ton payment here
    // For now, just insert payment record
    const { data, error } = await supabase.from('payments').insert([req.body]);
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } else {
    const newPayment = { id: mockPayments.length + 1, ...req.body };
    mockPayments.push(newPayment);
    writeJsonFile('payments.json', mockPayments);
    res.json([newPayment]);
  }
});

// TON Payment endpoints
// Create a new payment with TON address
app.post('/payments/create', async (req, res) => {
  try {
    const { order_id, amount_brl, customer_wallet } = req.body;
    
    if (!order_id || !amount_brl) {
      return res.status(400).json({ error: 'order_id and amount_brl are required' });
    }
    
    // Convert BRL to TON
    const tonAmount = await convertBrlToTon(amount_brl);
    const exchangeRate = await getTonToBrlRate();
    
    // Generate payment address (using merchant wallet or a unique address)
    const paymentAddress = MERCHANT_WALLET_ADDRESS !== 'UQDJH...' 
      ? MERCHANT_WALLET_ADDRESS 
      : 'UQDJH_demo_address_for_testing'; // Demo address
    
    // Create payment record
    const payment = {
      id: mockPayments.length + 1,
      order_id,
      amount_brl,
      amount_ton: tonAmount.toFixed(4),
      exchange_rate: exchangeRate,
      payment_address: paymentAddress,
      status: 'pending',
      customer_wallet: customer_wallet || '',
      created_at: new Date().toISOString()
    };
    
    mockPayments.push(payment);
    writeJsonFile('payments.json', mockPayments);
    
    res.json({
      success: true,
      payment: {
        id: payment.id,
        order_id: payment.order_id,
        amount_brl: payment.amount_brl,
        amount_ton: payment.amount_ton,
        exchange_rate: payment.exchange_rate,
        payment_address: payment.payment_address,
        status: payment.status,
        qr_code_url: `https://ton.center/transfer/${paymentAddress}?amount=${Math.floor(tonAmount * 1000000000)}`
      }
    });
  } catch (error) {
    console.error('Error creating payment:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get payment status
app.get('/payments/:id/status', async (req, res) => {
  try {
    const paymentId = parseInt(req.params.id);
    const payment = mockPayments.find(p => p.id === paymentId);
    
    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    
    // In a real implementation, we would check the TON blockchain for incoming transactions
    // For demo purposes, we'll simulate payment confirmation after some time
    // or allow manual confirmation
    
    res.json({
      id: payment.id,
      order_id: payment.order_id,
      amount_brl: payment.amount_brl,
      amount_ton: payment.amount_ton,
      payment_address: payment.payment_address,
      status: payment.status,
      created_at: payment.created_at
    });
  } catch (error) {
    console.error('Error getting payment status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Simulate payment confirmation (for demo purposes)
app.post('/payments/:id/confirm', async (req, res) => {
  try {
    const paymentId = parseInt(req.params.id);
    const paymentIndex = mockPayments.findIndex(p => p.id === paymentId);
    
    if (paymentIndex === -1) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    
    mockPayments[paymentIndex].status = 'confirmed';
    mockPayments[paymentIndex].confirmed_at = new Date().toISOString();
    writeJsonFile('payments.json', mockPayments);
    
    res.json({
      success: true,
      payment: mockPayments[paymentIndex]
    });
  } catch (error) {
    console.error('Error confirming payment:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get exchange rate
app.get('/exchange-rate', async (req, res) => {
  try {
    const rate = await getTonToBrlRate();
    res.json({
      ton_to_brl: rate,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting exchange rate:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
