const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Serve static files from 'public' directory
app.use(express.static(path.join(__dirname, '../public')));

// Routes
const authRouter = require('./routes/auth');
const shiftsRouter = require('./routes/shifts');
const customersRouter = require('./routes/customers');
const tanksRouter = require('./routes/tanks');

app.use('/api/auth', authRouter);
app.use('/api/shifts', shiftsRouter);
app.use('/api/customers', customersRouter);
app.use('/api/tanks', tanksRouter);

module.exports = {
  app
};
