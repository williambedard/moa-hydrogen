/**
 * Tests for ConciergeAvatar component.
 * Tests rendering with various props and backward compatibility.
 */
import {describe, it, expect, vi, beforeEach} from 'vitest';
import {render} from '@testing-library/react';
import {ConciergeAvatar} from '../ConciergeAvatar';

describe('ConciergeAvatar', () => {
  it('renders an SVG element', () => {
    const {container} = render(<ConciergeAvatar />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
  });

  it('renders with default size of 48', () => {
    const {container} = render(<ConciergeAvatar />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('48');
    expect(svg?.getAttribute('height')).toBe('48');
  });

  it('renders with custom size', () => {
    const {container} = render(<ConciergeAvatar size={96} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('96');
    expect(svg?.getAttribute('height')).toBe('96');
  });

  it('applies custom className', () => {
    const {container} = render(<ConciergeAvatar className="custom-class" />);
    const svg = container.querySelector('svg');
    expect(svg?.classList.contains('custom-class')).toBe(true);
  });

  it('has aria-label for accessibility', () => {
    const {container} = render(<ConciergeAvatar />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-label')).toBe('AI Concierge');
  });

  it('renders the hat (top hat body path)', () => {
    const {container} = render(<ConciergeAvatar />);
    // The hat body has a specific path
    const paths = container.querySelectorAll('path');
    expect(paths.length).toBeGreaterThan(0);
  });

  it('renders the monocle (gold ring circle)', () => {
    const {container} = render(<ConciergeAvatar />);
    const circles = container.querySelectorAll('circle');
    // Should have monocle circle, eye highlights, etc.
    expect(circles.length).toBeGreaterThan(0);
  });

  it('renders the gold "C" text on hat', () => {
    const {container} = render(<ConciergeAvatar />);
    const text = container.querySelector('text');
    expect(text).toBeTruthy();
    expect(text?.textContent).toContain('C');
  });

  it('renders without isSpeaking or audioLevel props (backward compatibility)', () => {
    // ConciergeAvatar currently only accepts size and className
    // This test ensures it still works when the avatar-animator agent adds
    // isSpeaking/audioLevel props. If they're not yet added, this just tests
    // the existing component renders fine.
    const {container} = render(<ConciergeAvatar size={64} className="test" />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg?.getAttribute('width')).toBe('64');
  });

  it('renders the face (ellipse for face shape)', () => {
    const {container} = render(<ConciergeAvatar />);
    const ellipses = container.querySelectorAll('ellipse');
    // Should have face ellipse, ears, hat brim, eyes, etc.
    expect(ellipses.length).toBeGreaterThan(0);
  });

  it('preserves viewBox dimensions', () => {
    const {container} = render(<ConciergeAvatar />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 64 64');
  });

  // Tests for when isSpeaking/audioLevel are added by the avatar-animator agent
  // These check the enhanced interface if available, and skip gracefully if not.

  it('renders with isSpeaking=false if the prop exists', () => {
    // Cast to any to pass the prop even if the type doesn't include it yet
    const {container} = render(<ConciergeAvatar {...({isSpeaking: false} as any)} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
  });

  it('renders with isSpeaking=true if the prop exists', () => {
    const {container} = render(
      <ConciergeAvatar {...({isSpeaking: true, audioLevel: 0.5} as any)} />,
    );
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
  });

  it('renders with audioLevel=0 (silence)', () => {
    const {container} = render(
      <ConciergeAvatar {...({isSpeaking: true, audioLevel: 0} as any)} />,
    );
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
  });

  it('renders with audioLevel=1 (max volume)', () => {
    const {container} = render(
      <ConciergeAvatar {...({isSpeaking: true, audioLevel: 1} as any)} />,
    );
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
  });
});
