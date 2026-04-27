import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import 'dotenv/config';
import router from './auth.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(cors({
  origin: ['https://joelas613-dev.github.io', 'http://localhost:3000'],
  credentials: true
}));
app.use(express.json());

app.use('/api', router);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', app: 'DealRadar', timestamp: new Date().toISOString() });
});

app.get('/', (_req, res) => {
  res.json({ message: 'DealRadar API is running 🏠', version: '1.0.0' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🏠 DealRadar server running on port ${PORT}`);
});
