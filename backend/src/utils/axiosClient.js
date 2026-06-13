const axios = require('axios');
const axiosRetry = require('axios-retry').default || require('axios-retry');

// Create a custom axios instance
const client = axios.create();

// Apply retry logic with exponential backoff
axiosRetry(client, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error) => {
    // Retry on network errors or 5xx status codes
    return axiosRetry.isNetworkOrIdempotentRequestError(error) || error.code === 'ECONNABORTED';
  }
});

module.exports = client;
