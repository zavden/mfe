import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Section } from '../Section';

describe('Section', () => {
  it('is a titled section, neutral unless it names its tone, with its actions in the header', () => {
    render(
      <>
        <Section title="Intro" testId="intro-section" tone="intro" actions={<button>Add</button>}>
          body
        </Section>
        <Section title="Brace" testId="attachment-section">
          other
        </Section>
      </>,
    );
    const intro = screen.getByTestId('intro-section');
    expect(intro).toHaveClass('an-section');
    expect(intro).toHaveAttribute('data-tone', 'intro');
    expect(intro.querySelector('h3')).toHaveTextContent('Intro');
    expect(intro.querySelector('header')).toContainElement(
      screen.getByRole('button', { name: 'Add' }),
    );
    expect(screen.getByTestId('attachment-section')).not.toHaveAttribute('data-tone');
  });
});
