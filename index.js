import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import 'dotenv/config';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ 
    status: 'ok', 
    app: 'DealRadar',
    timestamp: new Date().toISOString() 
  });
});

app.get('/', (_req, res) => {
  res.json({ 
    message: 'DealRadar API is running 🏠',
    version: '1.0.0',
    endpoints: ['/health', '/api/properties', '/api/auth/login']
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🏠 DealRadar server running on port ${PORT}`);
});
