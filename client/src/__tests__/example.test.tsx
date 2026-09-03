import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

const TestComponent = () => <div data-testid="test-element">Hello, Howdy Radio!</div>;

describe('TestComponent', () => {
  it('renders correctly', () => {
    render(<TestComponent />);
    expect(screen.getByTestId('test-element')).toHaveTextContent('Hello, Howdy Radio!');
  });
});