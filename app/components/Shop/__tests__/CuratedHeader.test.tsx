/**
 * Tests for the CuratedHeader component.
 * Verifies rendering with/without background image, flourish, and subtitle.
 */
import {describe, it, expect} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';
import {CuratedHeader} from '../CuratedHeader';

describe('CuratedHeader', () => {
  describe('without image', () => {
    it('renders title and subtitle with beige background', () => {
      const {container} = render(
        <CuratedHeader title="Top Picks" subtitle="Curated for you" />,
      );

      expect(screen.getByText('Top Picks')).toBeTruthy();
      expect(screen.getByText('Curated for you')).toBeTruthy();

      // No img element
      const img = container.querySelector('img');
      expect(img).toBeNull();

      // Has beige background
      const section = container.querySelector('section');
      expect(section?.className).toContain('bg-[#e9e5e0]');
    });

    it('renders without subtitle when not provided', () => {
      const {container} = render(<CuratedHeader title="Top Picks" />);

      expect(screen.getByText('Top Picks')).toBeTruthy();

      // No paragraph element for subtitle
      const paragraphs = container.querySelectorAll('p');
      expect(paragraphs.length).toBe(0);
    });
  });

  describe('with image', () => {
    it('renders an img element with the imageUrl as src', () => {
      const {container} = render(
        <CuratedHeader
          title="Summer Collection"
          subtitle="Fresh looks"
          imageUrl="https://example.com/hero.png"
        />,
      );

      const img = container.querySelector('img');
      expect(img).not.toBeNull();
      expect(img?.getAttribute('src')).toBe('https://example.com/hero.png');
    });

    it('image starts with opacity 0 before onLoad fires', () => {
      const {container} = render(
        <CuratedHeader
          title="Summer"
          imageUrl="https://example.com/hero.png"
        />,
      );

      const img = container.querySelector('img');
      expect(img).not.toBeNull();
      // Before onLoad, opacity should be 0
      expect(img?.style.opacity).toBe('0');
    });

    it('image becomes visible after onLoad fires', () => {
      const {container} = render(
        <CuratedHeader
          title="Summer"
          imageUrl="https://example.com/hero.png"
        />,
      );

      const img = container.querySelector('img')!;
      fireEvent.load(img);

      expect(img.style.opacity).toBe('1');
    });
  });

  describe('flourish', () => {
    it('shows flourish SVG by default (showFlourish defaults to true)', () => {
      const {container} = render(<CuratedHeader title="Picks" />);

      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
    });

    it('hides flourish SVG when showFlourish is false', () => {
      const {container} = render(
        <CuratedHeader title="Picks" showFlourish={false} />,
      );

      const svg = container.querySelector('svg');
      expect(svg).toBeNull();
    });

    it('shows flourish SVG when imageUrl is present', () => {
      const {container} = render(
        <CuratedHeader title="Picks" imageUrl="https://example.com/img.png" />,
      );

      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
    });

    it('hides flourish SVG when imageUrl is present but showFlourish is false', () => {
      const {container} = render(
        <CuratedHeader
          title="Picks"
          imageUrl="https://example.com/img.png"
          showFlourish={false}
        />,
      );

      const svg = container.querySelector('svg');
      expect(svg).toBeNull();
    });
  });
});
