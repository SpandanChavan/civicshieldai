import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import MisinformationPanel from '../dashboard/MisinformationPanel';
import { backendApi } from '@/services/backendApi';

// Mock axios
vi.mock('axios');
import axios from 'axios';

// Need to mock the backendApi service since the component uses it
vi.mock('@/services/backendApi', () => ({
  backendApi: {
    post: vi.fn(),
    get: vi.fn(),
  }
}));

describe('MisinformationPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    backendApi.get.mockResolvedValue({ data: [] });
  });

  it('renders correctly', async () => {
    render(<MisinformationPanel />);
    expect(screen.getByText(/Misinformation Detector/i)).toBeInTheDocument();
    
    // Wait for initial history fetch
    await waitFor(() => {
      expect(backendApi.get).toHaveBeenCalledWith('/predictions/misinformation/history');
    });
  });

  it('allows text input and submission', async () => {
    backendApi.post.mockResolvedValueOnce({
      classification: 'Suspicious',
      credibilityScore: 45,
      confidence: 80,
      explanation: 'Testing explanation',
      id: 'test-id',
      analyzedAt: new Date().toISOString()
    });

    render(<MisinformationPanel />);
    
    const textarea = screen.getByPlaceholderText(/Paste a WhatsApp forward/i);
    fireEvent.change(textarea, { target: { value: 'This is a test article to verify misinformation.' } });
    
    const analyzeButton = screen.getByText(/Analyze/i);
    fireEvent.click(analyzeButton);

    await waitFor(() => {
      expect(backendApi.post).toHaveBeenCalledWith('/predictions/misinformation', {
        text: 'This is a test article to verify misinformation.'
      });
    });

    // Check if result is displayed
    const badges = await screen.findAllByText(/Suspicious/i);
    expect(badges.length).toBeGreaterThan(0);
  });
});
