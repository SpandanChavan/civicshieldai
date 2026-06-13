const request = require('supertest');
const express = require('express');
const axios = require('axios');
const predictionsRouter = require('../src/routes/predictions');

// Mock Axios
jest.mock('axios');

// Mock Supabase
jest.mock('@supabase/supabase-js', () => {
  return {
    createClient: jest.fn(() => ({
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ 
        data: { 
          id: 'misinfo-1', 
          classification: 'Suspicious', 
          credibility_score: 50 
        } 
      }),
      then: jest.fn((cb) => cb({ data: [{ id: 'misinfo-1' }], error: null })),
    })),
  };
});

const app = express();
app.use(express.json());
app.use('/api/predictions', predictionsRouter);

describe('Predictions API Routes', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('POST /api/predictions/misinformation should classify text', async () => {
    axios.post.mockResolvedValueOnce({
      data: {
        label: 'suspicious',
        confidence: 0.7,
        is_misinformation: false,
        explanation: 'Needs verification'
      }
    });

    const res = await request(app).post('/api/predictions/misinformation').send({
      text: 'This is a long enough text to be classified properly'
    });

    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('classification', 'Suspicious');
    expect(axios.post).toHaveBeenCalledWith(expect.any(String), {
      text: 'This is a long enough text to be classified properly',
      source: null
    });
  });

  it('POST /api/predictions/misinformation should return 400 for short text', async () => {
    const res = await request(app).post('/api/predictions/misinformation').send({
      text: 'Short'
    });
    expect(res.statusCode).toEqual(400);
  });

  it('GET /api/predictions/misinformation/history should return history', async () => {
    const res = await request(app).get('/api/predictions/misinformation/history');
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('data');
  });

  it('GET /api/predictions/flood/:basinId should return flood predictions', async () => {
    axios.post.mockResolvedValueOnce({
      data: {
        prediction: 'high',
        risk_score: 0.85
      }
    });

    const res = await request(app).get('/api/predictions/flood/basin-xyz');
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('risk_score', 0.85);
  });
});
