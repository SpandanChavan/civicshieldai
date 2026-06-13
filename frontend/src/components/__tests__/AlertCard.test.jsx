import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import AlertCard from '../alerts/AlertCard';

// Mock translation hook
vi.mock('@/utils/i18n', () => ({
  useTranslation: () => ({
    t: (key) => key,
  }),
}));

describe('AlertCard', () => {
  const mockEvent = {
    id: 'evt-1',
    event_type: 'Flood',
    severity: 'High',
    title: 'River overflowing',
    detected_at: new Date().toISOString(),
    is_active: true
  };

  it('renders event details correctly', () => {
    render(<AlertCard event={mockEvent} onClick={() => {}} />);
    expect(screen.getByText('Flood')).toBeInTheDocument();
    expect(screen.getByText(/High/i)).toBeInTheDocument();
    expect(screen.getByText('River overflowing')).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const handleClick = vi.fn();
    render(<AlertCard event={mockEvent} onClick={handleClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
    expect(handleClick).toHaveBeenCalledWith(mockEvent);
  });
});
